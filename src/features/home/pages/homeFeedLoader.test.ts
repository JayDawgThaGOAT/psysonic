import { describe, expect, it, vi } from 'vitest';
import type { SubsonicAlbum } from '@/lib/api/subsonicTypes';
import type { LibraryAlbumDto } from '@/lib/api/library/dto';
import type { HomeFeedSnapshot } from '@/features/home/store/homeFeedCache';
import {
  HOME_REQUEST_TIMEOUT_MS,
  advanceHomeOffsets,
  allocateHomeQuotas,
  deriveHomeFeedScope,
  loadHomeFeed,
  loadMoreHomeAlbums,
  stableRoundRobin,
  withinHomeDeadline,
} from '@/features/home/pages/homeFeedLoader';

const mixConfig = { enabled: false, minSong: 0, minAlbum: 0, minArtist: 0 };

function album(serverId: string, id: string): SubsonicAlbum {
  return { id, name: id, artist: 'Artist', artistId: 'artist', songCount: 1, duration: 1, serverId };
}

function albumDto(serverId: string, id: string): LibraryAlbumDto {
  return { serverId, id, name: id, syncedAt: 1, rawJson: {} };
}

function snapshot(): HomeFeedSnapshot {
  const offsets = {
    starred: { a: 2, b: 3 },
    recent: { offset: 5, hasMore: true },
    random: { a: 2, b: 3 },
    mostPlayed: { a: 2, b: 3 },
    recentlyPlayed: { offset: 5, hasMore: true },
  };
  return {
    scopeKey: 'scope', scopeVersion: 1, savedAt: 1, offsets,
    starred: [album('a', 'existing')], recent: [], random: [], heroAlbums: [],
    mostPlayed: [], recentlyPlayed: [], randomArtists: [], discoverSongs: [],
  };
}

describe('homeFeedLoader pure helpers', () => {
  it('allocates floor and remainder quotas in server order', () => {
    expect(allocateHomeQuotas(5, 3)).toEqual([2, 2, 1]);
    expect(allocateHomeQuotas(2, 4)).toEqual([1, 1, 0, 0]);
  });

  it('round-robins groups without reordering within a server', () => {
    expect(stableRoundRobin([['a1', 'a2'], ['b1'], ['c1', 'c2']], 5))
      .toEqual(['a1', 'b1', 'c1', 'a2', 'c2']);
  });

  it('builds a stable complete scope key in auth server order', () => {
    const scope = deriveHomeFeedScope({
      servers: [{ id: 'b' }, { id: 'a' }, { id: 'c' }],
      activeServerId: 'c',
      libraryBrowseServerIds: ['a', 'b'],
      libraryBrowseSelectionByServer: { a: [], b: ['jazz', 'rock'] },
    });
    expect(scope.serverIds).toEqual(['b', 'a']);
    expect(scope.scopeKey).toBe(JSON.stringify([['b', ['jazz', 'rock']], ['a', []]]));
    expect(deriveHomeFeedScope({
      servers: [{ id: 'a' }, { id: 'c' }], activeServerId: 'c',
      libraryBrowseServerIds: [], libraryBrowseSelectionByServer: { c: [] },
    }).serverIds).toEqual(['c']);
  });

  it('advances only the requested cursor by raw row counts', () => {
    const before = snapshot().offsets;
    const after = advanceHomeOffsets(before, 'starred', { a: 4, b: 1 });
    expect(after.starred).toEqual({ a: 6, b: 4 });
    expect(after.recent).toBe(before.recent);
  });

  it('returns the fallback when work exceeds the Home deadline', async () => {
    vi.useFakeTimers();
    const pending = new Promise<string>(() => {});
    const result = withinHomeDeadline(pending, 'timed-out');
    await vi.advanceTimersByTimeAsync(HOME_REQUEST_TIMEOUT_MS);
    await expect(result).resolves.toBe('timed-out');
    vi.useRealTimers();
  });
});

