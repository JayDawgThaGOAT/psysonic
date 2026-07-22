-- Durable invalidation journal for the derived cluster sidecar. Mutations write
-- compact entity keys here in the same transaction as their authoritative rows;
-- identity maintenance consumes them after sync or before a clustered read.
CREATE TABLE IF NOT EXISTS identity_invalidation (
  server_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('server', 'track', 'album', 'artist')),
  entity_id TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (server_id, kind, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_identity_invalidation_server
  ON identity_invalidation(server_id, kind);
