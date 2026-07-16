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
