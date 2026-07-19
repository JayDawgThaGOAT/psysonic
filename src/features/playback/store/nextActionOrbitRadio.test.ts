import { beforeEach, describe, expect, it, vi } from 'vitest';

// Control points for the test.
const {
  buildInfiniteQueueCandidates,
  generation,
  inOrbit,
  infiniteQueue,
  getSimilarSongs2ForServer,
  getTopSongsForServer,
  radioSeed,
} = vi.hoisted(() => ({
  buildInfiniteQueueCandidates: vi.fn(() => Promise.resolve([])),
  generation: { value: 1 },
  inOrbit: { value: false },
  infiniteQueue: { value: false },
  getSimilarSongs2ForServer: vi.fn(() => Promise.resolve([])),
  getTopSongsForServer: vi.fn(() => Promise.resolve([])),
  radioSeed: { artistId: null as string | null, serverId: null as string | null },
}));

vi.mock('@/lib/api/subsonicArtists', () => ({ getSimilarSongs2ForServer, getTopSongsForServer }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(() => Promise.resolve()) }));
vi.mock('@/store/orbitRuntime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/store/orbitRuntime')>()),
  isInOrbitSession: () => inOrbit.value,
}));
vi.mock('@/store/authStore', () => ({
  useAuthStore: { getState: () => ({ infiniteQueueEnabled: infiniteQueue.value }) },
}));
vi.mock('@/features/playback/store/radioSessionState', () => ({
  addRadioSessionSeen: vi.fn(),
  getCurrentRadioArtistId: () => radioSeed.artistId,
  getCurrentRadioServerId: () => radioSeed.serverId,
  hasRadioSessionSeen: () => false,
  isRadioFetching: () => false,
  setRadioFetching: vi.fn(),
}));
vi.mock('@/features/playback/store/infiniteQueueState', () => ({
  isInfiniteQueueFetching: () => false,
  setInfiniteQueueFetching: vi.fn(),
}));
vi.mock('@/features/playback/store/engineState', () => ({
  getPlayGeneration: () => generation.value,
  setIsAudioPaused: vi.fn(),
}));
vi.mock('@/features/playback/store/skipStarRating', () => ({ applySkipStarOnManualNext: vi.fn() }));
vi.mock('@/features/playback/store/queueTrackView', () => ({
  resolveQueueTrack: (ref: { trackId: string }) => ({
    id: ref.trackId,
    artistId: ref.trackId === 't1' ? 'next-artist' : ref.trackId === 't-cold' ? undefined : 'current-artist',
    artist: ref.trackId === 't1' ? 'Next Artist' : ref.trackId === 't-cold' ? '' : 'Current Artist',
  }),
}));
vi.mock('@/features/playback/utils/playback/buildInfiniteQueueCandidates', () => ({
  buildInfiniteQueueCandidates,
}));
vi.mock('@/lib/media/songToTrack', () => ({ songToTrack: (s: unknown) => s }));
vi.mock('@/features/playback/utils/playback/playbackServer', () => ({
  ensureQueueServerPinned: () => null,
  playbackProfileIdForTrack: (_track: unknown, ref: { serverId?: string }) => ref.serverId ?? 'srv-owner',
}));
vi.mock('@/features/playback/store/queueTrackResolver', () => ({ seedQueueResolver: vi.fn() }));
vi.mock('@/features/playback/store/queueItemRef', () => ({ toQueueItemRefs: () => [] }));

import { runNext } from '@/features/playback/store/nextAction';

function fakeGet(nextServerId = 'srv-owner', nextTrackId = 't1') {
  // index 0 → next is the radioAdded ref at index 1; nothing radio ahead of it,
  // so the ≤2-remaining proactive top-up is eligible.
  const queueItems = [
    { serverId: 'srv-owner', trackId: 't0', radioAdded: true },
    { serverId: nextServerId, trackId: nextTrackId, radioAdded: true },
    { serverId: 'srv-owner', trackId: 't2', radioAdded: false },
  ];
  return {
    queueItems,
    queueIndex: 0,
    repeatMode: 'off' as const,
    currentTrack: { id: 't0', artistId: 'current-artist', artist: 'Current Artist', radioAdded: true },
    playTrack: vi.fn(),
  };
}

