//! IS-3 bulk ingest tuning — drop write-heavy indexes, restore at end.
//!
//! Most secondary `track` indexes are unnecessary during the initial
//! upsert-only pass but cost several index inserts per row. `idx_track_album`
//! stays live because other servers can still browse while one server ingests.
//! The suspended indexes are recreated once before FTS rebuild.

use rusqlite::{Connection, OptionalExtension};

const TRACK_SECONDARY_INDEX_NAMES: [&str; 10] = [
    "idx_track_album",
    "idx_track_artist",
    "idx_track_updated",
    "idx_track_starred",
    "idx_track_library",
    "idx_track_bpm",
    "idx_track_isrc",
    "idx_track_remap_path",
    "idx_track_remap_hash",
    "idx_track_title",
];

const DROP_TRACK_SECONDARY_INDEXES: &str = r#"
DROP INDEX IF EXISTS idx_track_artist;
DROP INDEX IF EXISTS idx_track_updated;
DROP INDEX IF EXISTS idx_track_starred;
DROP INDEX IF EXISTS idx_track_library;
DROP INDEX IF EXISTS idx_track_bpm;
DROP INDEX IF EXISTS idx_track_isrc;
DROP INDEX IF EXISTS idx_track_remap_path;
DROP INDEX IF EXISTS idx_track_remap_hash;
DROP INDEX IF EXISTS idx_track_title;
"#;

const RESTORE_TRACK_SECONDARY_INDEXES: &str = r#"
CREATE INDEX IF NOT EXISTS idx_track_album   ON track(server_id, album_id)               WHERE deleted = 0;
CREATE INDEX IF NOT EXISTS idx_track_artist  ON track(server_id, artist_id)              WHERE deleted = 0;
CREATE INDEX IF NOT EXISTS idx_track_updated ON track(server_id, server_updated_at DESC) WHERE deleted = 0;
CREATE INDEX IF NOT EXISTS idx_track_starred ON track(server_id, starred_at)             WHERE deleted = 0 AND starred_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_track_library ON track(server_id, library_id)             WHERE deleted = 0;
CREATE INDEX IF NOT EXISTS idx_track_bpm     ON track(server_id, bpm)                    WHERE deleted = 0 AND bpm IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_track_isrc    ON track(isrc)                              WHERE deleted = 0 AND isrc IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_track_remap_path
  ON track(server_id, server_path)
  WHERE deleted = 0 AND server_path IS NOT NULL AND server_path != '';
CREATE INDEX IF NOT EXISTS idx_track_remap_hash
  ON track(server_id, content_hash)
  WHERE deleted = 0 AND content_hash IS NOT NULL AND content_hash != '';
CREATE INDEX IF NOT EXISTS idx_track_title
  ON track(server_id, title COLLATE NOCASE)
  WHERE deleted = 0;
"#;

/// Drop write-heavy secondary indexes on `track`; the album browse index stays.
pub fn suspend_track_secondary_indexes(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(DROP_TRACK_SECONDARY_INDEXES)
}

/// Recreate secondary indexes after bulk ingest (may take tens of seconds on
/// very large libraries — runs once at the end of IS-3, not per batch).
pub fn restore_track_secondary_indexes(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(RESTORE_TRACK_SECONDARY_INDEXES)
}

pub(crate) fn refresh_track_planner_stats(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch("ANALYZE track;")
}

fn track_planner_stats_need_refresh(conn: &Connection) -> rusqlite::Result<bool> {
    let has_live_tracks: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM track WHERE deleted = 0)",
        [],
        |row| row.get(0),
    )?;
    if !has_live_tracks {
        return Ok(false);
    }
    let has_stats_table: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sqlite_stat1')",
        [],
        |row| row.get(0),
    )?;
    if !has_stats_table {
        return Ok(true);
    }
    let stat: Option<String> = conn
        .query_row(
            "SELECT stat FROM sqlite_stat1 WHERE tbl = 'track' AND idx = 'idx_track_album'",
            [],
            |row| row.get(0),
        )
        .optional()?;
    let estimated_rows = stat
        .as_deref()
        .and_then(|value| value.split_whitespace().next())
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(0);
    Ok(estimated_rows == 0)
}