describe('homeFeedLoader failure isolation', () => {
  it('never requests newest/recent from servers and preserves local chronological order', async () => {
    const getAlbumListForServer = vi.fn(async (
      serverId: string,
      type: string,
      size: number,
      _offset: number,
      _extra: Record<string, unknown>,
      _timeout: number,
    ) => {
      return Array.from({ length: size }, (_, index) => album(serverId, `${type}-${index}`));
    });
    const libraryScopeListMainstageAlbums = vi.fn(async (_serverId, request) => ({
      albums: request.feed === 'newReleases'
        ? [albumDto('b', 'new-3'), albumDto('a', 'new-2'), albumDto('b', 'new-1')]
        : [albumDto('a', 'played-3'), albumDto('b', 'played-2')],
      hasMore: true,
    }));
    const result = await loadHomeFeed({
      serverIds: ['a', 'b'], scopeKey: 'scope', scopeVersion: 7, randomSize: 20,
      anchorServerId: 'a',
      scopes: [{ serverId: 'a', libraryId: 'lib-a' }, { serverId: 'b', libraryId: 'lib-b' }],
      showArtists: false, showSongs: false, mixConfig,
      deps: {
        getAlbumListForServer: getAlbumListForServer as never,
        libraryScopeListMainstageAlbums,
        getArtistsForServer: vi.fn(async () => []),
        getRandomSongsForServer: vi.fn(async () => []),
        runLocalRandomSongs: vi.fn(async () => null),
        filterAlbumsByMixRatingsAcrossServers: vi.fn(async albums => albums),
        shuffle: items => items,
      },
    });
    expect(getAlbumListForServer.mock.calls.map(call => call[1])).not.toContain('newest');
    expect(getAlbumListForServer.mock.calls.map(call => call[1])).not.toContain('recent');
    expect(result.recent.map(item => `${item.serverId}:${item.id}`))
      .toEqual(['b:new-3', 'a:new-2', 'b:new-1']);
    expect(result.recentlyPlayed.map(item => `${item.serverId}:${item.id}`))
      .toEqual(['a:played-3', 'b:played-2']);
    expect(result.offsets.recent).toEqual({ offset: 3, hasMore: true });
    expect(result.offsets.recentlyPlayed).toEqual({ offset: 2, hasMore: true });
    expect(result.starred.some(item => item.serverId === 'a')).toBe(true);
    expect(getAlbumListForServer.mock.calls.every(call => call[5] === HOME_REQUEST_TIMEOUT_MS)).toBe(true);
  });

  it('treats local errors as authoritative empty without network fallback', async () => {
    const getAlbumListForServer = vi.fn(async (_serverId: string, _type: string) => []);
    const result = await loadHomeFeed({
      serverIds: ['a'], scopeKey: 'scope', scopeVersion: 1, randomSize: 0,
      anchorServerId: 'a', scopes: [{ serverId: 'a', libraryId: 'lib-a' }],
      showArtists: false, showSongs: false, mixConfig,
      deps: {
        getAlbumListForServer: getAlbumListForServer as never,
        libraryScopeListMainstageAlbums: vi.fn(async () => { throw new Error('local failed'); }),
        getArtistsForServer: vi.fn(async () => []),
        getRandomSongsForServer: vi.fn(async () => []),
        runLocalRandomSongs: vi.fn(async () => null),
        filterAlbumsByMixRatingsAcrossServers: vi.fn(async albums => albums),
        shuffle: items => items,
      },
    });
    expect(result.recent).toEqual([]);
    expect(result.recentlyPlayed).toEqual([]);
    expect(result.offsets.recent).toEqual({ offset: 0, hasMore: false });
    expect(result.offsets.recentlyPlayed).toEqual({ offset: 0, hasMore: false });
    expect(getAlbumListForServer.mock.calls.map(call => call[1])).not.toContain('newest');
    expect(getAlbumListForServer.mock.calls.map(call => call[1])).not.toContain('recent');
  });

  it('uses per-server offsets, dedupes owner-qualified ids, and advances raw cursors', async () => {
    const getAlbumListForServer = vi.fn(async (
      serverId: string,
      _type: string,
      _size: number,
      _offset: number,
      _extra: Record<string, unknown>,
      _timeout: number,
    ) => (
      serverId === 'a'
        ? [album('a', 'existing'), album('a', 'new-a')]
        : [album('b', 'existing')]
    ));
    const result = await loadMoreHomeAlbums({
      snapshot: snapshot(), section: 'starred', mixConfig,
      anchorServerId: 'a', scopes: [],
      deps: {
        getAlbumListForServer: getAlbumListForServer as never,
        filterAlbumsByMixRatingsAcrossServers: vi.fn(async albums => albums),
      },
    });
    expect(getAlbumListForServer.mock.calls.map(call => [call[0], call[3], call[5]]))
      .toEqual([['a', 2, HOME_REQUEST_TIMEOUT_MS], ['b', 3, HOME_REQUEST_TIMEOUT_MS]]);
    expect(result.starred.map(item => `${item.serverId}:${item.id}`))
      .toEqual(['a:existing', 'b:existing', 'a:new-a']);
    expect(result.offsets.starred).toEqual({ a: 4, b: 4 });
  });

  it('uses one global local offset for chronological pagination and never falls back', async () => {
    const getAlbumListForServer = vi.fn(async () => []);
    const libraryScopeListMainstageAlbums = vi.fn(async () => ({
      albums: [albumDto('b', 'next-2'), albumDto('a', 'next-1')],
      hasMore: false,
    }));
    const result = await loadMoreHomeAlbums({
      snapshot: snapshot(), section: 'recent', mixConfig,
      anchorServerId: 'a', scopes: [{ serverId: 'a', libraryId: 'lib-a' }],
      deps: {
        getAlbumListForServer: getAlbumListForServer as never,
        libraryScopeListMainstageAlbums,
        filterAlbumsByMixRatingsAcrossServers: vi.fn(async albums => albums),
      },
    });
    expect(libraryScopeListMainstageAlbums).toHaveBeenCalledWith('a', {
      scopes: [{ serverId: 'a', libraryId: 'lib-a' }],
      feed: 'newReleases',
      limit: 12,
      offset: 5,
    });
    expect(getAlbumListForServer).not.toHaveBeenCalled();
    expect(result.recent.map(item => `${item.serverId}:${item.id}`))
      .toEqual(['b:next-2', 'a:next-1']);
    expect(result.offsets.recent).toEqual({ offset: 7, hasMore: false });
  });
});
