-- Ordinary Tracks browse is title-ordered per selected library. Keep the
-- keyset cursor query on the partial live-track index rather than scanning
-- the server-wide title index.
CREATE INDEX IF NOT EXISTS idx_track_library_title_id
  ON track(server_id, library_id, title COLLATE NOCASE, id)
  WHERE deleted = 0;
