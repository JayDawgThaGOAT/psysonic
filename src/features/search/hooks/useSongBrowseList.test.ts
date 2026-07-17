// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SubsonicSong } from '@/lib/api/subsonicTypes';
import { useSongBrowseList } from '@/features/search/hooks/useSongBrowseList';
import { useAuthStore } from '@/store/authStore';
import { useLibraryIndexStore } from '@/store/libraryIndexStore';
import { runLocalSongScopeBrowse } from '@/lib/library/advancedSearchLocal';

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

vi.mock('@/lib/library/browseTextSearch', () => ({
  BROWSE_TEXT_DEBOUNCE_NETWORK_MS: 10,
  BROWSE_TEXT_DEBOUNCE_RACE_MS: 10,
  browseRaceCountsSongs: vi.fn(),
  loadMoreLocalBrowseSongs: vi.fn(async () => []),
  raceBrowseWithLocalFallback: vi.fn(async () => null),
  runLocalBrowseSongPage: vi.fn(async () => []),
  runNetworkBrowseSongPage: vi.fn(async () => [{ id: 'fresh' } as SubsonicSong]),
}));

const stashedSong = { id: 'stashed', title: 'Stashed', artist: 'A', duration: 180 } as SubsonicSong;

describe('useSongBrowseList restore hold', () => {
  beforeEach(() => {
    useAuthStore.setState({ activeServerId: 'srv-1' });
    useLibraryIndexStore.setState({ masterEnabled: true });
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
    useAuthStore.setState({ activeServerId: 'srv-1' });
    useLibraryIndexStore.setState({ masterEnabled: true });
    vi.mocked(runLocalSongScopeBrowse).mockReset();
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
});
