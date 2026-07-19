import type { QueueItemRef, Track } from '@/lib/media/trackTypes';
import {
  analysisTrackRefForQueueItem,
  analysisTrackRefForTrack,
  analysisTrackRefKey,
  type AnalysisTrackRef,
} from '@/features/playback/store/analysisTrackRef';
import { sameQueueTrack } from '@/features/playback/utils/playback/queueIdentity';
/**
 * After a bulk enqueue (queue replace, append-many, lucky-mix) the runtime
 * warms the loudness cache for the current track + the next N entries so
 * the engine's `audio_chain_preload` sees a real cached gain instead of
 * the startup trim. These helpers compute that window — both as a
 * "does this track sit inside it?" predicate and as the owner-qualified list
 * the prefetch loop iterates over.
 *
 * Pure functions of the state slice — no store imports, no side effects.
 * The caller passes the queue + index + current track so the test surface
 * stays trivial and there's no top-level coupling back to playerStore.
 */
export const LOUDNESS_BACKFILL_WINDOW_AHEAD = 5;

export function isTrackInsideLoudnessBackfillWindow(
  target: AnalysisTrackRef,
  queue: QueueItemRef[],
  queueIndex: number,
  currentTrack: Track | null,
): boolean {
  if (!target.trackId || !target.serverIndexKey) return false;
  const currentRef = queue[queueIndex];
  if (currentTrack && sameQueueTrack(
    { id: target.trackId, serverId: target.serverIndexKey ?? undefined },
    { id: currentTrack.id, serverId: currentRef?.serverId ?? currentTrack.serverId },
  )) return true;
  if (queue.length === 0) return false;
  const start = Math.max(0, queueIndex + 1);
  const end = Math.min(queue.length, start + LOUDNESS_BACKFILL_WINDOW_AHEAD);
  for (let i = start; i < end; i++) {
    const ref = queue[i];
    if (ref && analysisTrackRefKey(analysisTrackRefForQueueItem(ref)) === analysisTrackRefKey(target)) {
      return true;
    }
  }
  return false;
}

export function collectLoudnessBackfillWindowTrackRefs(
  queue: QueueItemRef[],
  queueIndex: number,
  currentTrack: Track | null,
): AnalysisTrackRef[] {
  const refs = new Map<string, AnalysisTrackRef>();
  if (currentTrack?.id) {
    const ref = analysisTrackRefForTrack(currentTrack, queue[queueIndex]);
    if (ref.serverIndexKey) refs.set(analysisTrackRefKey(ref), ref);
  }
  const start = Math.max(0, queueIndex + 1);
  const end = Math.min(queue.length, start + LOUDNESS_BACKFILL_WINDOW_AHEAD);
  for (let i = start; i < end; i++) {
    const queueRef = queue[i];
    if (!queueRef?.trackId) continue;
    const ref = analysisTrackRefForQueueItem(queueRef);
    if (ref.serverIndexKey) refs.set(analysisTrackRefKey(ref), ref);
  }
  return [...refs.values()];
}

export function collectLoudnessBackfillWindowTrackIds(
  queue: QueueItemRef[],
  queueIndex: number,
  currentTrack: Track | null,
): string[] {
  const ids = new Set<string>();
  if (currentTrack?.id) ids.add(currentTrack.id);
  const start = Math.max(0, queueIndex + 1);
  const end = Math.min(queue.length, start + LOUDNESS_BACKFILL_WINDOW_AHEAD);
  for (let i = start; i < end; i++) {
    const tid = queue[i]?.trackId;
    if (tid) ids.add(tid);
  }
  return Array.from(ids);
}

/** Next ~5 queue neighbours for middle-tier analysis priority hints. */
export function collectPlaybackMiddlePriorityTrackIds(
  queue: QueueItemRef[],
  queueIndex: number,
  currentTrack: Track | null,
): string[] {
  const ids = new Set<string>();
  const start = Math.max(0, queueIndex + 1);
  const end = Math.min(queue.length, start + LOUDNESS_BACKFILL_WINDOW_AHEAD);
  for (let i = start; i < end; i++) {
    const tid = queue[i]?.trackId;
    if (tid && tid !== currentTrack?.id) ids.add(tid);
  }
  return Array.from(ids);
}

export function loudnessBackfillPriorityForTrack(
  target: AnalysisTrackRef,
  queue: QueueItemRef[],
  queueIndex: number,
  currentTrack: Track | null,
): 'high' | 'middle' | 'low' {
  if (!target.trackId || !target.serverIndexKey) return 'low';
  const currentRef = queue[queueIndex];
  if (currentTrack && sameQueueTrack(
    { id: target.trackId, serverId: target.serverIndexKey ?? undefined },
    { id: currentTrack.id, serverId: currentRef?.serverId ?? currentTrack.serverId },
  )) return 'high';
  const start = Math.max(0, queueIndex + 1);
  const end = Math.min(queue.length, start + LOUDNESS_BACKFILL_WINDOW_AHEAD);
  for (let i = start; i < end; i++) {
    const ref = queue[i];
    if (ref && analysisTrackRefKey(analysisTrackRefForQueueItem(ref)) === analysisTrackRefKey(target)) {
      return 'middle';
    }
  }
  return 'low';
}
