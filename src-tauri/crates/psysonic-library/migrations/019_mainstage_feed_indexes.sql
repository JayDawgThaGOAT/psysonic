-- Candidate-first New Releases: seek one selected library in descending
-- server creation order, with album/track ids available for stable ties.
CREATE INDEX IF NOT EXISTS idx_track_library_created_album
  ON track(server_id, library_id, server_created_at DESC, album_id, id)
  WHERE deleted = 0
    AND server_created_at IS NOT NULL
    AND album_id IS NOT NULL
    AND album_id != '';
