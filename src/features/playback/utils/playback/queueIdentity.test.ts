/**
 * Pure helpers extracted from playerStore. The interesting behaviour is the
 * `stream:` prefix normalization (Rust events sometimes wrap track ids when
 * routing through the HTTP source) and the no-op detection in
 * `queuesStructuralEqual` that prevents unnecessary store rewrites.
 */
import type { Track } from '@/lib/media/trackTypes';
import { describe, expect, it } from 'vitest';
import {
  normalizeAnalysisTrackId,
  queueIdentityContainsTrackId,
  queueItemIdentityKey,
  queueItemRefMatchesTrack,
  queueTrackIdentityMatches,
  queuesStructuralEqual,
  sameQueueItemRef,
  sameQueueTrack,
  sameQueueTrackId,
  shallowCloneQueueTracks,
} from '@/features/playback/utils/playback/queueIdentity';

function track(id: string, overrides: Partial<Track> = {}): Track {
  return {
    id,
    title: `Title ${id}`,
    artist: 'Artist',
    album: 'Album',
    albumId: 'A',
    duration: 180,
    ...overrides,
  };
}

describe('normalizeAnalysisTrackId', () => {
  it('strips the stream: prefix', () => {
    expect(normalizeAnalysisTrackId('stream:abc123')).toBe('abc123');
  });

  it('returns bare ids unchanged', () => {
    expect(normalizeAnalysisTrackId('abc123')).toBe('abc123');
  });

  it('returns null for null / undefined / empty', () => {
    expect(normalizeAnalysisTrackId(null)).toBeNull();
    expect(normalizeAnalysisTrackId(undefined)).toBeNull();
    expect(normalizeAnalysisTrackId('')).toBeNull();
  });
});

describe('sameQueueTrackId', () => {
  it('matches bare ids', () => {
    expect(sameQueueTrackId('a', 'a')).toBe(true);
    expect(sameQueueTrackId('a', 'b')).toBe(false);
  });

  it('matches across stream: prefix mismatch', () => {
    expect(sameQueueTrackId('stream:a', 'a')).toBe(true);
    expect(sameQueueTrackId('a', 'stream:a')).toBe(true);
    expect(sameQueueTrackId('stream:a', 'stream:a')).toBe(true);
  });

  it('returns false when either side is null', () => {
    expect(sameQueueTrackId(null, 'a')).toBe(false);
    expect(sameQueueTrackId('a', null)).toBe(false);
    expect(sameQueueTrackId(null, null)).toBe(false);
  });
});

describe('mixed-server queue identity', () => {
  it('distinguishes equal raw ids owned by different servers', () => {
    const a = track('shared', { serverId: 'srv-a' });
    const b = track('shared', { serverId: 'srv-b' });

    expect(sameQueueTrack(a, b)).toBe(false);
    expect(queueItemRefMatchesTrack({ serverId: 'srv-a', trackId: 'shared' }, b)).toBe(false);
    expect(sameQueueItemRef(
      { serverId: 'srv-a', trackId: 'shared' },
      { serverId: 'srv-b', trackId: 'shared' },
    )).toBe(false);
  });

  it('normalizes stream ids inside composite keys', () => {
    expect(queueItemIdentityKey({ serverId: 'srv-a', trackId: 'stream:shared' }))
      .toBe(queueItemIdentityKey({ serverId: 'srv-a', trackId: 'shared' }));
  });

  it('matches composite preload identities without accepting another owner', () => {
    const identity = queueItemIdentityKey({ serverId: 'srv-a', trackId: 'shared' });
    expect(queueTrackIdentityMatches(identity, 'shared', 'srv-a')).toBe(true);
    expect(queueTrackIdentityMatches(identity, 'shared', 'srv-b')).toBe(false);
    expect(queueIdentityContainsTrackId(identity, 'stream:shared')).toBe(true);
  });

  it('keeps raw-id compatibility when one side is legacy ownerless data', () => {
    expect(sameQueueTrack(track('shared'), track('shared', { serverId: 'srv-a' }))).toBe(true);
    expect(queueItemRefMatchesTrack(
      { serverId: '', trackId: 'shared' },
      track('shared', { serverId: 'srv-a' }),
    )).toBe(true);
  });
});

describe('queuesStructuralEqual', () => {
  it('returns true for same ids in same order', () => {
    expect(queuesStructuralEqual([track('a'), track('b')], [track('a'), track('b')])).toBe(true);
  });

  it('returns true when one side wraps ids with stream:', () => {
    expect(queuesStructuralEqual(
      [track('a'), track('b')],
      [track('stream:a'), track('stream:b')],
    )).toBe(true);
  });

  it('returns false for different lengths', () => {
    expect(queuesStructuralEqual([track('a')], [track('a'), track('b')])).toBe(false);
  });

  it('returns false for any id mismatch', () => {
    expect(queuesStructuralEqual([track('a'), track('b')], [track('a'), track('c')])).toBe(false);
  });

  it('returns false for equal raw ids from different servers', () => {
    expect(queuesStructuralEqual(
      [track('shared', { serverId: 'srv-a' })],
      [track('shared', { serverId: 'srv-b' })],
    )).toBe(false);
  });

  it('treats empty queues as equal', () => {
    expect(queuesStructuralEqual([], [])).toBe(true);
  });
});

describe('shallowCloneQueueTracks', () => {
  it('returns a new array with new objects (callers can mutate freely)', () => {
    const original = [track('a'), track('b')];
    const cloned = shallowCloneQueueTracks(original);
    expect(cloned).not.toBe(original);
    expect(cloned[0]).not.toBe(original[0]);
    expect(cloned[1]).not.toBe(original[1]);
    expect(cloned).toEqual(original);
  });

  it('preserves all fields', () => {
    const original = [track('a', { coverArt: 'cover', userRating: 5, autoAdded: true })];
    const cloned = shallowCloneQueueTracks(original);
    expect(cloned[0]).toEqual(original[0]);
  });

  it('handles empty queues', () => {
    expect(shallowCloneQueueTracks([])).toEqual([]);
  });
});
