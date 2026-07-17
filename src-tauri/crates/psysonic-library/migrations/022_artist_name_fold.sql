-- Unicode-lowercased display name for indexed album-credit matching.
ALTER TABLE artist ADD COLUMN name_fold TEXT;
CREATE INDEX IF NOT EXISTS idx_artist_name_fold ON artist(server_id, name_fold);
