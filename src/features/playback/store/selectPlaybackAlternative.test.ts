import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveBatch: vi.fn(),
  getCachedTrack: vi.fn(),
}));

vi.mock('@/features/playback/store/queueTrackResolver', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/playback/store/queueTrackResolver')>()),
  resolveBatch: mocks.resolveBatch,
  getCachedTrack: mocks.getCachedTrack,
}));

import { selectPlaybackAlternative } from './selectPlaybackAlternative';
import { usePlaybackAlternativeStore } from './playbackAlternativeStore';
import { usePlayerStore } from './playerStore';
import { _resetEngineStateForTest, bumpPlayGeneration } from './engineState';
import { resetAuthStore, resetPlayerStore } from '@/test/helpers/storeReset';
import { makeServer, makeTrack } from '@/test/helpers/factories';
import { useAuthStore } from '@/store/authStore';
import type { PlaybackAlternativeSource } from '@/features/playback/utils/playback/availablePlaybackAlternativeSources';
import {
  _resetQueuePlaybackIdleForTest,
  isIdleQueuePullSuspended,
} from '@/features/playback/store/queuePlaybackIdle';
import { _resetQueueSyncForTest } from '@/features/playback/store/queueSync';

const serverA = makeServer({ id: 'srv-a', url: 'https://a.test' });
const serverB = makeServer({ id: 'srv-b', url: 'https://b.test' });
const expectedRef = { serverId: 'a.test', trackId: 'failed', playNextAdded: true };
const alternative: PlaybackAlternativeSource = {
  serverId: serverB.id,
  id: 'replacement',
  libraryId: '',
  priority: 0,
  durationSec: 180,
  suffix: 'flac',
  bitRate: 1_000,
  sizeBytes: 30_000_000,
  starredAt: null,
  userRating: null,
  local: false,
  serverLabel: 'B',
};

function seedFailure(generation: number): void {
  usePlaybackAlternativeStore.setState({
    failure: {
      key: `${generation}:1:a.test:failed`,
      generation,
      queueIndex: 1,
      expectedRef,
      track: makeTrack({ id: 'failed', serverId: serverA.id }),
      detail: 'decode error',
    },
    status: 'ready',
    sources: [alternative],
    selectingKey: null,
    actionError: null,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  resetAuthStore();
  resetPlayerStore();
  _resetEngineStateForTest();
  _resetQueuePlaybackIdleForTest();
  _resetQueueSyncForTest();
  Object.values(mocks).forEach(mock => mock.mockReset());
  mocks.resolveBatch.mockResolvedValue(undefined);
  useAuthStore.setState({ servers: [serverA, serverB], activeServerId: serverA.id });
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('selectPlaybackAlternative', () => {
  it('revalidates the frozen slot after asynchronous resolution', async () => {
    let finishResolve!: () => void;
    mocks.resolveBatch.mockImplementation(() => new Promise<void>(resolve => { finishResolve = resolve; }));
    mocks.getCachedTrack.mockReturnValue(makeTrack({ id: alternative.id, serverId: serverB.id }));
    const generation = bumpPlayGeneration();
    seedFailure(generation);
    const playTrack = vi.fn();
    usePlayerStore.setState({
      queueItems: [
        { serverId: 'a.test', trackId: 'head' },
        expectedRef,
      ],
      queueIndex: 1,
      playTrack,
    });

    const selection = selectPlaybackAlternative(alternative);
    usePlayerStore.setState({
      queueItems: [
        { serverId: 'a.test', trackId: 'head' },
        { serverId: 'a.test', trackId: 'user-selected-another-track' },
      ],
    });
    finishResolve();

    await expect(selection).resolves.toBe(false);
    expect(playTrack).not.toHaveBeenCalled();
    expect(usePlaybackAlternativeStore.getState().actionError).toBe('play_failed');
  });

  it('replaces only the captured slot and starts the concrete owner', async () => {
    const selectedTrack = makeTrack({ id: alternative.id, serverId: serverB.id, title: 'Replacement' });
    mocks.getCachedTrack.mockReturnValue(selectedTrack);
    const generation = bumpPlayGeneration();
    seedFailure(generation);
    const playTrack = vi.fn();
    usePlayerStore.setState({
      queueItems: [
        { serverId: 'a.test', trackId: 'head' },
        expectedRef,
        { serverId: 'a.test', trackId: 'tail' },
      ],
      queueIndex: 1,
      currentTrack: makeTrack({ id: 'failed', serverId: serverA.id }),
      playTrack,
    });

    await expect(selectPlaybackAlternative(alternative)).resolves.toBe(true);

    expect(usePlayerStore.getState().queueItems).toEqual([
      { serverId: 'a.test', trackId: 'head' },
      { serverId: 'b.test', trackId: 'replacement', playNextAdded: true },
      { serverId: 'a.test', trackId: 'tail' },
    ]);
    expect(playTrack).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'replacement', serverId: serverB.id }),
      undefined,
      true,
      false,
      1,
    );
    expect(usePlaybackAlternativeStore.getState().failure).toBeNull();
    expect(isIdleQueuePullSuspended()).toBe(false);
  });
});
