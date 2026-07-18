import type { Track } from '@/lib/media/trackTypes';
import { useAuthStore } from '@/store/authStore';
import { usePlayerStore } from '@/features/playback/store/playerStore';
import { getCachedTrack } from '@/features/playback/store/queueTrackResolver';
import { queueSongRating } from '@/features/playback/store/pendingStarSync';
import { ownedOverrideValue } from '@/lib/util/ownedEntityKey';
/**
 * Skip → 1★ behaviour: every user-initiated `next()` on an unrated track
 * counts in `authStore.skipStarManualSkipCountsByKey` (persisted). Once the
 * configured threshold is crossed, the track is auto-rated 1★ — both on the
 * Subsonic server and in local Zustand state (queue + currentTrack + the
 * override map that QueuePanel reads).
 *
 * Natural track end (incl. gapless advance) does NOT count; it clears the
 * threshold counter elsewhere. Already-rated tracks are skipped silently.
 */
export function applySkipStarOnManualNext(skippedTrack: Track | null, manual: boolean): void {
  if (!manual || !skippedTrack) return;
  const id = skippedTrack.id;
  const live = usePlayerStore.getState();
  const serverId = skippedTrack.serverId ?? live.queueServerId ?? undefined;
  const adv = useAuthStore.getState().recordSkipStarManualAdvance(id, serverId);
  if (!adv?.crossedThreshold) return;
  // Thin-state: the queue's copy of the rating now lives in the resolver cache.
  const sid = serverId ?? '';
  const fromCache = sid ? getCachedTrack({ serverId: sid, trackId: id }) : undefined;
  const cur =
    ownedOverrideValue(live.userRatingOverrides, { id, serverId }) ??
    fromCache?.userRating ??
    skippedTrack.userRating ??
    0;
  if (cur >= 1) return;
  // F4: optimistic 1★ (patches queue + currentTrack + override) and retried
  // server sync via the central helper; the override clears on success.
  queueSongRating(id, 1, serverId);
}
