import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.hoisted(() => vi.fn());
const ndLoginMock = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));
vi.mock('@/generated/bindings', () => ({
  commands: { ndDeletePlaylist: vi.fn() },
}));
vi.mock('@/lib/api/navidromeAdmin', () => ({ ndLogin: ndLoginMock }));
vi.mock('@/lib/server/serverEndpoint', () => ({ getCachedConnectBaseUrl: () => null }));
vi.mock('@/lib/server/serverBaseUrl', () => ({ serverProfileBaseUrl: ({ url }: { url: string }) => url }));
vi.mock('@/store/authStore', () => ({
  useAuthStore: {
    getState: () => ({
      activeServerId: 'a',
      servers: [
        { id: 'a', url: 'https://a.test', username: 'user-a', password: 'pass-a' },
        { id: 'b', url: 'https://b.test', username: 'user-b', password: 'pass-b' },
      ],
      getActiveServer: () => ({
        id: 'a', url: 'https://a.test', username: 'user-a', password: 'pass-a',
      }),
    }),
  },
}));

import { ndCreateSmartPlaylist, ndUpdateSmartPlaylist } from '@/lib/api/navidromeSmart';

describe('Navidrome smart playlist owner routing', () => {
  beforeEach(() => {
    invokeMock.mockReset().mockResolvedValue({ id: 'smart', name: 'Smart', songCount: 0 });
    ndLoginMock.mockReset().mockResolvedValue({ token: 'token-b' });
  });

  it('uses the requested server instead of the mutable active server', async () => {
    await ndCreateSmartPlaylist('Smart', { all: [] }, true, 'b');
    await ndUpdateSmartPlaylist('smart', 'Smart', { all: [] }, true, 'b');

    expect(ndLoginMock).toHaveBeenCalledWith('https://b.test', 'user-b', 'pass-b');
    expect(invokeMock).toHaveBeenNthCalledWith(1, 'nd_create_playlist', expect.objectContaining({
      serverUrl: 'https://b.test', token: 'token-b',
    }));
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'nd_update_playlist', expect.objectContaining({
      serverUrl: 'https://b.test', token: 'token-b', id: 'smart',
    }));
  });
});
