import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/store/authStore';
import {
  fetchMostPlayedAlbums,
  fetchStatisticsLibraryAggregates,
  fetchStatisticsOverview,
  statisticsPageCacheKey,
} from '@/lib/api/subsonicStatistics';
import { getArtistsAcrossLibraries } from '@/lib/api/subsonicArtists';
import {
  resetServerReachabilitySnapshot,
  setServerReachability,
} from '@/lib/network/serverReachability';

const apiMock = vi.fn();
const indexStatisticsMock = vi.fn();
const indexMostPlayedMock = vi.fn();
const getAlbumListForServerMock = vi.fn();
const getRandomSongsForServerMock = vi.fn();
const getArtistsForServerMock = vi.fn();
const readyLibraryServerKeysMock = vi.fn();

beforeEach(resetServerReachabilitySnapshot);

vi.mock('@/lib/api/subsonicLibrary', () => ({
  getAlbumListForServer: (...args: unknown[]) => getAlbumListForServerMock(...args),
  getRandomSongsForServer: (...args: unknown[]) => getRandomSongsForServerMock(...args),
}));

vi.mock('@/lib/api/subsonicArtists', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/api/subsonicArtists')>()),
  getArtistsForServer: (...args: unknown[]) => getArtistsForServerMock(...args),
}));

vi.mock('@/lib/library/libraryReady', () => ({
  readyLibraryServerKeys: (...args: unknown[]) => readyLibraryServerKeysMock(...args),
}));

vi.mock('@/lib/api/subsonicClient', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/api/subsonicClient')>();
  return {
    ...actual,
    api: (...args: unknown[]) => apiMock(...args),
    libraryFilterParams: () => ({}),
  };
});

vi.mock('@/lib/api/library/scopeReads', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/api/library/scopeReads')>();
  return {
    ...actual,
    libraryScopeStatistics: (...args: unknown[]) => indexStatisticsMock(...args),
    libraryScopeMostPlayed: (...args: unknown[]) => indexMostPlayedMock(...args),
  };
});

describe('statisticsPageCacheKey', () => {
  beforeEach(() => {
    useAuthStore.setState({
      activeServerId: 'srv-1',
      musicLibrarySelectionByServer: {},
      musicLibraryFilterByServer: {},
    });
  });

  it('uses all-libraries segment when nothing is selected', () => {
    expect(statisticsPageCacheKey('statsAgg')).toBe('statsAgg:srv-1:all');
  });

  it('uses comma-joined scope for multi-library selection', () => {
    useAuthStore.setState({
      musicLibrarySelectionByServer: { 'srv-1': ['lib-b', 'lib-a'] },
      musicLibraryFilterByServer: { 'srv-1': 'lib-b' },
    });
    expect(statisticsPageCacheKey('statsOverview')).toBe('statsOverview:srv-1:lib-b,lib-a');
  });
});

describe('getArtistsAcrossLibraries', () => {
  beforeEach(() => {
    apiMock.mockReset();
  });

  it('merges artists from each library without duplicate ids', async () => {
    apiMock
      .mockResolvedValueOnce({
        artists: { index: [{ artist: [{ id: 'a1', name: 'One' }] }] },
      })
      .mockResolvedValueOnce({
        artists: { index: [{ artist: [{ id: 'a1', name: 'One dup' }, { id: 'a2', name: 'Two' }] }] },
      });

    const artists = await getArtistsAcrossLibraries(['1', '2']);
    expect(artists.map(a => a.id).sort()).toEqual(['a1', 'a2']);
    expect(apiMock).toHaveBeenCalledTimes(2);
    expect(apiMock.mock.calls[0]?.[1]).toEqual({ musicFolderId: '1' });
    expect(apiMock.mock.calls[1]?.[1]).toEqual({ musicFolderId: '2' });
  });
});