beforeEach(() => {
  inOrbit.value = false;
  infiniteQueue.value = false;
  generation.value = 1;
  radioSeed.artistId = null;
  radioSeed.serverId = null;
  buildInfiniteQueueCandidates.mockReset().mockResolvedValue([]);
  getSimilarSongs2ForServer.mockClear();
  getTopSongsForServer.mockClear();
});

describe('runNext — radio proactive top-up Orbit lockout', () => {
  it('fires the radio top-up when not in an Orbit session', () => {
    const get = fakeGet as unknown as () => never;
    runNext(vi.fn(), get, /* manual */ false);
    expect(getSimilarSongs2ForServer).toHaveBeenCalledWith('srv-owner', 'next-artist');
  });

  it('skips the radio top-up while in an Orbit session', () => {
    inOrbit.value = true;
    const get = fakeGet as unknown as () => never;
    runNext(vi.fn(), get, /* manual */ false);
    expect(getSimilarSongs2ForServer).not.toHaveBeenCalled();
    expect(getTopSongsForServer).not.toHaveBeenCalled();
  });

  it('uses the upcoming ref owner and artist across a mixed-server transition', () => {
    const get = (() => fakeGet('srv-next')) as unknown as () => never;
    runNext(vi.fn(), get, /* manual */ false);

    expect(getSimilarSongs2ForServer).toHaveBeenCalledWith('srv-next', 'next-artist');
    expect(getTopSongsForServer).toHaveBeenCalledWith('srv-next', 'Next Artist');
  });

  it('does not reuse a stored seed from another owner for a cold upcoming ref', () => {
    radioSeed.artistId = 'old-artist';
    radioSeed.serverId = 'srv-owner';
    const get = (() => fakeGet('srv-next', 't-cold')) as unknown as () => never;

    runNext(vi.fn(), get, /* manual */ false);

    expect(getSimilarSongs2ForServer).not.toHaveBeenCalled();
    expect(getTopSongsForServer).not.toHaveBeenCalled();
  });
});

describe('runNext — exhausted top-up generation guards', () => {
  it('does not stop newer playback when an exhausted radio fetch rejects', async () => {
    let rejectSimilar: ((reason?: unknown) => void) | undefined;
    getSimilarSongs2ForServer.mockImplementationOnce(() => new Promise((_resolve, reject) => {
      rejectSimilar = reject;
    }));
    const stop = vi.fn();
    const state = {
      queueItems: [{ serverId: 'srv-owner', trackId: 't0', radioAdded: true }],
      queueIndex: 0,
      repeatMode: 'off' as const,
      currentTrack: {
        id: 't0', artistId: 'current-artist', artist: 'Current Artist', radioAdded: true,
      },
      stop,
    };

    runNext(vi.fn(), (() => state) as unknown as () => never, false);
    generation.value = 2;
    rejectSimilar?.(new Error('offline'));
    await Promise.resolve();
    await Promise.resolve();

    expect(stop).not.toHaveBeenCalled();
  });

  it('does not stop newer playback when an exhausted infinite fetch rejects', async () => {
    infiniteQueue.value = true;
    let rejectCandidates: ((reason?: unknown) => void) | undefined;
    buildInfiniteQueueCandidates.mockImplementationOnce(() => new Promise((_resolve, reject) => {
      rejectCandidates = reject;
    }));
    const stop = vi.fn();
    const state = {
      queueItems: [{ serverId: 'srv-owner', trackId: 't0' }],
      queueIndex: 0,
      repeatMode: 'off' as const,
      currentTrack: { id: 't0', artistId: 'current-artist', artist: 'Current Artist' },
      stop,
    };

    runNext(vi.fn(), (() => state) as unknown as () => never, false);
    generation.value = 2;
    rejectCandidates?.(new Error('offline'));
    await Promise.resolve();
    await Promise.resolve();

    expect(stop).not.toHaveBeenCalled();
  });
});
