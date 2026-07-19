//! Materialized browse rows maintained alongside track ingest.
//!
//! The `track` catalog remains authoritative. These compact rows avoid grouping
//! every track in a selected library before the first All Albums page can render.

use std::collections::HashSet;

use rusqlite::{params, Connection, OptionalExtension, Transaction};
use tauri::{AppHandle, Emitter};

use crate::repos::TrackRow;
use crate::store::LibraryStore;

pub(crate) type AlbumScope = (String, String, String);
pub const MIGRATION_ID: &str = "scope_browse_album_projection_v1";
const BACKFILL_BATCH_SIZE: i64 = 10_000;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScopeBrowseProjectionInspectDto {
    pub needed: bool,
    pub total_tracks: u64,
    pub done_tracks: u64,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScopeBrowseProjectionProgressEvent {
    pub done: u64,
    pub total: u64,
}

fn add_scope(
    scopes: &mut HashSet<AlbumScope>,
    server_id: &str,
    library_id: Option<String>,
    album_id: Option<String>,
) {
    let Some(album_id) = album_id.filter(|id| !id.is_empty()) else {
        return;
    };
    scopes.insert((
        server_id.to_string(),
        library_id.unwrap_or_default(),
        album_id,
    ));
}

pub(crate) fn collect_album_scopes_for_track_ids(
    tx: &Transaction<'_>,
    server_id: &str,
    track_ids: &[String],
) -> rusqlite::Result<HashSet<AlbumScope>> {
    let mut scopes = HashSet::new();
    let mut statement = tx.prepare_cached(
        "SELECT library_id, album_id FROM track WHERE server_id = ?1 AND id = ?2",
    )?;
    for track_id in track_ids {
        if let Some((library_id, album_id)) = statement
            .query_row(params![server_id, track_id], |row| {
                Ok((row.get(0)?, row.get(1)?))
            })
            .optional()?
        {
            add_scope(&mut scopes, server_id, library_id, album_id);
        }
    }
    Ok(scopes)
}

pub(crate) fn refresh_library_tagged_albums(
    tx: &Transaction<'_>,
    server_id: &str,
    library_id: &str,
    album_ids: &[String],
) -> rusqlite::Result<()> {
    let mut scopes = HashSet::new();
    for album_id in album_ids {
        add_scope(
            &mut scopes,
            server_id,
            Some(String::new()),
            Some(album_id.clone()),
        );
        add_scope(
            &mut scopes,
            server_id,
            Some(library_id.to_string()),
            Some(album_id.clone()),
        );
    }
    refresh_album_scopes(tx, scopes)
}

/// Capture old and incoming album owners before a track batch changes them.
pub(crate) fn collect_affected_album_scopes(
    tx: &Transaction<'_>,
    rows: &[TrackRow],
) -> rusqlite::Result<HashSet<AlbumScope>> {
    let mut scopes = HashSet::new();
    let mut previous = tx.prepare_cached(
        "SELECT library_id, album_id FROM track WHERE server_id = ?1 AND id = ?2",
    )?;
    for row in rows {
        if let Some((library_id, album_id)) = previous
            .query_row(params![row.server_id, row.id], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .optional()?
        {
            add_scope(&mut scopes, &row.server_id, library_id, album_id);
        }
        add_scope(
            &mut scopes,
            &row.server_id,
            row.library_id.clone(),
            row.album_id.clone(),
        );
    }
    Ok(scopes)
}

/// Recompute only albums affected by a single track ingest transaction.
pub(crate) fn refresh_album_scopes(
    tx: &Transaction<'_>,
    scopes: HashSet<AlbumScope>,
) -> rusqlite::Result<()> {
    let mut delete = tx.prepare_cached(
        "DELETE FROM album_browse_projection \
         WHERE server_id = ?1 AND library_id = ?2 AND album_id = ?3",
    )?;
    let mut insert = tx.prepare_cached(
        "INSERT INTO album_browse_projection ( \
           server_id, library_id, album_id, name, artist, artist_id, song_count, \
           duration_sec, year, genre, cover_art_id, starred_at, synced_at, representative_track_id \
         ) \
         SELECT t.server_id, COALESCE(t.library_id, ''), t.album_id, MAX(t.album), \
                MAX(COALESCE(NULLIF(TRIM(t.album_artist), ''), t.artist)), MAX(t.artist_id), \
                COUNT(*), SUM(t.duration_sec), MAX(t.year), MAX(t.genre), MAX(t.cover_art_id), \
                MAX(t.starred_at), MAX(t.synced_at), MIN(t.id) \
         FROM track t \
         WHERE t.server_id = ?1 AND COALESCE(t.library_id, '') = ?2 AND t.album_id = ?3 \
           AND t.deleted = 0 \
         GROUP BY t.server_id, COALESCE(t.library_id, ''), t.album_id",
    )?;
    let mut update_identity = tx.prepare_cached(
        "UPDATE album_browse_projection SET identity_key = ?4 \
         WHERE server_id = ?1 AND library_id = ?2 AND album_id = ?3",
    )?;
    let mut identity_source = tx.prepare_cached(
        "SELECT name, artist FROM album_browse_projection \
         WHERE server_id = ?1 AND library_id = ?2 AND album_id = ?3",
    )?;
    for (server_id, library_id, album_id) in &scopes {
        delete.execute(params![server_id, library_id, album_id])?;
        insert.execute(params![server_id, library_id, album_id])?;
        let source = identity_source
            .query_row(params![server_id, library_id, album_id], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?))
            })
            .optional()?;
        if let Some((name, artist)) = source {
            let identity_key = crate::identity::build_track_cluster_keys(
                artist.as_deref(),
                "",
                &name,
                artist.as_deref(),
            )
            .album_key;
            update_identity.execute(params![server_id, library_id, album_id, identity_key])?;
        }
    }
    crate::composer_projection::refresh_album_scopes(tx, &scopes)?;
    Ok(())
}

