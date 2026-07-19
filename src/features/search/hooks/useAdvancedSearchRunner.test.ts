import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetAuthStore } from '@/test/helpers/storeReset';
import { useAuthStore } from '@/store/authStore';

const { readyLibraryServerKeysMock, localSearchMock } = vi.hoisted(() => ({
  readyLibraryServerKeysMock: vi.fn(),
  localSearchMock: vi.fn(),
}));

vi.mock('@/lib/library/libraryReady', () => ({
  readyLibraryServerKeys: readyLibraryServerKeysMock,
}));

vi.mock('@/lib/library/advancedSearchLocal', () => ({
  loadMoreLocalSongs: vi.fn(),
  runNetworkAdvancedTextSearch: vi.fn(),
  runNetworkAdvancedYearAlbums: vi.fn(),
  tryRunLocalAdvancedSearch: localSearchMock,
}));

vi.mock('@/lib/library/browseTextSearch', () => ({
  browseRaceCountsFullSearch: vi.fn(),
  loadMoreLocalBrowseSongs: vi.fn(),
  raceBrowseWithLocalFallback: vi.fn(),
  runLocalBrowseFullSearch: localSearchMock,
  runNetworkBrowseFullSearch: vi.fn(),
}));

import { useAdvancedSearchRunner } from './useAdvancedSearchRunner';

function setters() {
  return {
    setLoading: vi.fn(),
    setHasSearched: vi.fn(),
    setGenreNote: vi.fn(),
    setBasicSearchMode: vi.fn(),
    setQuery: vi.fn(),
    setActiveSearch: vi.fn(),
    setSongsServerOffset: vi.fn(),
    setSongsHasMore: vi.fn(),
    setLocalMode: vi.fn(),
    setResults: vi.fn(),
    setLoadingMoreSongs: vi.fn(),
  };
}

beforeEach(() => {
  resetAuthStore();
  readyLibraryServerKeysMock.mockReset().mockResolvedValue(null);
  localSearchMock.mockReset();
  useAuthStore.setState({
    activeServerId: 'a',
    servers: [
      { id: 'a', name: 'A', url: 'https://a.test', username: 'u', password: 'p' },
      { id: 'b', name: 'B', url: 'https://b.test', username: 'u', password: 'p' },
    ],
    libraryBrowseServerIds: ['a', 'b'],
    musicFoldersByServer: {
      a: [{ id: 'lib-a', name: 'A' }],
      b: [{ id: 'lib-b', name: 'B' }],
    },
    libraryBrowseSelectionByServer: {},
  });
});

describe('useAdvancedSearchRunner multi-server readiness', () => {
  it('retains existing basic-search state during a partial sync refresh', async () => {
    const state = setters();
    const { result } = renderHook(() => useAdvancedSearchRunner({
      serverId: 'a',
      indexEnabled: true,
      loadingMoreSongs: false,
      songsHasMore: false,
      activeSearch: null,
      basicSearchMode: true,
      localMode: true,
      songsServerOffset: 1,
      ...state,
    }));

    await act(async () => { await result.current.runBasicSearch('metallica'); });

    expect(readyLibraryServerKeysMock).toHaveBeenCalledWith(['a', 'b']);
    expect(localSearchMock).not.toHaveBeenCalled();
    expect(state.setResults).not.toHaveBeenCalled();
    expect(state.setLoading).not.toHaveBeenCalled();
    expect(state.setLocalMode).not.toHaveBeenCalled();
    expect(state.setQuery).toHaveBeenCalledWith('metallica');
    expect(state.setActiveSearch).toHaveBeenCalledWith(expect.objectContaining({ query: 'metallica' }));
  });

  it('retains existing advanced-search state during a partial sync refresh', async () => {
    const state = setters();
    const { result } = renderHook(() => useAdvancedSearchRunner({
      serverId: 'a',
      indexEnabled: true,
      loadingMoreSongs: false,
      songsHasMore: false,
      activeSearch: null,
      basicSearchMode: false,
      localMode: true,
      songsServerOffset: 1,
      ...state,
    }));

    const pending = {
      query: 'metallica', genre: '', yearFrom: '', yearTo: '', bpmFrom: '', bpmTo: '',
      moodGroup: '', losslessOnly: false, resultType: 'all' as const,
    };
    await act(async () => { await result.current.runSearch(pending); });

    expect(localSearchMock).not.toHaveBeenCalled();
    expect(state.setResults).not.toHaveBeenCalled();
    expect(state.setLoading).not.toHaveBeenCalled();
    expect(state.setSongsHasMore).not.toHaveBeenCalled();
    expect(state.setActiveSearch).toHaveBeenCalledWith(pending);
  });

  it('retains filter-only advanced-search state during a partial sync refresh', async () => {
    const state = setters();
    const { result } = renderHook(() => useAdvancedSearchRunner({
      serverId: 'a',
      indexEnabled: true,
      loadingMoreSongs: false,
      songsHasMore: false,
      activeSearch: null,
      basicSearchMode: false,
      localMode: true,
      songsServerOffset: 1,
      ...state,
    }));

    await act(async () => {
      await result.current.runSearch({
        query: '', genre: 'metal', yearFrom: '', yearTo: '', bpmFrom: '', bpmTo: '',
        moodGroup: '', losslessOnly: false, resultType: 'all',
      });
    });

    expect(readyLibraryServerKeysMock).toHaveBeenCalledWith(['a', 'b']);
    expect(localSearchMock).not.toHaveBeenCalled();
    expect(state.setResults).not.toHaveBeenCalled();
    expect(state.setLoading).not.toHaveBeenCalled();
  });

  it('retains advanced-search state when local readiness changes before the read', async () => {
    readyLibraryServerKeysMock.mockResolvedValue(['a.test', 'b.test']);
    localSearchMock.mockResolvedValue(null);
    const state = setters();
    const { result } = renderHook(() => useAdvancedSearchRunner({
      serverId: 'a',
      indexEnabled: true,
      loadingMoreSongs: false,
      songsHasMore: false,
      activeSearch: null,
      basicSearchMode: false,
      localMode: true,
      songsServerOffset: 1,
      ...state,
    }));

    await act(async () => {
      await result.current.runSearch({
        query: 'metallica', genre: '', yearFrom: '', yearTo: '', bpmFrom: '', bpmTo: '',
        moodGroup: '', losslessOnly: false, resultType: 'all',
      });
    });

    expect(localSearchMock).toHaveBeenCalledOnce();
    expect(state.setResults).not.toHaveBeenCalled();
    expect(state.setLoading).not.toHaveBeenCalled();
    expect(state.setLocalMode).not.toHaveBeenCalled();
  });

  it('retains basic-search state when local readiness changes before the read', async () => {
    readyLibraryServerKeysMock.mockResolvedValue(['a.test', 'b.test']);
    localSearchMock.mockResolvedValue(null);
    const state = setters();
    const { result } = renderHook(() => useAdvancedSearchRunner({
      serverId: 'a',
      indexEnabled: true,
      loadingMoreSongs: false,
      songsHasMore: false,
      activeSearch: null,
      basicSearchMode: true,
      localMode: true,
      songsServerOffset: 1,
      ...state,
    }));

    await act(async () => { await result.current.runBasicSearch('metallica'); });

    expect(localSearchMock).toHaveBeenCalledOnce();
    expect(state.setResults).not.toHaveBeenCalled();
    expect(state.setLoading).not.toHaveBeenCalled();
    expect(state.setLocalMode).not.toHaveBeenCalled();
  });
});
