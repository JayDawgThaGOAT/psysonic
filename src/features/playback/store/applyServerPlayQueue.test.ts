import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyMappedQueueProjection,
  fingerprintFromLocalQueue,
  fingerprintFromServer,
  mergeQueueServerProjection,
  playQueueFingerprintsEqual,
} from '@/features/playback/store/applyServerPlayQueue';
import { usePlayerStore } from '@/features/playback/store/playerStore';
import { resetPlayerStore } from '@/test/helpers/storeReset';

describe('playQueueFingerprintsEqual', () => {
  beforeEach(() => {
    resetPlayerStore();
  });

  it('compares track order, current id, and position within tolerance', () => {
    const a = { trackIds: ['1', '2'], currentId: '1', positionMs: 1000 };
    const b = { trackIds: ['1', '2'], currentId: '1', positionMs: 2500 };
    expect(playQueueFingerprintsEqual(a, b)).toBe(true);
    expect(playQueueFingerprintsEqual(a, { ...b, positionMs: 4000 })).toBe(false);
  });

  it('fingerprintFromLocalQueue reads the player store', () => {
    usePlayerStore.setState({
      queueItems: [{ serverId: 'a.test', trackId: 't1' }],
      currentTrack: { id: 't1', title: 'T', artist: '', album: 'A', albumId: 'al', duration: 60 },
      currentTime: 3.5,
    });
    expect(fingerprintFromLocalQueue()).toEqual({
      trackIds: ['t1'],
      currentId: 't1',
      positionMs: 3500,
    });
  });

  it('fingerprintFromServer maps Subsonic playQueue fields', () => {
    expect(fingerprintFromServer({
      songs: [{ id: 'a' }, { id: 'b' }] as never,
      current: 'b',
      position: 1200,
    })).toEqual({
      trackIds: ['a', 'b'],
      currentId: 'b',
      positionMs: 1200,
    });
  });
});

describe('mergeQueueServerProjection', () => {
  it('replaces only the selected server slots and preserves mixed ordering', () => {
    const b1 = { serverId: 'b', trackId: 'b1' };
    expect(mergeQueueServerProjection(
      [
        { serverId: 'a', trackId: 'a1' },
        b1,
        { serverId: 'a', trackId: 'a2' },
      ],
      'a',
      [
        { serverId: 'a', trackId: 'a1' },
        { serverId: 'a', trackId: 'a3' },
      ],
    )).toEqual([
      { serverId: 'a', trackId: 'a1' },
      b1,
      { serverId: 'a', trackId: 'a3' },
    ]);
  });

  it('preserves local surplus by default and inserts remote surplus after the last prior slot', () => {
    const b1 = { serverId: 'b', trackId: 'b1' };
    expect(mergeQueueServerProjection(
      [
        { serverId: 'a', trackId: 'a1' },
        { serverId: 'a', trackId: 'a2' },
        b1,
      ],
      'a',
      [
        { serverId: 'a', trackId: 'a1' },
        { serverId: 'a', trackId: 'a3' },
        { serverId: 'a', trackId: 'a4' },
      ],
    )).toEqual([
      { serverId: 'a', trackId: 'a1' },
      { serverId: 'a', trackId: 'a3' },
      { serverId: 'a', trackId: 'a4' },
      b1,
    ]);

    expect(mergeQueueServerProjection(
      [{ serverId: 'a', trackId: 'a1' }, b1, { serverId: 'a', trackId: 'a2' }],
      'a',
      [{ serverId: 'a', trackId: 'a3' }],
    )).toEqual([{ serverId: 'a', trackId: 'a3' }, b1, { serverId: 'a', trackId: 'a2' }]);

    expect(mergeQueueServerProjection(
      [{ serverId: 'a', trackId: 'a1' }, b1, { serverId: 'a', trackId: 'a2' }],
      'a',
      [{ serverId: 'a', trackId: 'a3' }],
      false,
    )).toEqual([{ serverId: 'a', trackId: 'a3' }, b1]);
  });
});

describe('applyMappedQueueProjection', () => {
  it('preserves the current non-target item and updates its shifted index', () => {
    const currentTrack = { id: 'b1', title: 'B1', artist: '', album: '', albumId: '', duration: 60, serverId: 'b' };
    usePlayerStore.setState({
      queueItems: [
        { serverId: 'a', trackId: 'a1' },
        { serverId: 'a', trackId: 'a2' },
        { serverId: 'b', trackId: 'b1' },
      ],
      queueIndex: 2,
      currentTrack,
    });

    applyMappedQueueProjection(
      [
        { id: 'a1', title: 'A1', artist: '', album: '', albumId: '', duration: 60, serverId: 'a' },
        { id: 'a3', title: 'A3', artist: '', album: '', albumId: '', duration: 60, serverId: 'a' },
        { id: 'a4', title: 'A4', artist: '', album: '', albumId: '', duration: 60, serverId: 'a' },
      ],
      { songs: [] as never, current: 'a1', position: 12_000 },
      'a',
    );

    expect(usePlayerStore.getState().queueItems.map(ref => ref.trackId)).toEqual(['a1', 'a3', 'a4', 'b1']);
    expect(usePlayerStore.getState().queueIndex).toBe(3);
    expect(usePlayerStore.getState().currentTrack).toBe(currentTrack);
    expect(usePlayerStore.getState().currentTime).toBe(0);
  });
});