/// Full resync can tombstone arbitrary old rows, so rebuild one server's compact
/// projection after its orphan sweep instead of leaving deleted albums visible.
pub(crate) fn rebuild_server(tx: &Transaction<'_>, server_id: &str) -> rusqlite::Result<()> {
    tx.execute(
        "DELETE FROM album_browse_projection WHERE server_id = ?1",
        params![server_id],
    )?;
    tx.execute(
        "INSERT INTO album_browse_projection ( \
           server_id, library_id, album_id, name, artist, artist_id, song_count, \
           duration_sec, year, genre, cover_art_id, starred_at, synced_at, representative_track_id \
         ) \
         SELECT t.server_id, COALESCE(t.library_id, ''), t.album_id, MAX(t.album), \
                MAX(COALESCE(NULLIF(TRIM(t.album_artist), ''), t.artist)), MAX(t.artist_id), \
                COUNT(*), SUM(t.duration_sec), MAX(t.year), MAX(t.genre), MAX(t.cover_art_id), \
                MAX(t.starred_at), MAX(t.synced_at), MIN(t.id) \
         FROM track t \
         WHERE t.server_id = ?1 AND t.deleted = 0 AND t.album_id IS NOT NULL AND t.album_id != '' \
         GROUP BY t.server_id, COALESCE(t.library_id, ''), t.album_id",
        params![server_id],
    )?;
    let mut stmt = tx.prepare(
        "SELECT library_id, album_id, name, artist FROM album_browse_projection WHERE server_id = ?1",
    )?;
    let rows = stmt
        .query_map(params![server_id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, Option<String>>(3)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    drop(stmt);
    let mut update = tx.prepare_cached(
        "UPDATE album_browse_projection SET identity_key = ?4 \
         WHERE server_id = ?1 AND library_id = ?2 AND album_id = ?3",
    )?;
    for (library_id, album_id, name, artist) in rows {
        let identity_key = crate::identity::build_track_cluster_keys(
            artist.as_deref(),
            "",
            &name,
            artist.as_deref(),
        )
        .album_key;
        update.execute(params![server_id, library_id, album_id, identity_key])?;
    }
    crate::composer_projection::rebuild_scope(tx, server_id, "")?;
    Ok(())
}

/// Rebuild the projection rows affected by an authoritative scope mutation.
/// Empty scope means every library on the server; non-empty scope is exact.
pub(crate) fn rebuild_scope(
    tx: &Transaction<'_>,
    server_id: &str,
    library_scope: &str,
) -> rusqlite::Result<()> {
    if library_scope.is_empty() {
        return rebuild_server(tx, server_id);
    }
    let mut scopes = HashSet::new();
    for sql in [
        "SELECT album_id FROM album_browse_projection \
         WHERE server_id = ?1 AND library_id = ?2",
        "SELECT DISTINCT album_id FROM track \
         WHERE server_id = ?1 AND library_id = ?2 AND deleted = 0 \
            AND album_id IS NOT NULL AND album_id != ''",
        "SELECT DISTINCT album_id FROM composer_album_projection \
         WHERE server_id = ?1 AND library_id = ?2",
    ] {
        let mut statement = tx.prepare(sql)?;
        let album_ids = statement
            .query_map(params![server_id, library_scope], |row| {
                row.get::<_, String>(0)
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        for album_id in album_ids {
            add_scope(
                &mut scopes,
                server_id,
                Some(library_scope.to_string()),
                Some(album_id),
            );
        }
    }
    refresh_album_scopes(tx, scopes)
}

fn migration_completed(conn: &Connection) -> rusqlite::Result<bool> {
    let completed: Option<Option<i64>> = conn
        .query_row(
            "SELECT completed_at FROM library_data_migration WHERE id = ?1",
            params![MIGRATION_ID],
            |r| r.get(0),
        )
        .optional()?;
    Ok(completed.flatten().is_some())
}

fn cursor_rowid(conn: &Connection) -> rusqlite::Result<i64> {
    conn.query_row(
        "SELECT cursor_rowid FROM library_data_migration WHERE id = ?1",
        params![MIGRATION_ID],
        |r| r.get(0),
    )
    .optional()
    .map(|cursor| cursor.unwrap_or(0))
}

fn inspect_album(store: &LibraryStore) -> Result<ScopeBrowseProjectionInspectDto, String> {
    store
        .with_read_conn(|conn| {
            let total: i64 =
                conn.query_row("SELECT COUNT(*) FROM track WHERE deleted = 0", [], |r| {
                    r.get(0)
                })?;
            if total == 0 || migration_completed(conn)? {
                return Ok(ScopeBrowseProjectionInspectDto {
                    needed: false,
                    total_tracks: total.max(0) as u64,
                    done_tracks: total.max(0) as u64,
                });
            }
            let migration_started: bool = conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM library_data_migration WHERE id = ?1)",
                params![MIGRATION_ID],
                |r| r.get(0),
            )?;
            let has_projection: bool = conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM album_browse_projection)",
                [],
                |r| r.get(0),
            )?;
            if !migration_started && has_projection {
                return Ok(ScopeBrowseProjectionInspectDto {
                    needed: false,
                    total_tracks: total.max(0) as u64,
                    done_tracks: total.max(0) as u64,
                });
            }
            let cursor = cursor_rowid(conn)?;
            let done: i64 = conn.query_row(
                "SELECT COUNT(*) FROM track WHERE deleted = 0 AND rowid <= ?1",
                params![cursor],
                |r| r.get(0),
            )?;
            Ok(ScopeBrowseProjectionInspectDto {
                needed: true,
                total_tracks: total.max(0) as u64,
                done_tracks: done.max(0) as u64,
            })
        })
        .map_err(|error| error.to_string())
}

