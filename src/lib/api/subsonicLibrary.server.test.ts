import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiForServerMock, authState, guardMock } = vi.hoisted(() => ({
  apiForServerMock: vi.fn(),
  authState: {
    activeServerId: 'active',
    musicLibraryFilterByServer: {} as Record<string, string>,
    musicLibraryFilterVersion: 1,
    servers: [] as Array<{ id: string; url: string }>,
  },
  guardMock: vi.fn(() => true),
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: {
    getState: () => authState,
  },
}));

vi.mock('@/lib/api/subsonicClient', () => ({
  api: vi.fn(),
  apiForServer: apiForServerMock,
  libraryFilterParams: () => ({}),
  libraryFilterParamsForServer: () => ({ musicFolderId: 'folder-1' }),
  librarySelectionForServer: () => ['folder-1'],
}));

vi.mock('@/lib/network/subsonicNetworkGuard', () => ({
  shouldAttemptSubsonicForActiveServer: vi.fn(() => true),
  shouldAttemptSubsonicForServer: guardMock,
}));

vi.mock('@/lib/library/luckyMixScopeOverride', () => ({
  getLuckyMixLibraryScopeOverride: () => null,
}));

vi.mock('@/lib/library/patchOnUse', () => ({
  mirrorAlbumMetadataFromServerOnUse: vi.fn(),
}));

import {
  getAlbumForServer,
  getAlbumListForServer,
  getRandomSongsForServer,
  getSongForServer,
  similarSongsRequestCount,
} from '@/lib/api/subsonicLibrary';

const album = { id: 'album-1', name: 'Album', artist: 'Artist', artistId: 'artist-1', songCount: 1, duration: 30 };
const song = { id: 'song-1', title: 'Song', artist: 'Artist', album: 'Album', albumId: 'album-1', duration: 30 };

describe('explicit-server library wrappers', () => {
  beforeEach(() => {
    apiForServerMock.mockReset();
    guardMock.mockReset();
    guardMock.mockReturnValue(true);
    authState.activeServerId = 'active';
    authState.musicLibraryFilterByServer = {};
    authState.servers = [
      { id: 'srv-a', url: 'https://a.example/rest' },
      { id: 'srv-random', url: 'https://random.example' },
    ];
  });

  it('forwards album-list timeout and stamps albums', async () => {
    apiForServerMock.mockResolvedValue({ albumList2: { album: [album] } });

    await expect(getAlbumListForServer('srv-a', 'newest', 12, 4, { fromYear: 2020 }, 4321)).resolves.toEqual([
      { ...album, serverId: 'a.example/rest' },
    ]);
    expect(apiForServerMock).toHaveBeenCalledWith(
      'srv-a',
      'getAlbumList2.view',
      expect.objectContaining({ type: 'newest', size: 12, offset: 4, fromYear: 2020, musicFolderId: 'folder-1' }),
      4321,
    );
  });

  it('guards, scopes, filters, times out, and stamps random songs', async () => {
    apiForServerMock.mockImplementation(async (_serverId: string, endpoint: string) => {
      if (endpoint === 'getRandomSongs.view') {
        return { randomSongs: { song: [song, { ...song, id: 'song-2', albumId: 'album-2' }] } };
      }
      return { albumList2: { album: [album] } };
    });

    await expect(getRandomSongsForServer('srv-random', 8, 'Rock', 2468)).resolves.toEqual([
      { ...song, serverId: 'random.example' },
    ]);
    expect(guardMock).toHaveBeenCalledWith('srv-random');
    expect(apiForServerMock).toHaveBeenNthCalledWith(
      1,
      'srv-random',
      'getRandomSongs.view',
      expect.objectContaining({ size: 8, genre: 'Rock', musicFolderId: 'folder-1' }),
      2468,
    );
  });

  it('skips random-song network calls when the server guard fails', async () => {
    guardMock.mockReturnValue(false);

    await expect(getRandomSongsForServer('srv-offline', 5)).resolves.toEqual([]);
    expect(apiForServerMock).not.toHaveBeenCalled();
  });

  it('sizes similar-song requests from the explicit owner library scope', () => {
    authState.musicLibraryFilterByServer = { active: 'all', 'srv-owner': 'folder-2' };

    expect(similarSongsRequestCount(12, 'srv-owner')).toBe(48);
    expect(similarSongsRequestCount(12, 'active')).toBe(12);
  });

  it('stamps explicit album details and song lookups', async () => {
    apiForServerMock
      .mockResolvedValueOnce({ album: { ...album, song: [song] } })
      .mockResolvedValueOnce({ song });

    await expect(getAlbumForServer('srv-detail', 'album-1')).resolves.toEqual({
      album: { ...album, serverId: 'srv-detail' },
      songs: [{ ...song, serverId: 'srv-detail' }],
    });
    await expect(getSongForServer('srv-detail', 'song-1')).resolves.toEqual({ ...song, serverId: 'srv-detail' });
  });

});
