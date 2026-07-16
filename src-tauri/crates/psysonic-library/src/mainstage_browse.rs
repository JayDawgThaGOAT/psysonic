//! Global chronological album feeds over an ordered multi-server library scope.

use rusqlite::types::Value as SqlValue;
use rusqlite::params_from_iter;

use crate::browse_support::overlay_album_starred_at_rows;
use crate::dto::{
    LibraryMainstageAlbumFeed, LibraryMainstageAlbumsRequest, LibraryMainstageAlbumsResponse,
};
use crate::scope_merge::{
    album_row_to_dto, ensure_cluster_keys_for_scopes, non_empty_scopes, scope_cte_sql,
    ALBUM_DEDUP_KEY, ALBUM_PICK_KEY, TRACK_DEDUP_KEY,
};
use crate::search::PAGE_LIMIT_MAX;
use crate::store::LibraryStore;

pub fn list_mainstage_albums(
    store: &LibraryStore,
    request: &LibraryMainstageAlbumsRequest,
) -> Result<LibraryMainstageAlbumsResponse, String> {
    let scopes = non_empty_scopes(&request.scopes)?;
    ensure_cluster_keys_for_scopes(store, scopes)?;

    let limit = request.limit.unwrap_or(30).clamp(1, PAGE_LIMIT_MAX);
    let offset = request.offset.unwrap_or(0);
    let fetch_limit = limit.saturating_add(1);
    let (cte, mut binds) = scope_cte_sql(scopes);
    let feed_times_sql = match request.feed {
        LibraryMainstageAlbumFeed::NewReleases => {
            "SELECT album_dedup, MAX(server_created_at) AS feed_at \
             FROM selected WHERE server_created_at IS NOT NULL GROUP BY album_dedup"
        }
        LibraryMainstageAlbumFeed::RecentlyPlayed => {
            "SELECT st.album_dedup, MAX(ps.started_at_ms) AS feed_at \
             FROM selected st \
             INNER JOIN play_session ps \
               ON ps.server_id = st.server_id AND ps.track_id = st.id \
             GROUP BY st.album_dedup"
        }
    };

    let sql = format!(
        "{cte}, \
         selected AS ( \
           SELECT t.server_id, t.album_id, t.album, t.artist, t.artist_id, t.album_artist, \
                  t.year, t.genre, t.cover_art_id, t.starred_at, t.synced_at, t.duration_sec, \
                  t.server_created_at, t.id, s.pr, {ALBUM_DEDUP_KEY} AS album_dedup, \
                  {TRACK_DEDUP_KEY} AS track_dedup \
           FROM scope s \
           CROSS JOIN track t ON t.server_id = s.server_id AND t.library_id = s.library_id \
           LEFT JOIN cluster.track_cluster_key ck \
             ON ck.server_id = t.server_id AND ck.track_id = t.id \
           WHERE t.deleted = 0 AND t.album_id IS NOT NULL AND t.album_id != '' \
         ), \
         feed_times AS ( \
           {feed_times_sql} \
         ), \
         albums AS ( \
           SELECT server_id, album_id, album, artist, artist_id, album_artist, \
                  COUNT(DISTINCT track_dedup) AS song_count, SUM(duration_sec) AS duration_total, \
                  year, genre, cover_art_id, starred_at, synced_at, album_dedup, \
                  MIN({ALBUM_PICK_KEY}) AS _pick \
           FROM selected GROUP BY album_dedup \
         ) \
         SELECT a.server_id, a.album_id, a.album, a.artist, a.artist_id, a.album_artist, \
                a.song_count, a.duration_total, a.year, a.genre, a.cover_art_id, \
                a.starred_at, a.synced_at \
         FROM albums a \
         INNER JOIN feed_times f ON f.album_dedup = a.album_dedup \
         ORDER BY f.feed_at DESC, a.album COLLATE NOCASE ASC, a.server_id ASC, a.album_id ASC \
         LIMIT ? OFFSET ?",
    );
    binds.push(SqlValue::Integer(i64::from(fetch_limit)));
    binds.push(SqlValue::Integer(i64::from(offset)));

    store
        .with_read_conn(|conn| {
            let mut stmt = conn.prepare(&sql)?;
            let rows = stmt
                .query_map(params_from_iter(binds.iter()), |r| {
                    Ok((
                        r.get(0)?,
                        r.get(1)?,
                        r.get(2)?,
                        r.get(3)?,
                        r.get(4)?,
                        r.get(5)?,
                        r.get(6)?,
                        r.get(7)?,
                        r.get(8)?,
                        r.get(9)?,
                        r.get(10)?,
                        r.get(11)?,
                        r.get(12)?,
                    ))
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            let mut albums = rows.into_iter().map(album_row_to_dto).collect::<Vec<_>>();
            let has_more = albums.len() > limit as usize;
            albums.truncate(limit as usize);
            overlay_album_starred_at_rows(conn, &mut albums);
            Ok(LibraryMainstageAlbumsResponse { albums, has_more })
        })
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dto::{LibraryScopePair, PlaySessionInputDto};
    use crate::repos::{PlaySessionRepository, TrackRepository, TrackRow};

    fn scope(server_id: &str, library_id: &str) -> LibraryScopePair {
        LibraryScopePair {
            server_id: server_id.into(),
            library_id: library_id.into(),
        }
    }

    fn track(
        server_id: &str,
        id: &str,
        album: &str,
        album_id: &str,
        library_id: &str,
        created_at: Option<i64>,
    ) -> TrackRow {
        TrackRow {
            server_id: server_id.into(),
            id: id.into(),
            title: format!("Track {id}"),
            title_sort: None,
            artist: Some("Artist".into()),
            artist_id: Some(format!("artist-{server_id}")),
            album: album.into(),
            album_id: Some(album_id.into()),
            album_artist: Some("Artist".into()),
            duration_sec: 180,
            track_number: Some(1),
            disc_number: Some(1),
            year: Some(2026),
            genre: None,
            suffix: Some("flac".into()),
            bit_rate: None,
            size_bytes: None,
            cover_art_id: Some(format!("cover-{album_id}")),
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
            server_created_at: created_at,
            deleted: false,
            synced_at: 1,
            raw_json: "{}".into(),
        }
    }

    fn request(
        scopes: Vec<LibraryScopePair>,
        feed: LibraryMainstageAlbumFeed,
    ) -> LibraryMainstageAlbumsRequest {
        LibraryMainstageAlbumsRequest {
            scopes,
            feed,
            limit: Some(30),
            offset: None,
        }
    }

    fn play(store: &LibraryStore, server_id: &str, track_id: &str, started_at_ms: i64) {
        PlaySessionRepository::new(store)
            .insert(&PlaySessionInputDto {
                server_id: server_id.into(),
                track_id: track_id.into(),
                started_at_ms,
                listened_sec: 20.0,
                position_max_sec: 20.0,
                end_reason: "skip".into(),
                duration_sec_hint: None,
            })
            .unwrap();
    }

    #[test]
    fn new_releases_are_globally_ordered_and_exclude_null_created_at() {
        let store = LibraryStore::open_in_memory();
        TrackRepository::new(&store)
            .upsert_batch(&[
                track("s1", "t-old", "Old", "a-old", "l1", Some(100)),
                track("s2", "t-new", "New", "a-new", "l2", Some(300)),
                track("s1", "t-mid", "Mid", "a-mid", "l1", Some(200)),
                track("s2", "t-null", "Unknown", "a-null", "l2", None),
            ])
            .unwrap();

        let response = list_mainstage_albums(
            &store,
            &request(
                vec![scope("s1", "l1"), scope("s2", "l2")],
                LibraryMainstageAlbumFeed::NewReleases,
            ),
        )
        .unwrap();
        assert_eq!(
            response.albums.iter().map(|a| a.name.as_str()).collect::<Vec<_>>(),
            vec!["New", "Mid", "Old"]
        );
    }

    #[test]
    fn only_selected_libraries_contribute() {
        let store = LibraryStore::open_in_memory();
        TrackRepository::new(&store)
            .upsert_batch(&[
                track("s1", "t-selected", "Selected", "a1", "wanted", Some(100)),
                track("s1", "t-hidden", "Hidden", "a2", "other", Some(999)),
            ])
            .unwrap();

        let response = list_mainstage_albums(
            &store,
            &request(vec![scope("s1", "wanted")], LibraryMainstageAlbumFeed::NewReleases),
        )
        .unwrap();
        assert_eq!(response.albums.len(), 1);
        assert_eq!(response.albums[0].name, "Selected");
    }

    #[test]
    fn recently_played_collapses_repeated_sessions_and_uses_latest_global_time() {
        let store = LibraryStore::open_in_memory();
        TrackRepository::new(&store)
            .upsert_batch(&[
                track("s1", "t-a", "Album A", "a", "l1", Some(1)),
                track("s2", "t-b", "Album B", "b", "l2", Some(1)),
            ])
            .unwrap();
        play(&store, "s1", "t-a", 100);
        play(&store, "s1", "t-a", 400);
        play(&store, "s2", "t-b", 300);

        let response = list_mainstage_albums(
            &store,
            &request(
                vec![scope("s1", "l1"), scope("s2", "l2")],
                LibraryMainstageAlbumFeed::RecentlyPlayed,
            ),
        )
        .unwrap();
        assert_eq!(response.albums.len(), 2);
        assert_eq!(response.albums[0].name, "Album A");
        assert_eq!(response.albums[1].name, "Album B");
    }

    #[test]
    fn duplicate_album_uses_priority_owner_but_global_feed_timestamp() {
        let store = LibraryStore::open_in_memory();
        TrackRepository::new(&store)
            .upsert_batch(&[
                track("s1", "t-priority", "Shared", "priority-id", "l1", Some(100)),
                track("s2", "t-later", "Shared", "later-id", "l2", Some(500)),
            ])
            .unwrap();

        let response = list_mainstage_albums(
            &store,
            &request(
                vec![scope("s1", "l1"), scope("s2", "l2")],
                LibraryMainstageAlbumFeed::NewReleases,
            ),
        )
        .unwrap();
        assert_eq!(response.albums.len(), 1);
        assert_eq!(response.albums[0].server_id, "s1");
        assert_eq!(response.albums[0].id, "priority-id");
    }

    #[test]
    fn pagination_fetches_one_extra_for_has_more() {
        let store = LibraryStore::open_in_memory();
        TrackRepository::new(&store)
            .upsert_batch(&[
                track("s1", "t1", "One", "a1", "l1", Some(300)),
                track("s1", "t2", "Two", "a2", "l1", Some(200)),
                track("s1", "t3", "Three", "a3", "l1", Some(100)),
            ])
            .unwrap();
        let mut req = request(vec![scope("s1", "l1")], LibraryMainstageAlbumFeed::NewReleases);
        req.limit = Some(2);

        let first = list_mainstage_albums(&store, &req).unwrap();
        assert_eq!(first.albums.len(), 2);
        assert!(first.has_more);

        req.offset = Some(2);
        let second = list_mainstage_albums(&store, &req).unwrap();
        assert_eq!(second.albums.len(), 1);
        assert!(!second.has_more);
    }

    #[test]
    fn feed_and_response_serialize_with_ipc_camel_case() {
        assert_eq!(
            serde_json::to_value(LibraryMainstageAlbumFeed::NewReleases).unwrap(),
            "newReleases"
        );
        assert_eq!(
            serde_json::to_value(LibraryMainstageAlbumFeed::RecentlyPlayed).unwrap(),
            "recentlyPlayed"
        );
        let response = LibraryMainstageAlbumsResponse {
            albums: Vec::new(),
            has_more: true,
        };
        assert_eq!(serde_json::to_value(response).unwrap()["hasMore"], true);
    }

    #[test]
    fn album_star_overlay_uses_priority_representative_album_row() {
        let store = LibraryStore::open_in_memory();
        TrackRepository::new(&store)
            .upsert_batch(&[
                track("s1", "t-priority", "Shared", "priority-id", "l1", Some(100)),
                track("s2", "t-later", "Shared", "later-id", "l2", Some(500)),
            ])
            .unwrap();
        store
            .with_conn("test.mainstage_star", |conn| {
                conn.execute(
                    "INSERT INTO album (server_id, id, name, starred_at, synced_at, raw_json) \
                     VALUES ('s1', 'priority-id', 'Shared', 1234, 1, '{}'), \
                            ('s2', 'later-id', 'Shared', 5678, 1, '{}')",
                    [],
                )?;
                Ok(())
            })
            .unwrap();

        let response = list_mainstage_albums(
            &store,
            &request(
                vec![scope("s1", "l1"), scope("s2", "l2")],
                LibraryMainstageAlbumFeed::NewReleases,
            ),
        )
        .unwrap();
        assert_eq!(response.albums[0].server_id, "s1");
        assert_eq!(response.albums[0].starred_at, Some(1234));
    }
}
