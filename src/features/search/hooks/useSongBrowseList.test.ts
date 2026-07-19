// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SubsonicSong } from '@/lib/api/subsonicTypes';
import { useSongBrowseList } from '@/features/search/hooks/useSongBrowseList';
import { useAuthStore } from '@/store/authStore';
import { useLibraryIndexStore } from '@/store/libraryIndexStore';
import { runLocalSongScopeBrowse } from '@/lib/library/advancedSearchLocal';
import { resetAuthStore } from '@/test/helpers/storeReset';

const { browseScopeState, readyLibraryServerKeysMock, revisionState } = vi.hoisted(() => ({
  browseScopeState: {
    serverIds: ['srv-1'] as string[],
    multiServer: false,
    fingerprint: 'srv-1',
  },
  readyLibraryServerKeysMock: vi.fn(),
  revisionState: { value: 0 },
}));

vi.mock('@/lib/api/subsonicSearch', () => ({
  searchSongsPaged: vi.fn(async () => []),
}));

vi.mock('@/lib/api/navidromeBrowse', () => ({
  ndListSongs: vi.fn(async () => []),
}));

vi.mock('@/lib/library/advancedSearchLocal', () => ({
  runLocalSongBrowse: vi.fn(async () => []),
  runLocalSongScopeBrowse: vi.fn(async () => null),
}));

// Only the reload-token hook was stubbed pre-move (its own module); mock that
// submodule directly so the barrel re-exports the stub while the real
// `useOfflineBrowseContext` (a different submodule) stays live.
vi.mock('@/features/offline/hooks/useOfflineBrowseReloadToken', () => ({
  useOfflineBrowseReloadToken: () => undefined,
}));

vi.mock('@/features/offline/hooks/useOfflineBrowseContext', () => ({
  useOfflineBrowseContext: () => ({ active: false }),
}));

vi.mock('@/lib/library/browseTextSearch', () => ({
  BROWSE_TEXT_DEBOUNCE_NETWORK_MS: 10,
  BROWSE_TEXT_DEBOUNCE_RACE_MS: 10,
  browseRaceCountsSongs: vi.fn(),
  loadMoreLocalBrowseSongs: vi.fn(async () => []),
  raceBrowseWithLocalFallback: vi.fn(async () => null),
  runLocalBrowseSongPage: vi.fn(async () => []),
  runNetworkBrowseSongPage: vi.fn(async () => [{ id: 'fresh' } as SubsonicSong]),
}));

vi.mock('@/lib/library/libraryReady', () => ({
  readyLibraryServerKeys: readyLibraryServerKeysMock,
}));

vi.mock('@/lib/library/libraryBrowseScope', () => ({
  getLibraryBrowseScope: () => browseScopeState,
  setLibraryBrowseScopeSource: vi.fn(),
}));

vi.mock('@/store/offlineLocalLibrarySyncRevision', () => ({
  useLibraryScopeSyncRevision: () => revisionState.value,
  useOfflineLocalLibrarySyncRevision: () => 0,
}));

const stashedSong = { id: 'stashed', title: 'Stashed', artist: 'A', duration: 180 } as SubsonicSong;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => { resolve = res; });
  return { promise, resolve };
}

function seedMultiServerScope() {
  browseScopeState.serverIds = ['a', 'b'];
  browseScopeState.multiServer = true;
  browseScopeState.fingerprint = 'a,b';
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
}

describe('useSongBrowseList restore hold', () => {
  beforeEach(() => {
    resetAuthStore();
    useAuthStore.setState({ activeServerId: 'srv-1' });
    useLibraryIndexStore.setState({ masterEnabled: true });
    readyLibraryServerKeysMock.mockReset().mockResolvedValue(['srv-1']);
    revisionState.value = 0;
    browseScopeState.serverIds = ['srv-1'];
    browseScopeState.multiServer = false;
    browseScopeState.fingerprint = 'srv-1';
  });

  it('keeps stashed songs after fetchSongPage identity changes until query edits', async () => {
    const { result, rerender } = renderHook(
      ({ searchQuery }) => useSongBrowseList({
        enabled: true,
        searchQuery,
        initialRestore: {
          query: 'jazz',
          songs: [stashedSong],
          offset: 1,
          hasMore: false,
          browseCursor: null,
          localSearchMode: true,
          browseUnsupported: false,
          hasSearched: true,
        },
      }),
      { initialProps: { searchQuery: 'jazz' } },
    );

    expect(result.current.songs).toEqual([stashedSong]);

    rerender({ searchQuery: 'jazz' });
    await waitFor(() => {
      expect(result.current.songs).toEqual([stashedSong]);
    }, { timeout: 500 });

    rerender({ searchQuery: 'jazzx' });
    await waitFor(() => {
      expect(result.current.songs[0]?.id).toBe('fresh');
    }, { timeout: 500 });
  });
});

