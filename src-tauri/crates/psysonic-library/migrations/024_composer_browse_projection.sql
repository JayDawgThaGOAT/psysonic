-- Materialized composer credits by album. Track raw_json remains authoritative;
-- this compact table avoids JSON scans on every Composers browse/detail load.
CREATE TABLE IF NOT EXISTS composer_album_projection (
  server_id TEXT NOT NULL,
  library_id TEXT NOT NULL,
  composer_id TEXT NOT NULL,
  composer_name TEXT NOT NULL,
  name_sort TEXT NOT NULL,
  identity_key TEXT NOT NULL,
  album_id TEXT NOT NULL,
  synced_at INTEGER NOT NULL,
  representative_track_id TEXT NOT NULL,
  PRIMARY KEY (server_id, library_id, composer_id, album_id)
);

CREATE INDEX IF NOT EXISTS idx_composer_album_projection_name
  ON composer_album_projection(server_id, library_id, name_sort, composer_id, album_id);

CREATE INDEX IF NOT EXISTS idx_composer_album_projection_identity
  ON composer_album_projection(server_id, library_id, identity_key, composer_id, album_id);

CREATE INDEX IF NOT EXISTS idx_composer_album_projection_album
  ON composer_album_projection(server_id, library_id, album_id);
