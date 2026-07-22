import { useEffect } from 'react';
import { probeEntityRatingSupport } from '@/lib/api/subsonicStarRating';
import { useAuthStore } from '@/store/authStore';
import { cleanupOrphanedOrbitPlaylists } from '@/features/orbit';

/**
 * Per-server one-shot probe run after login:
 *  - Probes which entity types support star ratings (falls back to
 *    `track_only` for old/non-Navidrome servers).
 *  - Sweeps leftover Orbit session / outbox playlists from crashed or
 *    force-closed sessions so they don't pollute the playlist view.
 *
 * Each step is server-scoped — if the user switches servers mid-probe the
 * stale result is dropped.
 */
export function useServerCapabilitiesProbe(): void {
  const isLoggedIn = useAuthStore(s => s.isLoggedIn);
  const activeServerId = useAuthStore(s => s.activeServerId);
  const setEntityRatingSupport = useAuthStore(s => s.setEntityRatingSupport);

  useEffect(() => {
    if (!isLoggedIn || !activeServerId) return;
    const serverAtStart = activeServerId;
    let cancelled = false;
    (async () => {
      const stillThisServer = () => !cancelled && useAuthStore.getState().activeServerId === serverAtStart;
      try {
        const level = await probeEntityRatingSupport();
        if (stillThisServer()) setEntityRatingSupport(serverAtStart, level);
      } catch {
        if (stillThisServer()) setEntityRatingSupport(serverAtStart, 'track_only');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, activeServerId, setEntityRatingSupport]);

  useEffect(() => {
    if (!isLoggedIn || !activeServerId) return;
    void cleanupOrphanedOrbitPlaylists();
  }, [isLoggedIn, activeServerId]);
}
