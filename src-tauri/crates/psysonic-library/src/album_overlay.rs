//! Identity-aware reconciliation for the network-only New Releases overlay.

use std::collections::HashMap;

use rusqlite::params_from_iter;
use rusqlite::types::Value as SqlValue;

use crate::dto::{
    LibraryAlbumOverlayResolutionDto, LibraryResolveAlbumOverlayRequest, LibraryScopePair,
};
use crate::scope_merge::{lookup_album_key, non_empty_scopes, scope_cte_sql};
use crate::store::LibraryStore;

const MAX_OVERLAY_ALBUMS: usize = 128;

fn indexed_album_exists(
    conn: &rusqlite::Connection,
    server_id: &str,
    album_id: &str,
) -> rusqlite::Result<bool> {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM track INDEXED BY idx_track_album \
         WHERE server_id = ?1 AND album_id = ?2 AND deleted = 0)",
        rusqlite::params![server_id, album_id],
        |row| row.get(0),
    )
}

fn resolve_representatives(
    conn: &rusqlite::Connection,
    scopes: &[LibraryScopePair],
    indexed_groups: &[(u32, String)],
) -> rusqlite::Result<HashMap<u32, (String, String)>> {
    if indexed_groups.is_empty() {
        return Ok(HashMap::new());
    }
    let (scope_cte, mut binds) = scope_cte_sql(scopes);
    let values = indexed_groups
        .iter()
        .map(|_| "(?, ?)")
        .collect::<Vec<_>>()
        .join(", ");
    for (group, identity_key) in indexed_groups {
        binds.push(SqlValue::Integer(i64::from(*group)));
        binds.push(SqlValue::Text(identity_key.clone()));
    }
    let sql = format!(
        "{scope_cte}, \
         overlay_identity(group_id, album_key) AS (VALUES {values}), \
         representative_candidates AS ( \
           SELECT identity.group_id, t.server_id, t.album_id, s.pr, t.id \
           FROM overlay_identity identity \
           CROSS JOIN scope s \
           CROSS JOIN cluster.track_cluster_key ck INDEXED BY idx_ck_scope_album \
             ON ck.server_id = s.server_id AND ck.library_id = s.library_id \
            AND ck.album_key = identity.album_key \
           INNER JOIN track t INDEXED BY sqlite_autoindex_track_1 \
             ON t.server_id = ck.server_id AND t.id = ck.track_id \
           WHERE t.deleted = 0 AND t.album_id IS NOT NULL AND t.album_id != '' \
         ), \
         ranked AS ( \
           SELECT group_id, server_id, album_id, \
                  ROW_NUMBER() OVER ( \
                    PARTITION BY group_id \
                    ORDER BY pr ASC, album_id ASC, id ASC, server_id ASC \
                  ) AS rn \
           FROM representative_candidates \
         ) \
         SELECT group_id, server_id, album_id FROM ranked WHERE rn = 1"
    );
    let mut statement = conn.prepare(&sql)?;
    let rows = statement.query_map(params_from_iter(binds.iter()), |row| {
        Ok((
            row.get::<_, u32>(0)?,
            (row.get::<_, String>(1)?, row.get::<_, String>(2)?),
        ))
    })?;
    rows.collect()
}

