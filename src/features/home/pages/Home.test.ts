import { describe, expect, it, vi } from 'vitest';

vi.mock('@/cover/serverScope', () => ({
  coverServerScopeForServerId: (serverId?: string) => ({ kind: 'test', serverId }),
}));

import {
  groupHomeCoverPrefetchBuckets,
  homeDiscoverCoverPrefetchBucket,
  shouldOfferHomeLoadMore,
} from './homeCoverPrefetch';

describe('groupHomeCoverPrefetchBuckets', () => {
  it('splits mixed albums, artists, and songs into owner-scoped buckets', () => {
    const buckets = groupHomeCoverPrefetchBuckets([{
      albums: [
        { id: 'album-a', serverId: 'srv-a' },
        { id: 'album-b', serverId: 'srv-b' },
      ],
      artists: [{ id: 'artist-a', serverId: 'srv-a' }],
      songs: [
        { id: 'song-a', albumId: 'album-a', serverId: 'srv-a' },
        { id: 'song-b', albumId: 'album-b', serverId: 'srv-b' },
      ],
      priority: 'high',
    } as never]);

    expect(buckets).toHaveLength(2);
    expect(buckets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        albums: [expect.objectContaining({ id: 'album-a' })],
        artists: [expect.objectContaining({ id: 'artist-a' })],
        songs: [expect.objectContaining({ id: 'song-a' })],
        serverScope: { kind: 'test', serverId: 'srv-a' },
      }),
      expect.objectContaining({
        albums: [expect.objectContaining({ id: 'album-b' })],
        songs: [expect.objectContaining({ id: 'song-b' })],
        serverScope: { kind: 'test', serverId: 'srv-b' },
      }),
    ]));
  });

  it('keeps mixed-owner Discover refs in one globally limited bucket', () => {
    const bucket = homeDiscoverCoverPrefetchBucket(Array.from({ length: 18 }, (_, index) => ({
      albumId: `album-${index}`,
      coverArt: `cover-${index}`,
      serverId: index % 2 === 0 ? 'srv-a' : 'srv-b',
    })));

    const buckets = groupHomeCoverPrefetchBuckets([bucket]);

    expect(buckets).toHaveLength(1);
    expect(buckets[0]?.limit).toBe(16);
    expect(buckets[0]?.refs).toHaveLength(18);
    expect(buckets[0]?.refs?.[0]).toEqual(expect.objectContaining({
      cacheEntityId: 'album-0',
      fetchCoverArtId: 'cover-0',
      serverScope: { kind: 'test', serverId: 'srv-a' },
    }));
    expect(buckets[0]?.refs?.[1]).toEqual(expect.objectContaining({
      serverScope: { kind: 'test', serverId: 'srv-b' },
    }));
  });
});

describe('shouldOfferHomeLoadMore', () => {
  it('only offers pagination while the local feed reports more rows', () => {
    expect(shouldOfferHomeLoadMore(true)).toBe(true);
    expect(shouldOfferHomeLoadMore(false)).toBe(false);
  });
});
