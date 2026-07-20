-- Resumable cursor for bounded post-sync library membership tagging.
CREATE TABLE IF NOT EXISTS library_tag_cursor (
  server_id TEXT PRIMARY KEY,
  folders_hash TEXT NOT NULL,
  next_folder_id TEXT NOT NULL,
  next_album_offset INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