pub fn inspect(store: &LibraryStore) -> Result<ScopeBrowseProjectionInspectDto, String> {
    let album = inspect_album(store)?;
    let composer = crate::composer_projection::inspect(store)?;
    let pending = [album.clone(), composer.clone()]
        .into_iter()
        .filter(|item| item.needed)
        .collect::<Vec<_>>();
    if pending.is_empty() {
        return Ok(ScopeBrowseProjectionInspectDto {
            needed: false,
            total_tracks: album.total_tracks.max(composer.total_tracks),
            done_tracks: album.done_tracks.max(composer.done_tracks),
        });
    }
    Ok(ScopeBrowseProjectionInspectDto {
        needed: true,
        total_tracks: pending.iter().map(|item| item.total_tracks).max().unwrap_or(0),
        done_tracks: pending.iter().map(|item| item.done_tracks).min().unwrap_or(0),
    })
}

pub fn is_ready(store: &LibraryStore) -> Result<bool, String> {
    store
        .with_read_conn(|conn| {
            if migration_completed(conn)? {
                return Ok(true);
            }
            // Fresh installs have no legacy catalog to backfill: sync maintains
            // projection rows incrementally before the first browse request.
            let migration_started: bool = conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM library_data_migration WHERE id = ?1)",
                params![MIGRATION_ID],
                |r| r.get(0),
            )?;
            if migration_started {
                return Ok(false);
            }
            conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM album_browse_projection)",
                [],
                |r| r.get(0),
            )
        })
        .map_err(|error| error.to_string())
}

