import { beforeEach, describe, expect, it, vi } from 'vitest';

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
      artists: [{ id: 'artist-1', name: 'Artist', serverId: 'srv-b' }],
      albums: [{ id: 'album-1', name: 'Album', serverId: 'srv-b' }],
      songs: [{ id: 'song-1', title: 'Song', serverId: 'srv-b' }],
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
