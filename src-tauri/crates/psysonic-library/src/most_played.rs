//! Local-index ranked albums over the selected server/library scope.

use std::collections::{BTreeMap, BTreeSet};

use rusqlite::{params_from_iter, types::Value as SqlValue};

use crate::dto::{
    LibraryMostPlayedAlbumDto, LibraryMostPlayedArtistDto, LibraryMostPlayedRequest,
    LibraryMostPlayedResponse, LibraryStatisticsScope,
};
use crate::search::PAGE_LIMIT_MAX;
use crate::store::LibraryStore;

type NormalizedScopes = BTreeMap<String, Option<BTreeSet<String>>>;

fn normalize_scopes(scopes: &[LibraryStatisticsScope]) -> NormalizedScopes {
    let mut normalized = BTreeMap::new();

    for scope in scopes
        .iter()
        .filter(|scope| !scope.server_id.trim().is_empty())
    {
        let library_ids: BTreeSet<String> = scope
            .library_ids
            .iter()
            .filter(|id| !id.is_empty())
            .cloned()
            .collect();
        let selected = normalized
            .entry(scope.server_id.clone())
            .or_insert_with(|| Some(BTreeSet::new()));

        if library_ids.is_empty() {
            *selected = None;
        } else if let Some(selected) = selected {
            selected.extend(library_ids);
        }
    }

    normalized
}

fn scopes_where(scopes: &NormalizedScopes) -> (String, Vec<SqlValue>) {
    let mut clauses = Vec::new();
    let mut params = Vec::new();

    for (server_id, library_ids) in scopes {
        let Some(library_ids) = library_ids else {
            clauses.push("t.server_id = ?".to_string());
            params.push(SqlValue::Text(server_id.clone()));
            continue;
        };

        let placeholders = std::iter::repeat_n("?", library_ids.len())
            .collect::<Vec<_>>()
            .join(", ");
        clauses.push(format!(
            "(t.server_id = ? AND t.library_id IN ({placeholders}))"
        ));
        params.push(SqlValue::Text(server_id.clone()));
        params.extend(library_ids.iter().cloned().map(SqlValue::Text));
    }

    (format!("({})", clauses.join(" OR ")), params)
}

fn album_plays_cte(scope_where: &str) -> String {
    format!(
        "album_plays AS (\
             SELECT t.server_id, COALESCE(t.library_id, '') AS library_id, t.album_id, \
                    NULLIF(MAX(t.album), '') AS track_name, \
                    NULLIF(MAX(t.album_artist), '') AS track_album_artist, \
                    NULLIF(MAX(t.artist), '') AS track_artist, \
                    NULLIF(MAX(t.artist_id), '') AS track_artist_id, \
                    MAX(t.year) AS track_year, \
                    NULLIF(MAX(t.cover_art_id), '') AS track_cover_art_id, \
                    SUM(COALESCE(t.play_count, 0)) AS play_count \
             FROM track t \
             WHERE {scope_where} AND t.deleted = 0 \
               AND t.album_id IS NOT NULL AND t.album_id != '' \
             GROUP BY t.server_id, COALESCE(t.library_id, ''), t.album_id \
             HAVING SUM(COALESCE(t.play_count, 0)) > 0\
         )"
    )
}

fn album_sql(scope_where: &str) -> String {
    format!(
        "WITH {} \
         SELECT ap.server_id, ap.library_id, ap.album_id, \
                COALESCE(NULLIF(p.name, ''), ap.track_name, '') AS name, \
                COALESCE(NULLIF(p.artist, ''), ap.track_album_artist, ap.track_artist, '') AS artist, \
                COALESCE(NULLIF(p.artist_id, ''), ap.track_artist_id) AS artist_id, \
                COALESCE(p.year, ap.track_year) AS year, \
                COALESCE(NULLIF(p.cover_art_id, ''), ap.track_cover_art_id) AS cover_art_id, \
                ap.play_count \
         FROM album_plays ap \
         LEFT JOIN album_browse_projection p \
           ON p.server_id = ap.server_id \
          AND p.library_id = ap.library_id \
          AND p.album_id = ap.album_id \
         ORDER BY ap.play_count DESC, name COLLATE NOCASE ASC, \
                  ap.server_id ASC, ap.library_id ASC, ap.album_id ASC \
         LIMIT ? OFFSET ?",
        album_plays_cte(scope_where)
    )
}

