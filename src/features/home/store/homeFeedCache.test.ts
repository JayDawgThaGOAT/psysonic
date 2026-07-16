import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearHomeFeedCache,
  patchHomeFeedCache,
  readHomeFeedCache,
  readHomeFeedCacheStale,
  writeHomeFeedCache,
} from '@/features/home/store/homeFeedCache';

function write(scopeKey: string, scopeVersion: number) {
  writeHomeFeedCache({
    scopeKey,
    scopeVersion,
    offsets: {
      starred: {},
      recent: { offset: 0, hasMore: false },
      random: {},
      mostPlayed: {},
      recentlyPlayed: { offset: 0, hasMore: false },
    },
    starred: [], recent: [], random: [], heroAlbums: [], mostPlayed: [],
    recentlyPlayed: [], randomArtists: [], discoverSongs: [],
  });
}

describe('homeFeedCache', () => {
  beforeEach(() => {
    clearHomeFeedCache();
    vi.useRealTimers();
  });

  it('keys current and stale reads by the complete scope', () => {
    write('scope-a', 1);
    write('scope-a', 2);
    write('scope-b', 1);
    expect(readHomeFeedCache('scope-a', 1)?.scopeVersion).toBe(1);
    expect(readHomeFeedCache('scope-a', 3)).toBeNull();
    expect(readHomeFeedCacheStale('scope-a')?.scopeVersion).toBe(2);
    expect(readHomeFeedCacheStale('missing')).toBeNull();
  });

  it('keeps only four recently used scope-version snapshots', () => {
    for (let version = 1; version <= 5; version += 1) write(`scope-${version}`, version);
    expect(readHomeFeedCache('scope-1', 1)).toBeNull();
    expect(readHomeFeedCache('scope-2', 2)).not.toBeNull();
    expect(readHomeFeedCache('scope-5', 5)).not.toBeNull();
  });

  it('expires current and stale snapshots after the ttl', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    write('scope', 1);
    vi.setSystemTime(15 * 60 * 1000 + 1);
    expect(readHomeFeedCache('scope', 1)).toBeNull();
    expect(readHomeFeedCacheStale('scope')).toBeNull();
  });

  it('patches an existing initial snapshot without invalidating its cache key', () => {
    write('scope', 1);
    const patched = patchHomeFeedCache('scope', 1, snapshot => ({
      ...snapshot,
      recent: [{
        id: 'new',
        name: 'New',
        artist: 'Artist',
        artistId: 'artist',
        songCount: 1,
        duration: 1,
      }],
      offsets: { ...snapshot.offsets, recent: { offset: 1, hasMore: true } },
    }));
    expect(patched?.recent.map(album => album.id)).toEqual(['new']);
    expect(readHomeFeedCache('scope', 1)?.offsets.recent).toEqual({ offset: 1, hasMore: true });
  });
});
