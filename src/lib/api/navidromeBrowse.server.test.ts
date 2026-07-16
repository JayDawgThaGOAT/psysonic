import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invokeMock, loginMock, getServerByIdMock, connectBaseUrlMock, authState } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  loginMock: vi.fn(),
  getServerByIdMock: vi.fn(),
  connectBaseUrlMock: vi.fn(),
  authState: { activeServerId: 'srv-a' as string | null },
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));
vi.mock('@/lib/api/navidromeAdmin', () => ({ ndLogin: loginMock }));
vi.mock('@/lib/api/subsonicClient', () => ({
  getServerById: getServerByIdMock,
  librarySelectionForServer: () => [],
}));
vi.mock('@/lib/server/serverEndpoint', () => ({ connectBaseUrlForServer: connectBaseUrlMock }));
vi.mock('@/store/authStore', () => ({
  useAuthStore: { getState: () => authState },
}));

import {
  ndClearTokenCache,
  ndListLosslessAlbumsPage,
  ndListLosslessAlbumsPageForServer,
} from '@/lib/api/navidromeBrowse';

const servers = {
  'srv-a': { id: 'srv-a', url: 'https://a.example', username: 'alice', password: 'a-pass' },
  'srv-b': { id: 'srv-b', url: 'https://b.example', username: 'bob', password: 'b-pass' },
};

describe('explicit-server lossless album browsing', () => {
  beforeEach(() => {
    ndClearTokenCache();
    authState.activeServerId = 'srv-a';
    invokeMock.mockReset();
    loginMock.mockReset();
    getServerByIdMock.mockReset();
    connectBaseUrlMock.mockReset();
    getServerByIdMock.mockImplementation((serverId: keyof typeof servers) => servers[serverId]);
    connectBaseUrlMock.mockImplementation((server: { id: string }) => `https://${server.id}.connect`);
    loginMock.mockImplementation(async (serverUrl: string) => ({ token: `token:${serverUrl}`, userId: 'u', isAdmin: false }));
    invokeMock.mockResolvedValue([]);
  });

  it('resolves explicit profiles, caches tokens per server, and stamps albums', async () => {
    invokeMock.mockImplementation(async (_command: string, args: { serverUrl: string }) => [{
      id: `song:${args.serverUrl}`,
      albumId: 'shared-album-id',
      album: `Album ${args.serverUrl}`,
      albumArtist: 'Artist',
      albumArtistId: 'artist-1',
      coverArtId: 'cover-1',
      bitDepth: 24,
      sampleRate: 96000,
      suffix: 'flac',
    }]);

    const request = { targetNewAlbums: 1, songsPerPage: 10, maxPagesPerCall: 1 };
    const firstA = await ndListLosslessAlbumsPageForServer('srv-a', request);
    const pageB = await ndListLosslessAlbumsPageForServer('srv-b', request);
    await ndListLosslessAlbumsPageForServer('srv-a', request);

    expect(firstA.entries[0]?.album.serverId).toBe('srv-a');
    expect(pageB.entries[0]?.album.serverId).toBe('srv-b');
    expect(loginMock).toHaveBeenCalledTimes(2);
    expect(loginMock).toHaveBeenCalledWith('https://srv-a.connect', 'alice', 'a-pass');
    expect(loginMock).toHaveBeenCalledWith('https://srv-b.connect', 'bob', 'b-pass');
    expect(invokeMock).toHaveBeenCalledWith('nd_list_songs', expect.objectContaining({
      serverUrl: 'https://srv-b.connect',
      token: 'token:https://srv-b.connect',
    }));
  });

  it('keeps the active-server wrapper and clear-cache semantics', async () => {
    const request = { targetNewAlbums: 1, maxPagesPerCall: 1 };

    await ndListLosslessAlbumsPage(request);
    await ndListLosslessAlbumsPage(request);
    expect(loginMock).toHaveBeenCalledTimes(1);

    ndClearTokenCache();
    await ndListLosslessAlbumsPage(request);
    expect(loginMock).toHaveBeenCalledTimes(2);
    expect(getServerByIdMock).toHaveBeenCalledWith('srv-a');
  });
});
