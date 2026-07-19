import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetAuthStore } from '@/test/helpers/storeReset';
import { useAuthStore } from '@/store/authStore';

const apiForServerMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/subsonicClient', () => ({
  api: vi.fn(),
  apiForServer: apiForServerMock,
  libraryFilterParams: () => ({}),
  libraryFilterParamsForServer: () => ({ musicFolderId: ['folder-b'] }),
}));

import { searchForServer } from '@/lib/api/subsonicSearch';

describe('searchForServer', () => {
  beforeEach(() => {
    apiForServerMock.mockReset();
    resetAuthStore();
    useAuthStore.setState({
      servers: [{
        id: 'srv-b',
        name: 'B',
        url: 'https://b.test/rest',
        username: 'u',
        password: 'p',
      }],
    });
  });

  it('queries and stamps every result with the explicit owner server', async () => {
    apiForServerMock.mockResolvedValue({
      searchResult3: {
        artist: [{ id: 'artist-1', name: 'Artist' }],
        album: [{ id: 'album-1', name: 'Album' }],
        song: [{ id: 'song-1', title: 'Song' }],
      },
    });

    await expect(searchForServer('srv-b', 'Artist', {
      artistCount: 3,
      albumCount: 0,
      songCount: 500,
      timeout: 4321,
    })).resolves.toEqual({
      artists: [{ id: 'artist-1', name: 'Artist', serverId: 'b.test/rest' }],
      albums: [{ id: 'album-1', name: 'Album', serverId: 'b.test/rest' }],
      songs: [{ id: 'song-1', title: 'Song', serverId: 'b.test/rest' }],
    });
    expect(apiForServerMock).toHaveBeenCalledWith('srv-b', 'search3.view', {
      query: 'Artist',
      artistCount: 3,
      albumCount: 0,
      songCount: 500,
      musicFolderId: ['folder-b'],
    }, 4321);
  });
});
