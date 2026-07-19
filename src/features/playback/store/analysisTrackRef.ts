import type { QueueItemRef, Track } from '@/lib/media/trackTypes';
import { resolveStorageServerIndexKey } from '@/lib/server/serverIndexKey';
import { queueTrackIdentityKey } from '@/features/playback/utils/playback/queueIdentity';

export type AnalysisTrackRef = Readonly<{
  trackId: string;
  serverIndexKey: string | null;
}>;

export function analysisTrackRef(
  trackId: string,
  serverIdOrIndexKey?: string | null,
): AnalysisTrackRef {
  return {
    trackId,
    serverIndexKey: serverIdOrIndexKey
      ? resolveStorageServerIndexKey(serverIdOrIndexKey)
      : null,
  };
}

export function analysisTrackRefForTrack(
  track: Pick<Track, 'id' | 'serverId'>,
  queueRef?: Pick<QueueItemRef, 'serverId'> | null,
): AnalysisTrackRef {
  return analysisTrackRef(track.id, queueRef?.serverId ?? track.serverId);
}

export function analysisTrackRefForQueueItem(
  ref: Pick<QueueItemRef, 'trackId' | 'serverId'>,
): AnalysisTrackRef {
  return analysisTrackRef(ref.trackId, ref.serverId);
}

export function analysisTrackRefKey(ref: AnalysisTrackRef): string {
  return queueTrackIdentityKey(ref.trackId, ref.serverIndexKey);
}
