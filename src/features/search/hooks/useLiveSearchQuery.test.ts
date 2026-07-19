import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useAuthStore } from '@/store/authStore';
import { useLibraryIndexStore } from '@/store/libraryIndexStore';
import type { SyncStateDto } from '@/lib/api/library/dto';
import type { SearchResults } from '@/lib/api/subsonicTypes';
import { resetAuthStore } from '@/test/helpers/storeReset';

const { libraryGetStatusMock, runLocalLiveSearchMock, showToastMock, revisionState } = vi.hoisted(() => ({
  libraryGetStatusMock: vi.fn(),
  runLocalLiveSearchMock: vi.fn<(
    serverId: string,
    query: string,
    context: unknown,
  ) => Promise<SearchResults | null>>(),
  showToastMock: vi.fn(),
  revisionState: { value: 0 },
}));

vi.mock('@/lib/api/library', () => ({
  libraryGetStatus: (...args: unknown[]) => libraryGetStatusMock(...args),
  subscribeLibrarySyncIdle: vi.fn(async () => () => {}),
  subscribeLibrarySyncProgress: vi.fn(async () => () => {}),
}));

vi.mock('@/lib/library/liveSearchLocal', () => ({
  LIVE_SEARCH_DEBOUNCE_NETWORK_MS: 500,
  LIVE_SEARCH_DEBOUNCE_RACE_MS: 500,
  EMPTY_SEARCH_RESULTS: { artists: [], albums: [], songs: [] },
  liveSearchQueryRejected: () => false,
  mergeLiveSearchResults: (primary: unknown) => primary,
  runLocalLiveSearch: runLocalLiveSearchMock,
  runNetworkLiveSearch: vi.fn(async () => null),
}));

vi.mock('@/lib/library/searchRace', () => ({
  raceLiveSearch: vi.fn(async () => null),
}));

vi.mock('@/lib/library/liveSearchDebug', () => ({
  emitLiveSearchDebug: vi.fn(),
  searchHitCounts: () => 0,
  searchResultSamples: () => [],
}));

vi.mock('@/lib/library/libraryDevLog', () => ({
  logLibrarySearch: vi.fn(),
}));

vi.mock('@/lib/dom/toast', () => ({
  showToast: showToastMock,
}));

vi.mock('@/features/search/components/liveSearchScope', () => ({
  isLiveSearchDropdownBlocked: () => false,
}));

vi.mock('@/store/offlineLocalLibrarySyncRevision', () => ({
  useLibraryScopeSyncRevision: () => revisionState.value,
}));

import { useLiveSearchQuery } from './useLiveSearchQuery';

function buildingStatus(): SyncStateDto {
  return {
    serverId: 'srv-1',
    syncPhase: 'initial_sync',
    localTrackCount: 10,
    serverTrackCount: 1000,
  } as SyncStateDto;
}

function readyStatus(): SyncStateDto {
  return {
    serverId: 'srv-1',
    syncPhase: 'ready',
    localTrackCount: 1000,
    serverTrackCount: 1000,
  } as SyncStateDto;
}

function hookParams() {
  return {
    query: '',
    scope: null,
    shareMatch: null,
    liveSearchGenRef: { current: 0 },
    setResults: vi.fn(),
    setOpen: vi.fn(),
    setLoading: vi.fn(),
    setSearchSource: vi.fn(),
    setActiveIndex: vi.fn(),
  };
}

