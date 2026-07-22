import { findServerByIdOrIndexKey } from '@/lib/server/serverLookup';
import { COVER_SCOPE_ACTIVE, type CoverServerScope } from './types';

function explicitServerScope(serverId: string): CoverServerScope | null {
  const server = findServerByIdOrIndexKey(serverId);
  if (!server) return null;
  return {
    kind: 'server',
    serverId: server.id,
    url: server.url,
    username: server.username,
    password: server.password,
  };
}

/** Explicit server bucket for cover disk/IDB — use when entity carries `serverId` (e.g. cross-server favorites). */
export function coverServerScopeForServerId(
  serverId: string | null | undefined,
): CoverServerScope {
  if (!serverId?.trim()) return COVER_SCOPE_ACTIVE;
  return explicitServerScope(serverId) ?? COVER_SCOPE_ACTIVE;
}

/**
 * Required owner scope for cross-server rows. Unknown profiles stay in their
 * own local cache/index bucket and are intentionally unreachable over HTTP.
 */
export function coverServerScopeForOwnerServerId(serverId: string): CoverServerScope {
  const ownerId = serverId.trim();
  return explicitServerScope(ownerId) ?? {
    kind: 'server',
    serverId: ownerId,
    url: '',
    username: '',
    password: '',
  };
}