describe('useSongBrowseList scoped browse', () => {
  beforeEach(() => {
    resetAuthStore();
    useAuthStore.setState({ activeServerId: 'srv-1' });
    useLibraryIndexStore.setState({ masterEnabled: true });
    vi.mocked(runLocalSongScopeBrowse).mockReset();
    readyLibraryServerKeysMock.mockReset().mockResolvedValue(['srv-1']);
    revisionState.value = 0;
    browseScopeState.serverIds = ['srv-1'];
    browseScopeState.multiServer = false;
    browseScopeState.fingerprint = 'srv-1';
  });

  it('continues the ordinary Tracks catalogue with its opaque scoped cursor', async () => {
    vi.mocked(runLocalSongScopeBrowse)
      .mockResolvedValueOnce({
        songs: [{ id: 'one', title: 'One', artist: 'A', duration: 60 } as SubsonicSong],
        hasMore: true,
        nextCursor: 'cursor-1',
      })
      .mockResolvedValueOnce({
        songs: [{ id: 'two', title: 'Two', artist: 'A', duration: 60 } as SubsonicSong],
        hasMore: false,
        nextCursor: null,
      });
    const { result } = renderHook(() => useSongBrowseList({ enabled: true, searchQuery: '' }));

    await waitFor(() => expect(result.current.songs.map(song => song.id)).toEqual(['one']));
    void result.current.loadMore();
    await waitFor(() => expect(result.current.songs.map(song => song.id)).toEqual(['one', 'two']));
    expect(runLocalSongScopeBrowse).toHaveBeenNthCalledWith(1, 'srv-1', 50, null);
    expect(runLocalSongScopeBrowse).toHaveBeenNthCalledWith(2, 'srv-1', 50, 'cursor-1');
    expect(result.current.hasMore).toBe(false);
  });

  it('preserves multi-server results until every selected index is ready', async () => {
    seedMultiServerScope();
    readyLibraryServerKeysMock.mockResolvedValue(['a.test', 'b.test']);
    vi.mocked(runLocalSongScopeBrowse)
      .mockResolvedValueOnce({
        songs: [{ id: 'current', title: 'Current' } as SubsonicSong],
        hasMore: false,
        nextCursor: null,
      })
      .mockResolvedValueOnce({
        songs: [{ id: 'fresh', title: 'Fresh' } as SubsonicSong],
        hasMore: false,
        nextCursor: null,
      });
    const view = renderHook(() => useSongBrowseList({ enabled: true, searchQuery: '' }));
    await waitFor(() => expect(view.result.current.songs.map(song => song.id)).toEqual(['current']));

    readyLibraryServerKeysMock.mockResolvedValue(null);
    revisionState.value = 1;
    view.rerender();
    await waitFor(() => expect(readyLibraryServerKeysMock).toHaveBeenLastCalledWith(['a', 'b']));
    expect(view.result.current.songs.map(song => song.id)).toEqual(['current']);
    expect(runLocalSongScopeBrowse).toHaveBeenCalledTimes(1);

    readyLibraryServerKeysMock.mockResolvedValue(['a.test', 'b.test']);
    revisionState.value = 2;
    view.rerender();
    await waitFor(() => expect(view.result.current.songs.map(song => song.id)).toEqual(['fresh']));
    expect(runLocalSongScopeBrowse).toHaveBeenCalledTimes(2);
  });

  it('rekeys browse inflight work on sync revision and ignores the stale settlement', async () => {
    seedMultiServerScope();
    readyLibraryServerKeysMock.mockResolvedValue(['a.test', 'b.test']);
    const oldPage = deferred<{ songs: SubsonicSong[]; hasMore: boolean; nextCursor: string | null }>();
    const freshPage = deferred<{ songs: SubsonicSong[]; hasMore: boolean; nextCursor: string | null }>();
    vi.mocked(runLocalSongScopeBrowse)
      .mockReturnValueOnce(oldPage.promise)
      .mockReturnValueOnce(freshPage.promise);
    const view = renderHook(() => useSongBrowseList({ enabled: true, searchQuery: '' }));
    await waitFor(() => expect(runLocalSongScopeBrowse).toHaveBeenCalledTimes(1));

    revisionState.value = 1;
    view.rerender();
    await waitFor(() => expect(runLocalSongScopeBrowse).toHaveBeenCalledTimes(2));
    await act(async () => {
      freshPage.resolve({
        songs: [{ id: 'fresh', title: 'Fresh' } as SubsonicSong],
        hasMore: false,
        nextCursor: null,
      });
    });
    expect(view.result.current.songs.map(song => song.id)).toEqual(['fresh']);

    await act(async () => {
      oldPage.resolve({
        songs: [{ id: 'stale', title: 'Stale' } as SubsonicSong],
        hasMore: false,
        nextCursor: null,
      });
    });
    expect(view.result.current.songs.map(song => song.id)).toEqual(['fresh']);
  });
});
