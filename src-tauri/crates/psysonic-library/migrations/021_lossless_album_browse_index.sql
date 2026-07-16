-- Drive Lossless Albums from the small suffix-qualified candidate set instead
-- of scanning every album track on large mixed-format libraries.
CREATE INDEX IF NOT EXISTS idx_track_lossless_album_browse
  ON track(server_id, suffix COLLATE NOCASE, library_id, album_id)
  WHERE deleted = 0
    AND album_id IS NOT NULL
    AND album_id != ''
    AND suffix IS NOT NULL;
