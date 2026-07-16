import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@/lib/api/subsonicArtists', () => ({ getArtistForServer: vi.fn() }));
vi.mock('@/lib/api/subsonicLibrary', () => ({ getAlbumForServer: vi.fn() }));
vi.mock('@/lib/network/subsonicNetworkGuard', () => ({ shouldAttemptSubsonicForServer: vi.fn(() => true) }));
vi.mock('@/lib/api/library/internal', () => ({
  serverIndexKeyForId: (serverId: string) => `index:${serverId}`,
  mapServerIdFromIndexKey: (serverId: string) => serverId.replace('index:', ''),
}));
vi.mock('@/store/authStore', () => ({ useAuthStore: { getState: () => ({ activeServerId: 'server-a' }) } }));

import { getArtistForServer } from '@/lib/api/subsonicArtists';
import { entityUserRatingKey, resolveEntityUserRatings } from '@/lib/api/subsonicRatings';

beforeEach(() => {
  mocks.invoke.mockReset();
  vi.mocked(getArtistForServer).mockReset();
});

describe('resolveEntityUserRatings', () => {
  it('keeps identical ids isolated by server and entity kind', async () => {
    mocks.invoke.mockResolvedValue([
      { serverId: 'index:server-a', entityKind: 'artist', entityId: 'shared', rating: 1, fetchedAt: 1 },
      { serverId: 'index:server-b', entityKind: 'artist', entityId: 'shared', rating: 5, fetchedAt: 1 },
      { serverId: 'index:server-a', entityKind: 'album', entityId: 'shared', rating: 3, fetchedAt: 1 },
    ]);

    const ratings = await resolveEntityUserRatings([
      { serverId: 'server-a', entityKind: 'artist', entityId: 'shared' },
      { serverId: 'server-b', entityKind: 'artist', entityId: 'shared' },
      { serverId: 'server-a', entityKind: 'album', entityId: 'shared' },
    ]);

    expect(ratings.get(entityUserRatingKey({ serverId: 'server-a', entityKind: 'artist', entityId: 'shared' }))).toBe(1);
    expect(ratings.get(entityUserRatingKey({ serverId: 'server-b', entityKind: 'artist', entityId: 'shared' }))).toBe(5);
    expect(ratings.get(entityUserRatingKey({ serverId: 'server-a', entityKind: 'album', entityId: 'shared' }))).toBe(3);
    expect(getArtistForServer).not.toHaveBeenCalled();
  });

  it('returns after the local read while missing ratings hydrate in the background', async () => {
    let releaseNetwork!: () => void;
    const network = new Promise<{ artist: { id: string; name: string; userRating: number }; albums: [] }>(resolve => {
      releaseNetwork = () => resolve({ artist: { id: 'artist-1', name: 'Artist', userRating: 1 }, albums: [] });
    });
    mocks.invoke.mockResolvedValue([]);
    vi.mocked(getArtistForServer).mockReturnValue(network);

    const ratings = await resolveEntityUserRatings([
      { serverId: 'server-a', entityKind: 'artist', entityId: 'artist-1' },
    ]);

    expect(ratings.size).toBe(0);
    expect(getArtistForServer).toHaveBeenCalledWith('server-a', 'artist-1');
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    releaseNetwork();
  });
});