describe('fetchStatisticsLibraryAggregates', () => {
  beforeEach(() => {
    indexStatisticsMock.mockReset();
    getAlbumListForServerMock.mockReset();
    getRandomSongsForServerMock.mockReset().mockResolvedValue([]);
    getArtistsForServerMock.mockReset().mockResolvedValue([]);
    readyLibraryServerKeysMock.mockReset().mockImplementation(async (serverIds: string[]) => serverIds);
    useAuthStore.setState({
      activeServerId: 'stats-a',
      servers: [
        { id: 'stats-a', name: 'A', url: 'https://a.test', username: 'u', password: 'p' },
        { id: 'stats-b', name: 'B', url: 'https://b.test', username: 'u', password: 'p' },
      ],
      libraryBrowseServerIds: ['stats-a', 'stats-b'],
      libraryBrowseSelectionByServer: { 'stats-a': ['rock'], 'stats-b': [] },
    });
  });

  it('uses selected index scopes and reuses the seven-minute aggregate cache', async () => {
    indexStatisticsMock.mockResolvedValue({
      artistCount: 9,
      albumCount: 20,
      songCount: 80,
      playtimeSec: 12_345,
      genres: [{ value: 'Rock', songCount: 40, albumCount: 10 }],
      formats: [{ value: 'FLAC', songCount: 60 }],
    });

    const first = await fetchStatisticsLibraryAggregates();
    const second = await fetchStatisticsLibraryAggregates();

    expect(first).toEqual({
      artistCount: 9,
      albumsCounted: 20,
      songsCounted: 80,
      playtimeSec: 12_345,
      capped: false,
      genres: [{ value: 'Rock', songCount: 40, albumCount: 10 }],
      formats: [{ format: 'FLAC', count: 60 }],
      formatTrackCount: 80,
    });
    expect(second).toBe(first);
    expect(indexStatisticsMock).toHaveBeenCalledTimes(1);
    expect(indexStatisticsMock).toHaveBeenCalledWith([
      { serverId: 'stats-a', libraryIds: ['rock'] },
      { serverId: 'stats-b', libraryIds: [] },
    ]);
  });

  it('omits confirmed unavailable servers from index aggregates', async () => {
    setServerReachability('stats-b', 'unavailable');
    indexStatisticsMock.mockResolvedValue({
      artistCount: 1,
      albumCount: 2,
      songCount: 3,
      playtimeSec: 4,
      genres: [],
      formats: [],
    });

    await fetchStatisticsLibraryAggregates();

    expect(indexStatisticsMock).toHaveBeenCalledWith([
      { serverId: 'stats-a', libraryIds: ['rock'] },
    ]);
  });

  it('falls back to explicit-server APIs when the local index is not ready', async () => {
    useAuthStore.setState({
      activeServerId: 'fallback-a',
      servers: [
        { id: 'fallback-a', name: 'A', url: 'https://a.test', username: 'u', password: 'p' },
      ],
      libraryBrowseServerIds: ['fallback-a'],
      libraryBrowseSelectionByServer: { 'fallback-a': [] },
    });
    readyLibraryServerKeysMock.mockResolvedValue(null);
    getArtistsForServerMock.mockResolvedValue([{ id: 'artist-1', name: 'Artist' }]);
    getAlbumListForServerMock.mockResolvedValue([{
      id: 'album-1',
      name: 'Album',
      duration: 600,
      songCount: 5,
      genre: 'Rock',
    }]);
    getRandomSongsForServerMock.mockResolvedValue([
      { id: 'song-1', title: 'Song', suffix: 'flac' },
    ]);

    await expect(fetchStatisticsLibraryAggregates()).resolves.toEqual(expect.objectContaining({
      artistCount: 1,
      albumsCounted: 1,
      songsCounted: 5,
      playtimeSec: 600,
      formats: [{ format: 'FLAC', count: 1 }],
      formatTrackCount: 1,
    }));
    expect(indexStatisticsMock).not.toHaveBeenCalled();
    expect(getAlbumListForServerMock).toHaveBeenCalledWith(
      'fallback-a',
      'alphabeticalByName',
      500,
      0,
      {},
    );
  });

  it('falls back to the network when the ready index query fails', async () => {
    useAuthStore.setState({
      activeServerId: 'ipc-fallback',
      servers: [
        { id: 'ipc-fallback', name: 'Fallback', url: 'https://fallback.test', username: 'u', password: 'p' },
      ],
      libraryBrowseServerIds: ['ipc-fallback'],
      libraryBrowseSelectionByServer: { 'ipc-fallback': [] },
    });
    indexStatisticsMock.mockRejectedValueOnce(new Error('ipc unavailable'));
    getAlbumListForServerMock.mockResolvedValue([{
      id: 'album-1',
      name: 'Album',
      duration: 300,
      songCount: 3,
    }]);

    await expect(fetchStatisticsLibraryAggregates()).resolves.toEqual(expect.objectContaining({
      albumsCounted: 1,
      songsCounted: 3,
      playtimeSec: 300,
    }));
    expect(indexStatisticsMock).toHaveBeenCalledOnce();
    expect(getAlbumListForServerMock).toHaveBeenCalledOnce();
  });
});

