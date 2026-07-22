CREATE INDEX IF NOT EXISTS idx_album_starred
  ON album(server_id, starred_at)
  WHERE starred_at IS NOT NULL;