/// Reconcile the network-only freshness overlay with the same album identity
/// partitions used by local multi-server browse. The returned group ids are
/// request-local so internal cluster keys never cross the IPC boundary.
pub fn resolve_album_overlay(
    store: &LibraryStore,
    request: &LibraryResolveAlbumOverlayRequest,
) -> Result<Vec<LibraryAlbumOverlayResolutionDto>, String> {
    let scopes = non_empty_scopes(&request.scopes)?;
    if request.albums.len() > MAX_OVERLAY_ALBUMS {
        return Err(format!(
            "album overlay is limited to {MAX_OVERLAY_ALBUMS} rows"
        ));
    }

    store
        .with_mainstage_read_conn(|conn| {
            let mut group_by_identity = HashMap::<String, u32>::new();
            let mut representative_group_keys = HashMap::<u32, String>::new();
            let mut direct_representatives = HashMap::<u32, (String, String)>::new();
            let mut groups = Vec::with_capacity(request.albums.len());

            for album in &request.albums {
                let server_id = album.server_id.trim();
                let album_id = album.id.trim();
                let name = album.name.trim();
                if server_id.is_empty() || album_id.is_empty() || name.is_empty() {
                    return Err(rusqlite::Error::InvalidParameterName(
                        "overlay album server_id, id, and name are required".into(),
                    ));
                }

                let indexed_key = lookup_album_key(conn, server_id, album_id)?;
                let exists =
                    indexed_key.is_some() || indexed_album_exists(conn, server_id, album_id)?;
                let artist = album
                    .artist
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| !value.is_empty());
                let normalized_key = (!exists)
                    .then(|| crate::identity::build_album_key(artist, name))
                    .flatten();
                let identity_key = indexed_key
                    .clone()
                    .or_else(|| normalized_key.clone())
                    .unwrap_or_else(|| {
                        crate::identity::concrete_physical_album_key(server_id, album_id)
                    });
                let next_group = u32::try_from(group_by_identity.len()).unwrap_or(u32::MAX);
                let group = *group_by_identity
                    .entry(identity_key.clone())
                    .or_insert(next_group);
                if indexed_key.is_some() || normalized_key.is_some() {
                    representative_group_keys
                        .entry(group)
                        .or_insert(identity_key);
                } else if exists {
                    direct_representatives
                        .entry(group)
                        .or_insert_with(|| (server_id.to_string(), album_id.to_string()));
                }
                groups.push(group);
            }

            let representative_groups = representative_group_keys.into_iter().collect::<Vec<_>>();
            let representatives = resolve_representatives(conn, scopes, &representative_groups)?;
            Ok(groups
                .into_iter()
                .map(|group| {
                    let representative = representatives
                        .get(&group)
                        .or_else(|| direct_representatives.get(&group));
                    LibraryAlbumOverlayResolutionDto {
                        group,
                        representative_server_id: representative.map(|value| value.0.clone()),
                        representative_id: representative.map(|value| value.1.clone()),
                    }
                })
                .collect())
        })
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dto::LibraryAlbumOverlayCandidateDto;
    use crate::identity::ensure_cluster_keys_built;
    use rusqlite::params;

    fn scope(server_id: &str, library_id: &str) -> LibraryScopePair {
        LibraryScopePair {
            server_id: server_id.into(),
            library_id: Some(library_id.into()),
        }
    }

    fn insert_album_track(
        store: &LibraryStore,
        server_id: &str,
        track_id: &str,
        album_id: &str,
        library_id: &str,
    ) {
        store
            .with_conn_mut("test.album_overlay_seed", |conn| {
                conn.execute(
                    "INSERT INTO artist (server_id, id, name, synced_at) \
                     VALUES (?1, ?2, 'Artist', 1) ON CONFLICT(server_id, id) DO NOTHING",
                    params![server_id, format!("artist-{server_id}")],
                )?;
                conn.execute(
                    "INSERT INTO track (server_id, id, title, artist, artist_id, album, album_id, \
                     album_artist, duration_sec, library_id, server_created_at, synced_at, raw_json) \
                     VALUES (?1, ?2, ?2, 'Artist', ?3, 'Shared', ?4, 'Artist', 180, ?5, 1, 1, '{}')",
                    params![server_id, track_id, format!("artist-{server_id}"), album_id, library_id],
                )?;
                Ok(())
            })
            .unwrap();
    }

    #[test]
    fn maps_physical_copies_to_the_scope_representative() {
        let store = LibraryStore::open_in_memory();
        insert_album_track(&store, "s1", "t-priority", "a-priority", "l1");
        insert_album_track(&store, "s1", "t-alternate", "z-alternate", "l1");
        insert_album_track(&store, "s2", "t-second", "b-second", "l2");
        ensure_cluster_keys_built(&store, "s1").unwrap();
        ensure_cluster_keys_built(&store, "s2").unwrap();

        let resolutions = resolve_album_overlay(
            &store,
            &LibraryResolveAlbumOverlayRequest {
                scopes: vec![scope("s1", "l1"), scope("s2", "l2")],
                albums: vec![
                    LibraryAlbumOverlayCandidateDto {
                        server_id: "s1".into(),
                        id: "z-alternate".into(),
                        name: "Shared".into(),
                        artist: Some("Artist".into()),
                    },
                    LibraryAlbumOverlayCandidateDto {
                        server_id: "s2".into(),
                        id: "b-second".into(),
                        name: "Shared".into(),
                        artist: Some("Artist".into()),
                    },
                ],
            },
        )
        .unwrap();

        assert_eq!(resolutions[0].group, resolutions[1].group);
        assert!(resolutions.iter().all(|resolution| {
            resolution.representative_server_id.as_deref() == Some("s1")
                && resolution.representative_id.as_deref() == Some("a-priority")
        }));
    }

    #[test]
    fn groups_unindexed_copies_with_rust_normalization() {
        let store = LibraryStore::open_in_memory();
        let resolutions = resolve_album_overlay(
            &store,
            &LibraryResolveAlbumOverlayRequest {
                scopes: vec![scope("s1", "l1"), scope("s2", "l2")],
                albums: vec![
                    LibraryAlbumOverlayCandidateDto {
                        server_id: "s1".into(),
                        id: "fresh-a".into(),
                        name: "My Arms, Your Hearse".into(),
                        artist: Some("Opeth".into()),
                    },
                    LibraryAlbumOverlayCandidateDto {
                        server_id: "s2".into(),
                        id: "fresh-b".into(),
                        name: "My Arms Your Hearse".into(),
                        artist: Some("Opeth".into()),
                    },
                ],
            },
        )
        .unwrap();

        assert_eq!(resolutions[0].group, resolutions[1].group);
        assert!(resolutions.iter().all(|resolution| {
            resolution.representative_server_id.is_none() && resolution.representative_id.is_none()
        }));
    }

    #[test]
    fn maps_an_unindexed_copy_to_an_existing_scope_representative() {
        let store = LibraryStore::open_in_memory();
        insert_album_track(&store, "s1", "t-canonical", "a-canonical", "l1");
        ensure_cluster_keys_built(&store, "s1").unwrap();

        let resolutions = resolve_album_overlay(
            &store,
            &LibraryResolveAlbumOverlayRequest {
                scopes: vec![scope("s1", "l1"), scope("s2", "l2")],
                albums: vec![LibraryAlbumOverlayCandidateDto {
                    server_id: "s2".into(),
                    id: "fresh-copy".into(),
                    name: "Shared".into(),
                    artist: Some("Artist".into()),
                }],
            },
        )
        .unwrap();

        assert_eq!(
            resolutions[0].representative_server_id.as_deref(),
            Some("s1")
        );
        assert_eq!(
            resolutions[0].representative_id.as_deref(),
            Some("a-canonical")
        );
    }
}
