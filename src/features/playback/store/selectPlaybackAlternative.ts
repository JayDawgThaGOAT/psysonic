import { getPlayGeneration } from '@/features/playback/store/engineState';
import { usePlayerStore } from '@/features/playback/store/playerStore';
import {
  dismissPlaybackSourceFailure,
  setPlaybackAlternativeActionError,
  setPlaybackAlternativeSelecting,
  usePlaybackAlternativeStore,
} from '@/features/playback/store/playbackAlternativeStore';
import { getCachedTrack, resolveBatch } from '@/features/playback/store/queueTrackResolver';
import { canonicalQueueServerKey } from '@/lib/server/serverIndexKey';
import { sameQueueItemRef } from '@/features/playback/utils/playback/queueIdentity';
import type { QueueItemRef } from '@/lib/media/trackTypes';
import type { LibraryEntitySourceDto } from '@/lib/api/library';

function replacementRef(expected: QueueItemRef, source: LibraryEntitySourceDto): QueueItemRef {
  return {
    serverId: canonicalQueueServerKey(source.serverId),
    trackId: source.id,
    autoAdded: expected.autoAdded,
    radioAdded: expected.radioAdded,
    playNextAdded: expected.playNextAdded,
  };
}

export async function selectPlaybackAlternative(source: LibraryEntitySourceDto): Promise<boolean> {
  const failure = usePlaybackAlternativeStore.getState().failure;
  if (!failure || getPlayGeneration() !== failure.generation) return false;

  const player = usePlayerStore.getState();
  const currentRef = player.queueItems[failure.queueIndex];
  if (!currentRef || !sameQueueItemRef(currentRef, failure.expectedRef)) {
    setPlaybackAlternativeActionError();
    return false;
  }

  const nextRef = replacementRef(failure.expectedRef, source);
  setPlaybackAlternativeSelecting(source);
  try {
    await resolveBatch([nextRef]);
    const track = getCachedTrack(nextRef);
    if (!track || getPlayGeneration() !== failure.generation) {
      setPlaybackAlternativeActionError();
      return false;
    }

    const latest = usePlayerStore.getState();
    const latestRef = latest.queueItems[failure.queueIndex];
    if (!latestRef || !sameQueueItemRef(latestRef, failure.expectedRef)) {
      setPlaybackAlternativeActionError();
      return false;
    }
    if (!latest.replaceQueueItemSource(failure.queueIndex, failure.expectedRef, nextRef, false)) {
      setPlaybackAlternativeActionError();
      return false;
    }

    dismissPlaybackSourceFailure();
    usePlayerStore.getState().playTrack(
      { ...track, serverId: source.serverId },
      undefined,
      true,
      false,
      failure.queueIndex,
    );
    return true;
  } catch (error) {
    console.error('[psysonic] alternative source play failed:', error);
    setPlaybackAlternativeActionError();
    return false;
  }
}
