import { useEffect, useMemo, useRef } from 'react';
import { useAuthStore } from '@/store/authStore';
import { ensureConnectUrlResolved, invalidateReachableEndpointCache } from '@/lib/server/serverEndpoint';
import {
  useUnavailableServerIds,
} from '@/lib/network/serverReachability';
import { deriveEffectiveLibraryBrowseServerIds } from '@/lib/library/libraryBrowseScope';
import { usePerfProbeFlags } from '@/lib/perf/perfFlags';

const SERVER_REACHABILITY_POLL_MS = 120_000;

/** Keep selected Library servers probed and invalidate browse reads when the effective scope changes. */
export function useLibraryServerReachability(): void {
  const isLoggedIn = useAuthStore(state => state.isLoggedIn);
  const servers = useAuthStore(state => state.servers);
  const libraryBrowseServerIds = useAuthStore(state => state.libraryBrowseServerIds);
  const unavailableServerIds = useUnavailableServerIds();
  const perfFlags = usePerfProbeFlags();
  const selectedProfiles = useMemo(() => {
    const selected = new Set(libraryBrowseServerIds);
    return servers.filter(server => selected.has(server.id));
  }, [libraryBrowseServerIds, servers]);
  const previousUnavailableServerIdsRef = useRef(unavailableServerIds);

  useEffect(() => {
    const previousUnavailableServerIds = previousUnavailableServerIdsRef.current;
    previousUnavailableServerIdsRef.current = unavailableServerIds;
    if (previousUnavailableServerIds === unavailableServerIds) return;
    const state = useAuthStore.getState();
    const previousEffectiveScopeKey = deriveEffectiveLibraryBrowseServerIds(
      state,
      previousUnavailableServerIds,
    ).join('\u0000');
    const effectiveScopeKey = deriveEffectiveLibraryBrowseServerIds(
      state,
      unavailableServerIds,
    ).join('\u0000');
    if (previousEffectiveScopeKey === effectiveScopeKey) return;
    useAuthStore.setState(state => ({
      libraryBrowseScopeVersion: state.libraryBrowseScopeVersion + 1,
    }));
  }, [unavailableServerIds]);

  useEffect(() => {
    if (!isLoggedIn || perfFlags.disableBackgroundPolling || selectedProfiles.length === 0) return;
    let cancelled = false;

    const probeSelectedServers = async () => {
      for (const server of selectedProfiles) {
        if (cancelled) return;
        await ensureConnectUrlResolved(server);
      }
    };
    const handleOnline = () => {
      for (const server of selectedProfiles) invalidateReachableEndpointCache(server.id);
      void probeSelectedServers();
    };

    void probeSelectedServers();
    const interval = setInterval(() => void probeSelectedServers(), SERVER_REACHABILITY_POLL_MS);
    window.addEventListener('online', handleOnline);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
    };
  }, [isLoggedIn, perfFlags.disableBackgroundPolling, selectedProfiles]);
}