describe('useLiveSearchQuery indexIncomplete', () => {
  beforeEach(() => {
    libraryGetStatusMock.mockReset();
    runLocalLiveSearchMock.mockReset().mockResolvedValue(null);
    showToastMock.mockReset();
    revisionState.value = 0;
    resetAuthStore();
    useAuthStore.setState({
      activeServerId: 'srv-1',
      servers: [{ id: 'srv-1', name: 'S', url: 'https://s.test', username: 'u', password: 'p' }],
      musicLibraryFilterVersion: 0,
    });
    useLibraryIndexStore.setState({ masterEnabled: true });
  });

  it('is true while the active server index is still building', async () => {
    libraryGetStatusMock.mockResolvedValue(buildingStatus());

    const { result } = renderHook(() => useLiveSearchQuery(hookParams()));

    await waitFor(() => expect(result.current.indexIncomplete).toBe(true));
    expect(libraryGetStatusMock).toHaveBeenCalledWith('s.test');
  });

  it('is false when the active server index is ready', async () => {
    libraryGetStatusMock.mockResolvedValue(readyStatus());

    const { result } = renderHook(() => useLiveSearchQuery(hookParams()));

    await waitFor(() => expect(result.current.indexIncomplete).toBe(false));
  });

  it('preserves the current multi-server search while one selected scope is still syncing', async () => {
    vi.useFakeTimers();
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
    libraryGetStatusMock.mockImplementation(async (serverId: string) => (
      serverId === 'b.test' ? buildingStatus() : readyStatus()
    ));
    const params = { ...hookParams(), query: 'metallica' };

    const { unmount } = renderHook(() => useLiveSearchQuery(params));
    await vi.advanceTimersByTimeAsync(500);
    await Promise.resolve();

    expect(params.setResults).not.toHaveBeenCalled();
    expect(params.setSearchSource).not.toHaveBeenCalled();
    expect(params.setLoading).not.toHaveBeenCalledWith(true);
    expect(runLocalLiveSearchMock).not.toHaveBeenCalled();
    expect(showToastMock).not.toHaveBeenCalled();
    unmount();
    vi.useRealTimers();
  });

  it('preserves the current multi-server search when readiness changes before the local read', async () => {
    vi.useFakeTimers();
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
    libraryGetStatusMock.mockResolvedValue(readyStatus());
    runLocalLiveSearchMock.mockResolvedValue(null);
    const params = { ...hookParams(), query: 'metallica' };

    const { unmount } = renderHook(() => useLiveSearchQuery(params));
    await vi.advanceTimersByTimeAsync(500);
    await Promise.resolve();

    expect(runLocalLiveSearchMock).toHaveBeenCalledOnce();
    expect(params.setResults).not.toHaveBeenCalled();
    expect(params.setSearchSource).not.toHaveBeenCalled();
    expect(params.setLoading).not.toHaveBeenCalledWith(true);
    expect(showToastMock).not.toHaveBeenCalled();
    unmount();
    vi.useRealTimers();
  });

  it('reruns the newest pending live query after the selected indexes become ready', async () => {
    vi.useFakeTimers();
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
    let bReady = true;
    libraryGetStatusMock.mockImplementation(async (serverId: string) => (
      serverId === 'b.test' && !bReady ? buildingStatus() : readyStatus()
    ));
    runLocalLiveSearchMock.mockImplementation(async (_serverId: string, query: string) => ({
      artists: [], albums: [], songs: [{
        id: query,
        title: query,
        artist: 'Artist',
        album: 'Album',
        albumId: 'album',
        duration: 60,
      }],
    }));
    const params = hookParams();
    const view = renderHook(
      ({ query }) => useLiveSearchQuery({ ...params, query }),
      { initialProps: { query: 'old' } },
    );

    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(runLocalLiveSearchMock).toHaveBeenCalledWith('a', 'old', expect.anything());

    bReady = false;
    view.rerender({ query: 'new' });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(runLocalLiveSearchMock).not.toHaveBeenCalledWith('a', 'new', expect.anything());

    bReady = true;
    revisionState.value += 1;
    view.rerender({ query: 'new' });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(runLocalLiveSearchMock).toHaveBeenCalledWith('a', 'new', expect.anything());
    expect(params.setResults).toHaveBeenLastCalledWith(expect.objectContaining({
      songs: [expect.objectContaining({ id: 'new' })],
    }));
    view.unmount();
    vi.useRealTimers();
  });
});
