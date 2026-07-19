import type { QueueItemRef, Track } from '@/lib/media/trackTypes';
import { canonicalQueueServerKey } from '@/lib/server/serverIndexKey';
import { queueTrackIdentityKey } from '@/features/playback/utils/playback/queueIdentity';

export type AnalysisTrackRef = Readonly<{
  trackId: string;
  serverId: string | null;
}>;

export function analysisTrackRef(
  trackId: string,
  serverId?: string | null,
): AnalysisTrackRef {
  return {
    trackId,
    serverId: serverId ? (canonicalQueueServerKey(serverId) || serverId) : null,
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
  return queueTrackIdentityKey(ref.trackId, ref.serverId);
}
