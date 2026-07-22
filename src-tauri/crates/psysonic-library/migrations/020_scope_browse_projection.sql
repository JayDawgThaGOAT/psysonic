-- Materialized per-library album rows for candidate-first scoped browse. The
-- track table remains authoritative; this table avoids GROUP BY track on every
-- All Albums page request.
CREATE TABLE IF NOT EXISTS album_browse_projection (
  server_id TEXT NOT NULL,
  library_id TEXT NOT NULL,
  album_id TEXT NOT NULL,
  identity_key TEXT,
  name TEXT NOT NULL,
  artist TEXT,
  artist_id TEXT,
  song_count INTEGER NOT NULL,
  duration_sec INTEGER NOT NULL,
  year INTEGER,
  genre TEXT,
  cover_art_id TEXT,
  starred_at INTEGER,
  synced_at INTEGER NOT NULL,
  representative_track_id TEXT NOT NULL,
  PRIMARY KEY (server_id, library_id, album_id)
);

CREATE INDEX IF NOT EXISTS idx_album_browse_projection_name
  ON album_browse_projection(server_id, library_id, name COLLATE NOCASE, album_id);

CREATE INDEX IF NOT EXISTS idx_album_browse_projection_artist
  ON album_browse_projection(server_id, library_id, artist COLLATE NOCASE, name COLLATE NOCASE, album_id);

CREATE INDEX IF NOT EXISTS idx_album_browse_projection_artist_year
  ON album_browse_projection(server_id, library_id, artist COLLATE NOCASE, year, name COLLATE NOCASE, album_id);

CREATE INDEX IF NOT EXISTS idx_album_browse_projection_identity
  ON album_browse_projection(server_id, library_id, identity_key);
