import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiForServerMock, guardMock } = vi.hoisted(() => ({
  apiForServerMock: vi.fn(),
  guardMock: vi.fn(() => true),
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: {
    getState: () => ({
      activeServerId: 'active',
      musicLibraryFilterByServer: {},
      musicLibraryFilterVersion: 1,
    }),
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
  getMusicDirectoryForServer,
  getMusicIndexesForServer,
  getRandomSongsForServer,
  getSongForServer,
} from '@/lib/api/subsonicLibrary';

const album = { id: 'album-1', name: 'Album', artist: 'Artist', artistId: 'artist-1', songCount: 1, duration: 30 };
const song = { id: 'song-1', title: 'Song', artist: 'Artist', album: 'Album', albumId: 'album-1', duration: 30 };

describe('explicit-server library wrappers', () => {
  beforeEach(() => {
    apiForServerMock.mockReset();
    guardMock.mockReset();
    guardMock.mockReturnValue(true);
  });

  it('forwards album-list timeout and stamps albums', async () => {
    apiForServerMock.mockResolvedValue({ albumList2: { album: [album] } });

    await expect(getAlbumListForServer('srv-a', 'newest', 12, 4, { fromYear: 2020 }, 4321)).resolves.toEqual([
      { ...album, serverId: 'srv-a' },
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
      { ...song, serverId: 'srv-random' },
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

  it('loads directory trees against the requested server', async () => {
    apiForServerMock
      .mockResolvedValueOnce({ indexes: { index: [{ name: 'A', artist: [{ id: 'artist-1', name: 'Artist' }] }] } })
      .mockResolvedValueOnce({ directory: { id: 'artist-1', name: 'Artist', child: { id: 'song-1', title: 'Song', isDir: false } } });

    await expect(getMusicIndexesForServer('srv-folder', 'folder-1')).resolves.toEqual([
      { id: 'artist-1', title: 'Artist', isDir: true },
    ]);
    await expect(getMusicDirectoryForServer('srv-folder', 'artist-1')).resolves.toMatchObject({
      id: 'artist-1',
      child: [{ id: 'song-1', title: 'Song', isDir: false }],
    });
    expect(apiForServerMock).toHaveBeenNthCalledWith(1, 'srv-folder', 'getIndexes.view', { musicFolderId: 'folder-1' });
    expect(apiForServerMock).toHaveBeenNthCalledWith(2, 'srv-folder', 'getMusicDirectory.view', { id: 'artist-1' });
  });
});
