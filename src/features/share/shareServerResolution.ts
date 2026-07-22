import { findServerIdForShareUrl } from '@/lib/share/shareLink';
import { useAuthStore } from '@/store/authStore';
import type { ServerProfile } from '@/store/authStoreTypes';

export type ShareServerLookupResult =
  | { type: 'ok'; serverId: string; server: ServerProfile }
  | { type: 'not-logged-in' }
  | { type: 'no-matching-server'; url: string };

export function lookupShareServer(shareSrv: string): ShareServerLookupResult {
  const { servers, isLoggedIn } = useAuthStore.getState();
  if (!isLoggedIn) return { type: 'not-logged-in' };

  const serverId = findServerIdForShareUrl(servers, shareSrv);
  const server = serverId ? servers.find(candidate => candidate.id === serverId) : undefined;
  if (!serverId || !server) return { type: 'no-matching-server', url: shareSrv };

  return { type: 'ok', serverId, server };
}

export function activateShareServer(serverId: string): void {
  const { activeServerId, setActiveServer } = useAuthStore.getState();
  if (activeServerId !== serverId) setActiveServer(serverId);
}
