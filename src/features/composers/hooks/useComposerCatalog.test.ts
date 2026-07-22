import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  auth: {
    musicLibraryFilterVersion: 0,
    libraryBrowseScopeVersion: 0,
    activeServerId: 'srv-a',
  },
  scope: {
    anchorServerId: 'srv-a',
    serverIds: ['srv-a'],
    pairs: [{ serverId: 'srv-a', libraryId: 'lib-a' }],
    fingerprint: 'scope-a',
    multiServer: false,
  },
  indexEnabled: true,
}));

const loadLocalComposerCatalogMock = vi.fn();
const loadNetworkComposerCatalogMock = vi.fn();

vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (value: typeof state.auth) => unknown) => selector(state.auth),
}));
vi.mock('@/store/libraryIndexStore', () => ({
  useLibraryIndexStore: (selector: (value: { isIndexEnabled: () => boolean }) => unknown) => (
    selector({ isIndexEnabled: () => state.indexEnabled })
  ),
}));
vi.mock('@/store/offlineLocalLibrarySyncRevision', () => ({
  useLibraryScopeSyncRevision: () => 0,
}));
vi.mock('@/lib/library/libraryBrowseScope', () => ({
  getLibraryBrowseScope: () => state.scope,
}));
vi.mock('@/lib/library/composerBrowse', () => ({
  filterArtistsWithRoleAlbumCredits: (artists: Array<{ albumCount?: number }>) => (
    artists.filter(artist => (artist.albumCount ?? 0) > 0)
  ),
  loadLocalComposerCatalog: (...args: unknown[]) => loadLocalComposerCatalogMock(...args),
  loadNetworkComposerCatalog: (...args: unknown[]) => loadNetworkComposerCatalogMock(...args),
}));

import { useComposerCatalog } from './useComposerCatalog';

describe('useComposerCatalog', () => {
  beforeEach(() => {
    state.auth.musicLibraryFilterVersion = 0;
    state.auth.libraryBrowseScopeVersion = 0;
    state.auth.activeServerId = 'srv-a';
    state.scope = {
      anchorServerId: 'srv-a',
      serverIds: ['srv-a'],
      pairs: [{ serverId: 'srv-a', libraryId: 'lib-a' }],
      fingerprint: 'scope-a',
      multiServer: false,
    };
    state.indexEnabled = true;
    loadLocalComposerCatalogMock.mockReset();
    loadNetworkComposerCatalogMock.mockReset();
  });

  it('loads the whole selected scope through one local projection read', async () => {
    loadLocalComposerCatalogMock.mockResolvedValue([
      { id: 'co-1', name: 'Composer', serverId: 'srv-a', albumCount: 2 },
    ]);
    const { result } = renderHook(() => useComposerCatalog());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(loadLocalComposerCatalogMock).toHaveBeenCalledWith('srv-a', state.scope.pairs);
    expect(loadNetworkComposerCatalogMock).not.toHaveBeenCalled();
    expect(result.current.composers).toHaveLength(1);
  });

  it('keeps successful owner slices when another network fallback fails', async () => {
    state.indexEnabled = false;
    state.scope = {
      anchorServerId: 'srv-a',
      serverIds: ['srv-a', 'srv-b'],
      pairs: [
        { serverId: 'srv-a', libraryId: 'lib-a' },
        { serverId: 'srv-b', libraryId: 'lib-b' },
      ],
      fingerprint: 'scope-ab',
      multiServer: true,
    };
    loadNetworkComposerCatalogMock
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([{ id: 'co-b', name: 'B', serverId: 'srv-b', albumCount: 1 }]);
    const { result } = renderHook(() => useComposerCatalog());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.loadError).toBeNull();
    expect(result.current.composers).toEqual([
      { id: 'co-b', name: 'B', serverId: 'srv-b', albumCount: 1 },
    ]);
  });

  it('does not publish an old scope after the selection changes', async () => {
    let resolveFirst!: (value: Array<{ id: string; name: string; albumCount: number }>) => void;
    loadLocalComposerCatalogMock
      .mockReturnValueOnce(new Promise(resolve => { resolveFirst = resolve; }))
      .mockResolvedValueOnce([{ id: 'new', name: 'New', albumCount: 1 }]);
    const { result, rerender } = renderHook(() => useComposerCatalog());

    state.auth.libraryBrowseScopeVersion += 1;
    state.scope = {
      ...state.scope,
      pairs: [{ serverId: 'srv-a', libraryId: 'lib-b' }],
      fingerprint: 'scope-b',
    };
    rerender();
    await waitFor(() => expect(result.current.composers[0]?.id).toBe('new'));
    await act(async () => resolveFirst([{ id: 'old', name: 'Old', albumCount: 1 }]));
    expect(result.current.composers[0]?.id).toBe('new');
  });
});
