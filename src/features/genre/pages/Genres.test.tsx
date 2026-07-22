import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';

const hoisted = vi.hoisted(() => ({
  fetchGenreCatalog: vi.fn(),
  fetchScopedGenreCatalog: vi.fn(),
  peekScopedGenreCatalog: vi.fn(() => null),
}));

vi.mock('@/features/playback/utils/playback/genreBrowsePlayback', () => ({
  fetchGenreCatalog: hoisted.fetchGenreCatalog,
  fetchScopedGenreCatalog: hoisted.fetchScopedGenreCatalog,
  peekScopedGenreCatalog: hoisted.peekScopedGenreCatalog,
  filterGenresWithContent: (genres: unknown[]) => genres,
}));

vi.mock('@/lib/library/genreCatalogCountsCache', () => ({
  peekGenreCatalogCache: vi.fn(() => null),
}));

vi.mock('@/features/offline', () => ({
  useOfflineBrowseContext: () => ({ active: false }),
  offlineLocalBrowseEnabled: vi.fn(() => false),
}));

vi.mock('@/store/localPlaybackBrowseRevision', () => ({
  useOfflineLocalBrowseReloadKey: vi.fn(() => 0),
}));

vi.mock('@/store/offlineLocalLibrarySyncRevision', () => ({
  useLibrarySyncRevision: vi.fn(() => 0),
}));

import Genres from '@/features/genre/pages/Genres';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAllStores } from '@/test/helpers/storeReset';
import { useAuthStore } from '@/store/authStore';

describe('Genres', () => {
  beforeEach(() => {
    resetAllStores();
    hoisted.fetchGenreCatalog.mockReset();
    hoisted.fetchScopedGenreCatalog.mockReset().mockResolvedValue([
      { value: 'Rock', albumCount: 4, songCount: 9 },
    ]);
    hoisted.peekScopedGenreCatalog.mockReturnValue(null);
  });

  it('loads the derived selected owner while active-server switching catches up', async () => {
    useAuthStore.setState({
      servers: [
        { id: 'srv-a', name: 'A', url: 'https://a.test', username: 'u', password: 'p' },
        { id: 'srv-b', name: 'B', url: 'https://b.test', username: 'u', password: 'p' },
      ],
      activeServerId: 'srv-a',
      libraryBrowseServerIds: ['srv-b'],
      libraryBrowseSelectionByServer: { 'srv-b': ['lib-b'] },
    });

    const view = renderWithProviders(<Genres />);

    expect(await view.findByText('Rock')).toBeInTheDocument();
    expect(hoisted.fetchScopedGenreCatalog).toHaveBeenCalledWith([
      { serverId: 'srv-b', libraryIds: ['lib-b'] },
    ]);
    expect(hoisted.fetchGenreCatalog).not.toHaveBeenCalled();
  });

  it('does not reveal the previous scope when the replacement index read fails', async () => {
    useAuthStore.setState({
      servers: [
        { id: 'srv-a', name: 'A', url: 'https://a.test', username: 'u', password: 'p' },
        { id: 'srv-b', name: 'B', url: 'https://b.test', username: 'u', password: 'p' },
      ],
      activeServerId: 'srv-a',
      libraryBrowseServerIds: ['srv-b'],
      libraryBrowseSelectionByServer: { 'srv-b': ['lib-b'] },
    });

    const view = renderWithProviders(<Genres />);
    expect(await view.findByText('Rock')).toBeInTheDocument();

    hoisted.fetchScopedGenreCatalog.mockRejectedValueOnce(new Error('index unavailable'));
    act(() => {
      const version = useAuthStore.getState().libraryBrowseScopeVersion;
      useAuthStore.setState({
        libraryBrowseServerIds: ['srv-a'],
        libraryBrowseSelectionByServer: { 'srv-a': ['lib-a'] },
        libraryBrowseScopeVersion: version + 1,
      });
    });

    expect(await view.findByText('No genres found.')).toBeInTheDocument();
    expect(view.queryByText('Rock')).not.toBeInTheDocument();
  });
});