pub fn run_backfill(store: &LibraryStore, app: &AppHandle) -> Result<(), String> {
    run_backfill_impl(store, Some(app))?;
    crate::composer_projection::run_backfill(store, Some(app))
}

fn run_backfill_impl(store: &LibraryStore, app: Option<&AppHandle>) -> Result<(), String> {
    let inspect_result = inspect_album(store)?;
    if !inspect_result.needed {
        return Ok(());
    }
    loop {
        let (done, finished) = store.with_conn_mut("browse_projection.backfill", |conn| {
            if migration_completed(conn)? {
                return Ok((inspect_result.total_tracks, true));
            }
            conn.execute(
                "INSERT INTO library_data_migration (id, cursor_rowid, started_at) \
                 VALUES (?1, 0, strftime('%s','now')) \
                 ON CONFLICT(id) DO NOTHING",
                params![MIGRATION_ID],
            )?;
            let cursor = cursor_rowid(conn)?;
            let tx = conn.transaction()?;
            let rows = {
                let mut stmt = tx.prepare(
                    "SELECT rowid, server_id, COALESCE(library_id, ''), album_id \
                     FROM track WHERE deleted = 0 AND rowid > ?1 \
                     ORDER BY rowid LIMIT ?2",
                )?;
                let rows = stmt.query_map(params![cursor, BACKFILL_BATCH_SIZE], |r| {
                    Ok((
                        r.get::<_, i64>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, String>(2)?,
                        r.get::<_, Option<String>>(3)?,
                    ))
                })?;
                rows.collect::<rusqlite::Result<Vec<_>>>()?
            };
            if let Some(last_rowid) = rows.last().map(|row| row.0) {
                let mut scopes = HashSet::new();
                for (_, server_id, library_id, album_id) in rows {
                    add_scope(&mut scopes, &server_id, Some(library_id), album_id);
                }
                refresh_album_scopes(&tx, scopes)?;
                tx.execute(
                    "UPDATE library_data_migration SET cursor_rowid = ?2 WHERE id = ?1",
                    params![MIGRATION_ID, last_rowid],
                )?;
                tx.commit()?;
                let done: i64 = conn.query_row(
                    "SELECT COUNT(*) FROM track WHERE deleted = 0 AND rowid <= ?1",
                    params![last_rowid],
                    |r| r.get(0),
                )?;
                Ok((done.max(0) as u64, false))
            } else {
                tx.execute(
                    "UPDATE library_data_migration SET completed_at = strftime('%s','now') WHERE id = ?1",
                    params![MIGRATION_ID],
                )?;
                tx.commit()?;
                Ok((inspect_result.total_tracks, true))
            }
        })?;
        if let Some(app) = app {
            app.emit(
                "scope_browse_projection:progress",
                ScopeBrowseProjectionProgressEvent {
                    done,
                    total: inspect_result.total_tracks,
                },
            )
            .map_err(|error| error.to_string())?;
        }
        if finished {
            return Ok(());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repos::{TrackRepository, TrackRow};

    fn track(id: &str, album_id: &str, album: &str, library_id: &str) -> TrackRow {
        TrackRow {
            server_id: "s1".into(),
            id: id.into(),
            title: id.into(),
            title_sort: None,
            artist: Some("Artist".into()),
            artist_id: Some("artist".into()),
            album: album.into(),
            album_id: Some(album_id.into()),
            album_artist: Some("Artist".into()),
            duration_sec: 120,
            track_number: None,
            disc_number: None,
            year: Some(2024),
            genre: None,
            suffix: None,
            bit_rate: None,
            size_bytes: None,
            cover_art_id: None,
            starred_at: None,
            user_rating: None,
            play_count: None,
            played_at: None,
            server_path: None,
            library_id: Some(library_id.into()),
            isrc: None,
            mbid_recording: None,
            bpm: None,
            replay_gain_track_db: None,
            replay_gain_album_db: None,
            replay_gain_peak: None,
            content_hash: None,
            server_updated_at: None,
            server_created_at: None,
            deleted: false,
            synced_at: 1,
            raw_json: "{}".into(),
        }
    }

    #[test]
    fn ingest_refreshes_only_affected_album_projection() {
        let store = LibraryStore::open_in_memory();
        TrackRepository::new(&store)
            .upsert_batch(&[track("t1", "a1", "Album One", "lib")])
            .unwrap();
        let name: String = store.with_read_conn(|conn| conn.query_row(
            "SELECT name FROM album_browse_projection WHERE server_id = 's1' AND library_id = 'lib' AND album_id = 'a1'",
            [], |row| row.get(0),
        )).unwrap();
        assert_eq!(name, "Album One");

        TrackRepository::new(&store)
            .upsert_batch(&[track("t1", "a1", "Album Renamed", "lib")])
            .unwrap();
        let name: String = store.with_read_conn(|conn| conn.query_row(
            "SELECT name FROM album_browse_projection WHERE server_id = 's1' AND library_id = 'lib' AND album_id = 'a1'",
            [], |row| row.get(0),
        )).unwrap();
        assert_eq!(name, "Album Renamed");
    }

    #[test]
    fn backfill_processes_tracks_without_album_ids_before_advancing_cursor() {
        let store = LibraryStore::open_in_memory();
        TrackRepository::new(&store)
            .upsert_batch(&[
                track("no-album", "", "Ignored", "lib"),
                track("t1", "a1", "Album One", "lib"),
            ])
            .unwrap();
        store
            .with_conn_mut("test.clear_projection_marker", |conn| {
                conn.execute("DELETE FROM album_browse_projection", [])?;
                conn.execute(
                    "DELETE FROM library_data_migration WHERE id = ?1",
                    params![MIGRATION_ID],
                )?;
                Ok(())
            })
            .unwrap();

        run_backfill_impl(&store, None).unwrap();
        assert!(is_ready(&store).unwrap());
        let count: i64 = store
            .with_read_conn(|conn| {
                conn.query_row(
                    "SELECT COUNT(*) FROM album_browse_projection WHERE album_id = 'a1'",
                    [],
                    |row| row.get(0),
                )
            })
            .unwrap();
        assert_eq!(count, 1);
    }
}
