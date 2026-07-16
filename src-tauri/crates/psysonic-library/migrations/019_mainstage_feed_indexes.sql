-- Candidate-first New Releases: seek one selected library in descending
-- server creation order, with album/track ids available for stable ties.
CREATE INDEX IF NOT EXISTS idx_track_library_created_album
  ON track(server_id, library_id, server_created_at DESC, album_id, id)
  WHERE deleted = 0
    AND server_created_at IS NOT NULL
    AND album_id IS NOT NULL
    AND album_id != '';

-- Owner-scoped ratings for tracks, albums, and artists. The composite primary
-- key covers the batch cache lookups, so a secondary index is unnecessary.
CREATE TABLE IF NOT EXISTS entity_user_rating (
  server_id TEXT NOT NULL,
  entity_kind TEXT NOT NULL CHECK (entity_kind IN ('track', 'album', 'artist')),
  entity_id TEXT NOT NULL,
  rating INTEGER NOT NULL,
  fetched_at INTEGER NOT NULL,
  PRIMARY KEY (server_id, entity_kind, entity_id)
);

-- Suffix-selective candidate index for local Lossless Albums browse.
CREATE INDEX IF NOT EXISTS idx_track_lossless_album_browse
  ON track(server_id, suffix COLLATE NOCASE, library_id, album_id)
  WHERE deleted = 0
    AND album_id IS NOT NULL
    AND album_id != ''
    AND suffix IS NOT NULL;
