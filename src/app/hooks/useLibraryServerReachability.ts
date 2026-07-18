import { useEffect, useMemo, useRef } from 'react';
import { useAuthStore } from '@/store/authStore';
import { ensureConnectUrlResolved, invalidateReachableEndpointCache } from '@/lib/server/serverEndpoint';
import {
  useUnavailableServerIds,
} from '@/lib/network/serverReachability';
import { deriveEffectiveLibraryBrowseServerIds } from '@/lib/library/libraryBrowseScope';
import { usePerfProbeFlags } from '@/lib/perf/perfFlags';
import { switchActiveServer } from '@/utils/server/switchActiveServer';

const SERVER_REACHABILITY_POLL_MS = 120_000;

/** Probe selected servers, align the active profile to scope priority, and invalidate effective reads. */
export function useLibraryServerReachability(): void {
  const isLoggedIn = useAuthStore(state => state.isLoggedIn);
  const servers = useAuthStore(state => state.servers);
  const activeServerId = useAuthStore(state => state.activeServerId);
  const libraryBrowseServerIds = useAuthStore(state => state.libraryBrowseServerIds);
  const unavailableServerIds = useUnavailableServerIds();
  const perfFlags = usePerfProbeFlags();
  const selectedProfiles = useMemo(() => {
    const selected = new Set(libraryBrowseServerIds);
    return servers.filter(server => selected.has(server.id));
  }, [libraryBrowseServerIds, servers]);
  const effectiveLibraryServerIds = useMemo(() => deriveEffectiveLibraryBrowseServerIds({
    servers,
    activeServerId,
    libraryBrowseServerIds,
  }, unavailableServerIds), [activeServerId, libraryBrowseServerIds, servers, unavailableServerIds]);
  const desiredActiveServerId = effectiveLibraryServerIds[0] ?? null;
  const libraryBrowsePriorityKey = libraryBrowseServerIds.join('\u0000');
  const previousUnavailableServerIdsRef = useRef(unavailableServerIds);
  const desiredActiveServerIdRef = useRef(desiredActiveServerId);
  const activeSwitchInFlightRef = useRef(false);
  // React Compiler refs rule: the in-flight loop must always observe the latest priority head.
  // eslint-disable-next-line react-hooks/refs
  desiredActiveServerIdRef.current = desiredActiveServerId;

  useEffect(() => {
    if (!isLoggedIn || !desiredActiveServerId || activeSwitchInFlightRef.current) return;
    activeSwitchInFlightRef.current = true;

    void (async () => {
      try {
        while (true) {
          const targetId = desiredActiveServerIdRef.current;
          const state = useAuthStore.getState();
          if (!targetId || state.activeServerId === targetId) return;
          const target = state.servers.find(server => server.id === targetId);
          if (!target) return;
          const switched = await switchActiveServer(target);
          if (!switched && desiredActiveServerIdRef.current === targetId) return;
        }
      } finally {
        activeSwitchInFlightRef.current = false;
      }
    })();
  }, [desiredActiveServerId, isLoggedIn, libraryBrowsePriorityKey]);

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
