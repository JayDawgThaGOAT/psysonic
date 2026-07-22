import { useEffect, useMemo } from 'react';
import { getMusicFoldersForServer } from '@/lib/api/subsonicLibrary';
import { useAuthStore } from '@/store/authStore';

/** Refreshes folder lists for the servers selected in Switch server. */
export function useMusicFoldersDiscovery(): void {
  const isLoggedIn = useAuthStore(state => state.isLoggedIn);
  const servers = useAuthStore(state => state.servers);
  const selectedServerIds = useAuthStore(state => state.libraryBrowseServerIds);
  const setMusicFoldersForServer = useAuthStore(state => state.setMusicFoldersForServer);
  const selectedKey = useMemo(() => selectedServerIds.join('\u0000'), [selectedServerIds]);

  useEffect(() => {
    if (!isLoggedIn || selectedServerIds.length === 0) return;
    const savedIds = new Set(servers.map(server => server.id));
    let cancelled = false;

    for (const serverId of selectedServerIds) {
      if (!savedIds.has(serverId)) continue;
      void getMusicFoldersForServer(serverId)
        .then(folders => {
          if (cancelled) return;
          const state = useAuthStore.getState();
          if (!state.servers.some(server => server.id === serverId)) return;
          setMusicFoldersForServer(serverId, folders);
        })
        .catch(() => {
          // Preserve the last successful list while a server is temporarily unavailable.
        });
    }

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, selectedKey, selectedServerIds, servers, setMusicFoldersForServer]);
}
