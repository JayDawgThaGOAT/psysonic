/**
 * Pure functions over a queue slice: the "is this id inside the prefetch
 * window?" check and the "give me the window's id list" collector. Window
 * = current track + next `LOUDNESS_BACKFILL_WINDOW_AHEAD` entries, with
 * duplicates collapsed.
 */
import type { QueueItemRef, Track } from '@/lib/media/trackTypes';
import { describe, expect, it } from 'vitest';
import {
  LOUDNESS_BACKFILL_WINDOW_AHEAD,
  collectLoudnessBackfillWindowTrackRefs,
  isTrackInsideLoudnessBackfillWindow,
} from '@/features/playback/store/loudnessBackfillWindow';
import { analysisTrackRef } from '@/features/playback/store/analysisTrackRef';

function track(id: string): Track {
  return { id, title: id, artist: 'A', album: 'X', albumId: 'X', duration: 100 };
}

// Thin-state: the window functions take queue refs; the currentTrack arg stays a Track.
function ref(id: string, serverId = 's'): QueueItemRef {
  return { serverId, trackId: id };
}

const target = (trackId: string, serverId = 's') => analysisTrackRef(trackId, serverId);

const big = Array.from({ length: 12 }, (_, i) => ref(`t${i}`));

describe('LOUDNESS_BACKFILL_WINDOW_AHEAD', () => {
  it('is the value the runtime expects', () => {
    expect(LOUDNESS_BACKFILL_WINDOW_AHEAD).toBe(5);
  });
});

describe('isTrackInsideLoudnessBackfillWindow', () => {
  it('matches the current track unconditionally', () => {
    expect(isTrackInsideLoudnessBackfillWindow(target('t0'), big, 0, track('t0'))).toBe(true);
  });

  it('matches an id inside the ahead window', () => {
    // queueIndex 0, AHEAD 5 → indices 1..5 are inside, t3 must hit.
    expect(isTrackInsideLoudnessBackfillWindow(target('t3'), big, 0, track('t0'))).toBe(true);
  });

  it('returns false for an id beyond the ahead window', () => {
    // From queueIndex 0, indices 1..5 inside → t6 (index 6) is outside.
    expect(isTrackInsideLoudnessBackfillWindow(target('t6'), big, 0, track('t0'))).toBe(false);
  });

  it('window slides with queueIndex', () => {
    // queueIndex 4, AHEAD 5 → indices 5..9 are inside, t9 must hit, t10 must not.
    expect(isTrackInsideLoudnessBackfillWindow(target('t9'), big, 4, track('t4'))).toBe(true);
    expect(isTrackInsideLoudnessBackfillWindow(target('t10'), big, 4, track('t4'))).toBe(false);
  });

  it('returns false for empty queue', () => {
    expect(isTrackInsideLoudnessBackfillWindow(target('t1'), [], 0, null)).toBe(false);
  });

  it('returns false for empty trackId', () => {
    expect(isTrackInsideLoudnessBackfillWindow(target(''), big, 0, track('t0'))).toBe(false);
  });

  it('returns false when currentTrack is null and id is not in the queue window', () => {
    expect(isTrackInsideLoudnessBackfillWindow(target('missing'), big, 0, null)).toBe(false);
  });

  it('does not match the same raw id from another server', () => {
    expect(isTrackInsideLoudnessBackfillWindow(target('t3', 'other'), big, 0, track('t0'))).toBe(false);
  });
});

describe('collectLoudnessBackfillWindowTrackRefs', () => {
  it('returns current + next 5 entries', () => {
    const refs = collectLoudnessBackfillWindowTrackRefs(big, 0, track('t0'));
    expect(refs).toEqual(['t0', 't1', 't2', 't3', 't4', 't5'].map(id => target(id)));
  });

  it('clamps the window to the end of the queue', () => {
    const refs = collectLoudnessBackfillWindowTrackRefs(big, 9, track('t9'));
    // queueIndex 9, AHEAD 5 → indices 10..11 available → t9, t10, t11
    expect(refs).toEqual(['t9', 't10', 't11'].map(id => target(id)));
  });

  it('omits the current track when null', () => {
    const refs = collectLoudnessBackfillWindowTrackRefs(big, 0, null);
    expect(refs).toEqual(['t1', 't2', 't3', 't4', 't5'].map(id => target(id)));
  });

  it('deduplicates when currentTrack is also in the ahead window', () => {
    const queue = [ref('a'), ref('b'), ref('a'), ref('c')];
    const refs = collectLoudnessBackfillWindowTrackRefs(queue, 0, track('a'));
    expect(refs).toEqual(['a', 'b', 'c'].map(id => target(id)));
  });

  it('preserves equal raw ids from different owners', () => {
    const queue = [ref('current', 'server-a'), ref('same', 'server-a'), ref('same', 'server-b')];
    expect(collectLoudnessBackfillWindowTrackRefs(queue, 0, track('current'))).toEqual([
      target('current', 'server-a'),
      target('same', 'server-a'),
      target('same', 'server-b'),
    ]);
  });

  it('omits an ownerless current track from an empty queue', () => {
    expect(collectLoudnessBackfillWindowTrackRefs([], 0, track('only'))).toEqual([]);
  });

  it('returns an empty list when nothing is playing and the queue is empty', () => {
    expect(collectLoudnessBackfillWindowTrackRefs([], 0, null)).toEqual([]);
  });
});