fn artist_sql(scope_where: &str) -> String {
    format!(
        "WITH {}, \
         artist_albums AS ( \
             SELECT ap.server_id, \
                    COALESCE(NULLIF(p.artist_id, ''), ap.track_artist_id, \
                             NULLIF(p.artist, ''), ap.track_album_artist, ap.track_artist) AS id, \
                    COALESCE(NULLIF(p.artist, ''), ap.track_album_artist, ap.track_artist, '') AS name, \
                    COALESCE(NULLIF(p.cover_art_id, ''), ap.track_cover_art_id) AS cover_art_id, \
                    ap.play_count \
             FROM album_plays ap \
             LEFT JOIN album_browse_projection p \
               ON p.server_id = ap.server_id \
               AND p.library_id = ap.library_id \
              AND p.album_id = ap.album_id \
         ), \
         ranked_artists AS ( \
             SELECT server_id, id, \
                    FIRST_VALUE(name) OVER ( \
                        PARTITION BY server_id, id \
                        ORDER BY play_count DESC, name COLLATE NOCASE ASC, \
                                 COALESCE(cover_art_id, '') ASC \
                    ) AS name, \
                    FIRST_VALUE(cover_art_id) OVER ( \
                        PARTITION BY server_id, id \
                        ORDER BY (cover_art_id IS NULL) ASC, play_count DESC, \
                                 cover_art_id ASC \
                    ) AS cover_art_id, \
                    SUM(play_count) OVER (PARTITION BY server_id, id) AS play_count, \
                    ROW_NUMBER() OVER ( \
                        PARTITION BY server_id, id \
                        ORDER BY play_count DESC, name COLLATE NOCASE ASC, \
                                 COALESCE(cover_art_id, '') ASC \
                    ) AS artist_row \
             FROM artist_albums \
             WHERE id IS NOT NULL AND id != '' \
         ) \
         SELECT server_id, id, name, cover_art_id, play_count \
         FROM ranked_artists \
         WHERE artist_row = 1 \
         ORDER BY play_count DESC, name COLLATE NOCASE ASC, server_id ASC, id ASC \
         LIMIT 50",
        album_plays_cte(scope_where)
    )
}