/// Idempotent open-time repair for a process that exited while bulk indexes
/// were suspended. Fresh databases can also retain the empty-catalogue planner
/// stats written by migration 016 until their first bulk ingest completes.
pub fn ensure_track_secondary_indexes(conn: &Connection) -> rusqlite::Result<()> {
    let refresh_stats = !missing_track_secondary_indexes(conn)?.is_empty()
        || track_planner_stats_need_refresh(conn)?;
    let tx = conn.unchecked_transaction()?;
    restore_track_secondary_indexes(&tx)?;
    if refresh_stats {
        refresh_track_planner_stats(&tx)?;
    }
    tx.commit()
}

pub(crate) fn missing_track_secondary_indexes(
    conn: &Connection,
) -> rusqlite::Result<Vec<&'static str>> {
    let mut missing = Vec::new();
    for name in TRACK_SECONDARY_INDEX_NAMES {
        let present = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = ?1)",
            [name],
            |row| row.get::<_, bool>(0),
        )?;
        if !present {
            missing.push(name);
        }
    }
    Ok(missing)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::LibraryStore;

    #[test]
    fn suspend_and_restore_track_indexes_roundtrip() {
        let store = LibraryStore::open_in_memory();
        store
            .with_conn_mut("misc", |conn| {
                suspend_track_secondary_indexes(conn)?;
                let album_index_exists: i64 = conn.query_row(
                    "SELECT COUNT(*) FROM sqlite_master \
                     WHERE type = 'index' AND name = 'idx_track_album'",
                    [],
                    |row| row.get(0),
                )?;
                assert_eq!(
                    album_index_exists, 1,
                    "album reads stay indexed during ingest"
                );
                conn.execute(
                    "INSERT INTO track (server_id, id, title, album, album_id, artist_id, \
                     duration_sec, deleted, synced_at, raw_json) \
                     VALUES ('s1', 't1', 'T', 'Al', 'al1', 'ar1', 1, 0, 1, '{}')",
                    [],
                )?;
                restore_track_secondary_indexes(conn)
            })
            .unwrap();
        let n: i64 = store
            .with_read_conn(|c| {
                c.query_row(
                    "SELECT COUNT(*) FROM track WHERE server_id = 's1' AND album_id = 'al1'",
                    [],
                    |r| r.get(0),
                )
            })
            .unwrap();
        assert_eq!(n, 1);
    }

    #[test]
    fn open_repair_refreshes_empty_catalogue_planner_stats() {
        let store = LibraryStore::open_in_memory();
        store
            .with_conn_mut("test.stale_track_stats", |conn| {
                conn.execute(
                    "INSERT INTO track (server_id, id, title, album, album_id, artist_id, \
                     duration_sec, deleted, synced_at, raw_json) \
                     VALUES ('s1', 't1', 'T', 'Al', 'al1', 'ar1', 1, 0, 1, '{}')",
                    [],
                )?;
                conn.execute(
                    "UPDATE sqlite_stat1 SET stat = '0 0 0' \
                     WHERE tbl = 'track' AND idx = 'idx_track_album'",
                    [],
                )?;
                assert!(track_planner_stats_need_refresh(conn)?);

                ensure_track_secondary_indexes(conn)?;

                assert!(!track_planner_stats_need_refresh(conn)?);
                let stat: String = conn.query_row(
                    "SELECT stat FROM sqlite_stat1 \
                     WHERE tbl = 'track' AND idx = 'idx_track_album'",
                    [],
                    |row| row.get(0),
                )?;
                assert_eq!(stat.split_whitespace().next(), Some("1"));
                Ok(())
            })
            .unwrap();
    }
}
