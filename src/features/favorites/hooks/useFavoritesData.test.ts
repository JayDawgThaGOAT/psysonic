import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InternetRadioStation } from '@/lib/api/subsonicTypes';

const hoisted = vi.hoisted(() => ({
  getRadio: vi.fn(),
  getStarred: vi.fn(),
}));

vi.mock('@/lib/api/subsonicRadio', () => ({
  getInternetRadioStationsForServersSettled: hoisted.getRadio,
}));
vi.mock('@/lib/api/subsonicStarRating', () => ({ getStarred: hoisted.getStarred }));
vi.mock('@/features/playback/store/playerStore', () => ({
  usePlayerStore: Object.assign(
    (selector: (state: { starredOverrides: Record<string, boolean> }) => unknown) => (
      selector({ starredOverrides: {} })
    ),
    {
      getState: () => ({ starredOverrides: {} }),
      setState: vi.fn(),
    },
  ),
}));
vi.mock('@/lib/hooks/useConnectionStatus', () => ({
  useConnectionStatus: () => ({ status: 'connected' }),
}));
vi.mock('@/lib/network/activeServerReachability', () => ({
  isActiveServerReachable: () => true,
}));
vi.mock('@/features/offline', () => ({
  useOfflineBrowseContext: () => ({ active: false }),
  useOfflineBrowseReloadToken: () => 0,
  loadStarredFromAllLibraryIndexes: vi.fn(async () => ({ albums: [], artists: [], songs: [] })),
  loadStarredFromAllServersOnline: vi.fn(async () => ({ albums: [], artists: [], songs: [] })),
}));
vi.mock('@/lib/library/favoritesBrowseDebug', () => ({
  beginFavoritesBrowseTrace: vi.fn(),
  emitFavoritesBrowseDebug: vi.fn(),
  favoritesBrowseTimed: (_name: string, run: () => Promise<unknown>) => run(),
}));

import { useFavoritesData } from './useFavoritesData';
import { resetAuthStore } from '@/test/helpers/storeReset';
import { useAuthStore } from '@/store/authStore';

const STATION: InternetRadioStation = {
  id: 'shared',
  serverId: 'srv-a',
  name: 'Alpha Radio',
  streamUrl: 'https://a.test/live',
};

describe('useFavoritesData radio ownership', () => {
  beforeEach(() => {
    resetAuthStore();
    localStorage.clear();
    hoisted.getRadio.mockReset();
    hoisted.getStarred.mockReset().mockResolvedValue({ albums: [], artists: [], songs: [] });
    useAuthStore.setState({
      isLoggedIn: true,
      servers: [{
        id: 'srv-a',
        name: 'Home',
        url: 'https://a.test',
        username: 'a',
        password: 'p',
      }],
      activeServerId: 'srv-a',
      libraryBrowseServerIds: ['srv-a'],
      favoritesOfflineEnabled: false,
    });
  });

  it('does not restore an unfavorited station from an older refresh', async () => {
    localStorage.setItem('psysonic_radio_favorites', JSON.stringify([
      'shared',
      'srv-a:shared',
    ]));
    let resolveRadio: ((value: {
      stations: InternetRadioStation[];
      failedServerIds: string[];
    }) => void) | undefined;
    hoisted.getRadio.mockImplementation(() => new Promise(resolve => {
      resolveRadio = resolve;
    }));
    const { result } = renderHook(() => useFavoritesData());
    await waitFor(() => expect(hoisted.getRadio).toHaveBeenCalled());

    act(() => result.current.unfavoriteStation(STATION));
    act(() => resolveRadio?.({ stations: [STATION], failedServerIds: [] }));

    await waitFor(() => expect(result.current.radioStations).toEqual([]));
    expect(JSON.parse(localStorage.getItem('psysonic_radio_favorites') ?? '[]')).toEqual([]);
  });
});