/// Aggregate `track.play_count` for the selected scopes without any REST reads.
pub fn query_most_played(
    store: &LibraryStore,
    request: &LibraryMostPlayedRequest,
) -> Result<LibraryMostPlayedResponse, String> {
    let limit = request.limit.unwrap_or(50).clamp(1, PAGE_LIMIT_MAX);
    let offset = request.offset.unwrap_or(0);
    let fetch_limit = limit.saturating_add(1);
    let normalized_scopes = normalize_scopes(&request.scopes);
    if normalized_scopes.is_empty() {
        return Ok(LibraryMostPlayedResponse {
            albums: Vec::new(),
            artists: Vec::new(),
            has_more: false,
        });
    }
    let (scope_where, scope_params) = scopes_where(&normalized_scopes);
    let artist_sql = artist_sql(&scope_where);
    let sql = album_sql(&scope_where);
    let mut album_params = scope_params.clone();
    album_params.push(SqlValue::Integer(i64::from(fetch_limit)));
    album_params.push(SqlValue::Integer(i64::from(offset)));

    store
        .with_scope_detail_read_conn(|conn| {
            let mut artist_stmt = conn.prepare(&artist_sql)?;
            let artists = artist_stmt
                .query_map(params_from_iter(scope_params.iter()), |row| {
                    Ok(LibraryMostPlayedArtistDto {
                        server_id: row.get(0)?,
                        id: row.get(1)?,
                        name: row.get(2)?,
                        cover_art_id: row.get(3)?,
                        play_count: row.get(4)?,
                    })
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            let mut stmt = conn.prepare(&sql)?;
            let mut albums = stmt
                .query_map(params_from_iter(album_params.iter()), |row| {
                    Ok(LibraryMostPlayedAlbumDto {
                        server_id: row.get(0)?,
                        library_id: row.get(1)?,
                        id: row.get(2)?,
                        name: row.get(3)?,
                        artist: row.get(4)?,
                        artist_id: row.get(5)?,
                        year: row.get(6)?,
                        cover_art_id: row.get(7)?,
                        play_count: row.get(8)?,
                    })
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            let has_more = albums.len() > limit as usize;
            albums.truncate(limit as usize);
            Ok(LibraryMostPlayedResponse {
                albums,
                artists,
                has_more,
            })
        })
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn insert_track(
        conn: &Connection,
        server: &str,
        library: &str,
        album: &str,
        track: &str,
        artist: &str,
        plays: i64,
    ) -> rusqlite::Result<()> {
        conn.execute(
            "INSERT INTO track \
             (server_id, id, title, artist, artist_id, album, album_id, album_artist, \
              library_id, play_count, synced_at, raw_json) \
             VALUES (?1, ?2, ?2, ?3, ?3, ?4, ?4, ?3, ?5, ?6, 1, '{}')",
            rusqlite::params![server, track, artist, album, library, plays,],
        )?;
        Ok(())
    }

    fn insert_projection(
        conn: &Connection,
        server: &str,
        library: &str,
        album: &str,
        artist: &str,
        artist_id: &str,
    ) -> rusqlite::Result<()> {
        conn.execute(
            "INSERT INTO album_browse_projection \
             (server_id, library_id, album_id, name, artist, artist_id, song_count, \
              duration_sec, cover_art_id, synced_at, representative_track_id) \
             VALUES (?1, ?2, ?3, ?3, ?4, ?5, 1, 0, ?3, 1, ?3)",
            rusqlite::params![server, library, album, artist, artist_id],
        )?;
        Ok(())
    }

    fn scope(server_id: &str, library_ids: &[&str]) -> LibraryStatisticsScope {
        LibraryStatisticsScope {
            server_id: server_id.into(),
            library_ids: library_ids.iter().map(|id| (*id).to_string()).collect(),
        }
    }

    fn request(
        scopes: Vec<LibraryStatisticsScope>,
        limit: u32,
        offset: u32,
    ) -> LibraryMostPlayedRequest {
        LibraryMostPlayedRequest {
            scopes,
            limit: Some(limit),
            offset: Some(offset),
        }
    }

    #[test]
    fn ranks_selected_scopes_and_keeps_server_library_identities() {
        let store = LibraryStore::open_in_memory();
        store
            .with_conn("most_played.test", |conn| {
                for (server, library, album, track, artist, plays) in [
                    ("s1", "one", "a1", "t1", "Artist One", 4),
                    ("s1", "one", "a1", "t2", "Artist One", 6),
                    ("s1", "two", "a2", "t3", "Excluded", 99),
                    ("s2", "one", "a1", "t4", "Artist Two", 12),
                ] {
                    insert_track(conn, server, library, album, track, artist, plays)?;
                }
                Ok(())
            })
            .unwrap();

        let result = query_most_played(
            &store,
            &request(vec![scope("s1", &["one"]), scope("s2", &[])], 2, 0),
        )
        .unwrap();

        assert_eq!(result.albums.len(), 2);
        assert!(!result.has_more);
        assert_eq!(result.albums[0].server_id, "s2");
        assert_eq!(result.albums[0].id, "a1");
        assert_eq!(result.albums[0].play_count, 12);
        assert_eq!(result.albums[1].server_id, "s1");
        assert_eq!(result.albums[1].library_id, "one");
        assert_eq!(result.albums[1].play_count, 10);
        assert_eq!(result.artists[0].server_id, "s2");
        assert_eq!(result.artists[0].play_count, 12);
    }

    #[test]
    fn paginates_albums_and_reports_has_more_from_the_extra_row() {
        let store = LibraryStore::open_in_memory();
        store
            .with_conn("most_played.pagination", |conn| {
                for (album, track, plays) in [
                    ("a1", "t1", 40),
                    ("a2", "t2", 30),
                    ("a3", "t3", 20),
                    ("a4", "t4", 10),
                ] {
                    insert_track(conn, "s1", "one", album, track, "Artist", plays)?;
                }
                Ok(())
            })
            .unwrap();

        let first = query_most_played(&store, &request(vec![scope("s1", &["one"])], 2, 0)).unwrap();
        assert_eq!(
            first
                .albums
                .iter()
                .map(|album| album.id.as_str())
                .collect::<Vec<_>>(),
            ["a1", "a2"]
        );
        assert!(first.has_more);

        let second =
            query_most_played(&store, &request(vec![scope("s1", &["one"])], 2, 2)).unwrap();
        assert_eq!(
            second
                .albums
                .iter()
                .map(|album| album.id.as_str())
                .collect::<Vec<_>>(),
            ["a3", "a4"]
        );
        assert!(!second.has_more);
    }

    #[test]
    fn duplicate_and_overlapping_scopes_do_not_double_count() {
        let store = LibraryStore::open_in_memory();
        store
            .with_conn("most_played.duplicate_scopes", |conn| {
                insert_track(conn, "s1", "one", "a1", "t1", "Artist", 4)?;
                insert_track(conn, "s1", "two", "a2", "t2", "Artist", 6)?;
                Ok(())
            })
            .unwrap();

        let duplicate_folder = query_most_played(
            &store,
            &request(
                vec![scope("s1", &["one", "one"]), scope("s1", &["one"])],
                10,
                0,
            ),
        )
        .unwrap();
        assert_eq!(duplicate_folder.albums.len(), 1);
        assert_eq!(duplicate_folder.albums[0].play_count, 4);

        let all_folders = query_most_played(
            &store,
            &request(vec![scope("s1", &["one"]), scope("s1", &[])], 10, 0),
        )
        .unwrap();
        assert_eq!(all_folders.albums.len(), 2);
        assert_eq!(
            all_folders
                .albums
                .iter()
                .map(|album| album.play_count)
                .sum::<i64>(),
            10
        );
        assert_eq!(all_folders.artists[0].play_count, 10);
    }

    #[test]
    fn empty_or_invalid_scopes_return_empty_results() {
        let store = LibraryStore::open_in_memory();
        store
            .with_conn("most_played.empty_scopes", |conn| {
                insert_track(conn, "s1", "one", "a1", "t1", "Artist", 4)
            })
            .unwrap();

        for scopes in [Vec::new(), vec![scope("   ", &["one"])]] {
            let result = query_most_played(&store, &request(scopes, 10, 0)).unwrap();
            assert!(result.albums.is_empty());
            assert!(result.artists.is_empty());
            assert!(!result.has_more);
        }
    }

    #[test]
    fn artists_use_album_artist_and_aggregate_folders_but_not_servers() {
        let store = LibraryStore::open_in_memory();
        store
            .with_conn("most_played.artist_aggregation", |conn| {
                for (server, library, album, track, artist, plays) in [
                    ("s1", "one", "a1", "t1", "Guest One", 4),
                    ("s1", "two", "a2", "t2", "Guest Two", 6),
                    ("s2", "one", "a3", "t3", "Guest Three", 8),
                    ("s1", "one", "a4", "t4", "Soloist", 7),
                ] {
                    insert_track(conn, server, library, album, track, artist, plays)?;
                }
                insert_projection(conn, "s1", "one", "a1", "The Band", "band")?;
                insert_projection(conn, "s1", "two", "a2", "The Band", "band")?;
                insert_projection(conn, "s2", "one", "a3", "The Band", "band")?;
                insert_projection(conn, "s1", "one", "a4", "Various Artists", "various")?;
                Ok(())
            })
            .unwrap();

        let result = query_most_played(
            &store,
            &request(vec![scope("s1", &[]), scope("s2", &[])], 10, 0),
        )
        .unwrap();

        let s1_band = result
            .artists
            .iter()
            .find(|artist| artist.server_id == "s1" && artist.id == "band")
            .unwrap();
        assert_eq!(s1_band.name, "The Band");
        assert_eq!(s1_band.play_count, 10);
        assert_eq!(s1_band.cover_art_id.as_deref(), Some("a2"));
        let s2_band = result
            .artists
            .iter()
            .find(|artist| artist.server_id == "s2" && artist.id == "band")
            .unwrap();
        assert_eq!(s2_band.play_count, 8);
        assert!(result
            .artists
            .iter()
            .all(|artist| !artist.id.starts_with("Guest")));
        assert_eq!(
            result
                .artists
                .iter()
                .filter(|artist| artist.id == "band")
                .count(),
            2
        );
    }

    #[test]
    fn scoped_query_plans_use_library_album_and_projection_indexes() {
        let store = LibraryStore::open_in_memory();
        let normalized = normalize_scopes(&[scope("s1", &["one"])]);
        let (scope_where, scope_params) = scopes_where(&normalized);
        let mut album_params = scope_params.clone();
        album_params.push(SqlValue::Integer(11));
        album_params.push(SqlValue::Integer(0));

        let plan = store
            .with_scope_detail_read_conn(|conn| {
                let mut details = Vec::new();
                for (sql, params) in [
                    (album_sql(&scope_where), album_params),
                    (artist_sql(&scope_where), scope_params),
                ] {
                    let mut stmt = conn.prepare(&format!("EXPLAIN QUERY PLAN {sql}"))?;
                    details.extend(
                        stmt.query_map(params_from_iter(params.iter()), |row| row.get(3))?
                            .collect::<rusqlite::Result<Vec<String>>>()?,
                    );
                }
                Ok(details)
            })
            .unwrap();

        assert!(
            plan.iter()
                .any(|detail| detail.contains("idx_track_library_album")),
            "track aggregation did not use the scoped album index: {plan:#?}"
        );
        assert!(
            plan.iter()
                .any(|detail| detail.contains("sqlite_autoindex_album_browse_projection_1")),
            "projection join did not use its primary-key index: {plan:#?}"
        );
        assert!(
            !plan
                .iter()
                .any(|detail| detail == "SCAN t" || detail.contains("SCAN track")),
            "scoped query plan contains an unindexed track scan: {plan:#?}"
        );
    }
}
