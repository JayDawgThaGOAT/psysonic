import type { LibraryEntitySourceDto } from '@/lib/api/library';
import { isSubsonicServerReachable } from '@/lib/network/subsonicNetworkGuard';
import { resolveServerIdForIndexKey } from '@/lib/server/serverLookup';
import { serverListDisplayLabel } from '@/lib/server/serverDisplayName';
import { hasLocalPlaybackUrl } from '@/store/localPlaybackResolve';
import { useAuthStore } from '@/store/authStore';

export interface PlaybackAlternativeSource extends LibraryEntitySourceDto {
  local: boolean;
  serverLabel: string;
}

export function availablePlaybackAlternativeSources(
  sources: LibraryEntitySourceDto[],
): PlaybackAlternativeSource[] {
  const auth = useAuthStore.getState();
  return sources
    .map(source => {
      const local = hasLocalPlaybackUrl(source.id, source.serverId);
      const profileId = resolveServerIdForIndexKey(source.serverId) || source.serverId;
      const server = auth.servers.find(candidate => candidate.id === profileId);
      return {
        ...source,
        local,
        serverLabel: server ? serverListDisplayLabel(server, auth.servers) : source.serverId,
      };
    })
    .filter(source => source.local || isSubsonicServerReachable(source.serverId));
}
