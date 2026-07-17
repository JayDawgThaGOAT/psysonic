import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/store/authStore';
import {
  fetchMostPlayedAlbums,
  fetchStatisticsLibraryAggregates,
  fetchStatisticsOverview,
  statisticsPageCacheKey,
} from '@/lib/api/subsonicStatistics';
import { getArtistsAcrossLibraries } from '@/lib/api/subsonicArtists';

const apiMock = vi.fn();
const indexStatisticsMock = vi.fn();
const indexMostPlayedMock = vi.fn();
const getAlbumListForServerMock = vi.fn();

vi.mock('@/lib/api/subsonicLibrary', () => ({
  getAlbumListForServer: (...args: unknown[]) => getAlbumListForServerMock(...args),
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
    useAuthStore.setState({
      activeServerId: 'stats-a',
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
    });
    expect(second).toBe(first);
    expect(indexStatisticsMock).toHaveBeenCalledTimes(1);
    expect(indexStatisticsMock).toHaveBeenCalledWith([
      { serverId: 'stats-a', libraryIds: ['rock'] },
      { serverId: 'stats-b', libraryIds: [] },
    ]);
  });
});

describe('fetchStatisticsOverview', () => {
  beforeEach(() => {
    getAlbumListForServerMock.mockReset();
    useAuthStore.setState({
      activeServerId: 'stats-a',
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
