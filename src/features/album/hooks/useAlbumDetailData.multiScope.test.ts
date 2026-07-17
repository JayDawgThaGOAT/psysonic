import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/store/authStore';

const tryLoadAlbumDetailMultiScopeMock = vi.fn();
const resolveAlbumMock = vi.fn();

vi.mock('@/features/album/hooks/loadAlbumDetailMultiScope', () => ({
  tryLoadAlbumDetailMultiScope: (...args: unknown[]) => tryLoadAlbumDetailMultiScopeMock(...args),
}));

vi.mock('@/features/offline', () => ({
  resolveAlbum: (...args: unknown[]) => resolveAlbumMock(...args),
  resolveArtist: vi.fn().mockResolvedValue(null),
  loadAlbumFromLibraryIndex: vi.fn(),
  loadArtistFromLibraryIndex: vi.fn(),
  loadArtistFromLocalPlayback: vi.fn(),
  useOfflineBrowseContext: () => ({ active: false }),
}));

vi.mock('@/lib/library/libraryReady', () => ({
  libraryIsReady: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/network/subsonicNetworkGuard', () => ({
  shouldAttemptSubsonicForActiveServer: () => true,
  shouldAttemptSubsonicForServer: () => true,
}));

import { useAlbumDetailData } from './useAlbumDetailData';

function routerWrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(MemoryRouter, null, children);
}

describe('useAlbumDetailData — multi-library selection', () => {
  beforeEach(() => {
    tryLoadAlbumDetailMultiScopeMock.mockReset();
    resolveAlbumMock.mockReset();
    useAuthStore.setState({
      activeServerId: 'srv-1',
      servers: [
        { id: 'srv-1', name: 'S1', url: 'https://s1.test', username: 'u', password: 'p' },
        { id: 'srv-2', name: 'S2', url: 'https://s2.test', username: 'u', password: 'p' },
      ],
      favoritesOfflineEnabled: false,
      musicFoldersByServer: {
        'srv-1': [{ id: 'lib-a', name: 'A' }],
        'srv-2': [{ id: 'lib-b', name: 'B' }],
      },
      libraryBrowseServerIds: ['srv-1', 'srv-2'],
      libraryBrowseSelectionByServer: { 'srv-1': ['lib-a'], 'srv-2': ['lib-b'] },
      libraryBrowseScopeVersion: 0,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('loads via the authoritative cross-server browse scope', async () => {
    tryLoadAlbumDetailMultiScopeMock.mockResolvedValue({
      album: { id: 'alb-1', name: 'Merged', artistId: 'art-1', songs: [] },
      songs: [{ id: 'trk-1', title: 'One' }],
    });
    const { result } = renderHook(() => useAlbumDetailData('alb-1'), { wrapper: routerWrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(tryLoadAlbumDetailMultiScopeMock).toHaveBeenCalledWith([
      { serverId: 'srv-1', libraryId: 'lib-a' },
      { serverId: 'srv-2', libraryId: 'lib-b' },
    ], 'srv-1', 'alb-1');
    expect(resolveAlbumMock).not.toHaveBeenCalled();
    expect(result.current.album?.album).toMatchObject({ id: 'alb-1', name: 'Merged' });
    expect(result.current.album?.songs).toHaveLength(1);
  });

  it('loads via the authoritative scope when one folder is selected', async () => {
    useAuthStore.setState({
      libraryBrowseServerIds: ['srv-1'],
      libraryBrowseSelectionByServer: { 'srv-1': ['lib-a'] },
    });
    tryLoadAlbumDetailMultiScopeMock.mockResolvedValue({
      album: { id: 'alb-1', name: 'Scoped', artistId: 'art-1', songs: [] },
      songs: [{ id: 'trk-1', title: 'One' }],
    });
    const { result } = renderHook(() => useAlbumDetailData('alb-1'), { wrapper: routerWrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(tryLoadAlbumDetailMultiScopeMock).toHaveBeenCalledWith([
      { serverId: 'srv-1', libraryId: 'lib-a' },
    ], 'srv-1', 'alb-1');
    expect(resolveAlbumMock).not.toHaveBeenCalled();
    expect(result.current.album?.album).toMatchObject({ name: 'Scoped' });
  });

  it('uses the direct resolver when no concrete browse scope is configured', async () => {
    useAuthStore.setState({ musicFoldersByServer: {}, libraryBrowseServerIds: [] });
    resolveAlbumMock.mockResolvedValue({
      album: { id: 'alb-1', name: 'Single' },
      songs: [],
    });

    const { result } = renderHook(() => useAlbumDetailData('alb-1'), { wrapper: routerWrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(tryLoadAlbumDetailMultiScopeMock).not.toHaveBeenCalled();
    expect(resolveAlbumMock).toHaveBeenCalled();
    expect(result.current.album?.album).toMatchObject({ id: 'alb-1', name: 'Single' });
  });

  it('does not escape the authoritative scope when the scoped lookup misses', async () => {
    tryLoadAlbumDetailMultiScopeMock.mockResolvedValue(null);
    resolveAlbumMock.mockResolvedValue({
      album: { id: 'alb-1', name: 'Fallback' },
      songs: [],
    });

    const { result } = renderHook(() => useAlbumDetailData('alb-1'), { wrapper: routerWrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(tryLoadAlbumDetailMultiScopeMock).toHaveBeenCalled();
    expect(resolveAlbumMock).not.toHaveBeenCalled();
    expect(result.current.album).toBeNull();
  });
});