describe('fetchStatisticsOverview', () => {
  beforeEach(() => {
    getAlbumListForServerMock.mockReset();
    useAuthStore.setState({
      activeServerId: 'stats-a',
      servers: [
        { id: 'stats-a', name: 'A', url: 'https://a.test', username: 'u', password: 'p' },
        { id: 'stats-b', name: 'B', url: 'https://b.test', username: 'u', password: 'p' },
      ],
      libraryBrowseServerIds: ['stats-a', 'stats-b'],
      libraryBrowseSelectionByServer: { 'stats-a': ['rock'], 'stats-b': [] },
    });
  });

  it('reads ranked strips from every selected index scope', async () => {
    getAlbumListForServerMock.mockImplementation(async (serverId: string, type: string) => [{
      serverId,
      id: `${type}-${serverId}`,
      name: `${type}-${serverId}`,
    }]);

    const overview = await fetchStatisticsOverview();

    expect(getAlbumListForServerMock).toHaveBeenCalledTimes(6);
    expect(getAlbumListForServerMock).toHaveBeenCalledWith('stats-a', 'recent', 20);
    expect(getAlbumListForServerMock).toHaveBeenCalledWith('stats-b', 'frequent', 12);
    expect(overview.recent.map(album => album.serverId)).toEqual(['stats-a', 'stats-b']);
    expect(overview.frequent.map(album => album.serverId)).toEqual(['stats-a', 'stats-b']);
  });
});

describe('fetchMostPlayedAlbums', () => {
  beforeEach(() => {
    indexMostPlayedMock.mockReset();
    useAuthStore.setState({
      activeServerId: 'stats-a',
      servers: [
        { id: 'stats-a', name: 'A', url: 'https://a.test', username: 'u', password: 'p' },
        { id: 'stats-b', name: 'B', url: 'https://b.test', username: 'u', password: 'p' },
      ],
      libraryBrowseServerIds: ['stats-a', 'stats-b'],
      libraryBrowseSelectionByServer: { 'stats-a': ['rock'], 'stats-b': [] },
    });
  });

  it('uses every selected server and library scope', async () => {
    indexMostPlayedMock.mockResolvedValue({ albums: [], artists: [], hasMore: false });

    await expect(fetchMostPlayedAlbums(50, 100)).resolves.toEqual({ albums: [], artists: [], hasMore: false });

    expect(indexMostPlayedMock).toHaveBeenCalledWith({
      scopes: [
        { serverId: 'stats-a', libraryIds: ['rock'] },
        { serverId: 'stats-b', libraryIds: [] },
      ],
      limit: 50,
      offset: 100,
    });
  });
});
