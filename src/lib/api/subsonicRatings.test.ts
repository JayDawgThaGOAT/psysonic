import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/subsonicArtists', () => ({ getArtist: vi.fn(), getArtistForServer: vi.fn() }));
vi.mock('@/lib/api/subsonicLibrary', () => ({ getAlbum: vi.fn(), getAlbumForServer: vi.fn() }));
vi.mock('@/lib/network/subsonicNetworkGuard', () => ({
  shouldAttemptSubsonicForActiveServer: vi.fn(() => true),
  shouldAttemptSubsonicForServer: vi.fn(() => true),
}));
import { getArtist, getArtistForServer } from '@/lib/api/subsonicArtists';
import { getAlbumForServer } from '@/lib/api/subsonicLibrary';
import {
  invalidateEntityUserRatingCaches,
  prefetchAlbumUserRatingsForServer,
  prefetchArtistUserRatings,
  prefetchArtistUserRatingsForServer,
} from '@/lib/api/subsonicRatings';

beforeEach(() => {
  vi.mocked(getArtist).mockReset();
  vi.mocked(getArtistForServer).mockReset();
  vi.mocked(getAlbumForServer).mockReset();
  invalidateEntityUserRatingCaches('art-1');
  invalidateEntityUserRatingCaches('shared-id');
});

describe('explicit-server rating prefetch', () => {
  it('isolates same artist ids by server', async () => {
    vi.mocked(getArtistForServer).mockImplementation(async serverId => ({
      artist: { id: 'shared-id', name: 'Artist', userRating: serverId === 'server-a' ? 1 : 5 },
      albums: [],
    }));

    const fromA = await prefetchArtistUserRatingsForServer('server-a', ['shared-id']);
    const fromB = await prefetchArtistUserRatingsForServer('server-b', ['shared-id']);
    const cachedA = await prefetchArtistUserRatingsForServer('server-a', ['shared-id']);

    expect(fromA.get('shared-id')).toBe(1);
    expect(fromB.get('shared-id')).toBe(5);
    expect(cachedA.get('shared-id')).toBe(1);
    expect(getArtistForServer).toHaveBeenCalledTimes(2);
  });

  it('uses the explicit server for album fetches', async () => {
    vi.mocked(getAlbumForServer).mockResolvedValue({
      album: {
        id: 'shared-id',
        name: 'Album',
        artist: 'Artist',
        artistId: 'artist-id',
        songCount: 1,
        duration: 180,
        userRating: 3,
      },
      songs: [],
    });

    const ratings = await prefetchAlbumUserRatingsForServer('server-b', ['shared-id']);

    expect(ratings.get('shared-id')).toBe(3);
    expect(getAlbumForServer).toHaveBeenCalledWith('server-b', 'shared-id');
  });
});

describe('prefetchArtistUserRatings', () => {
  it('does not negative-cache unrated artists', async () => {
    vi.mocked(getArtist).mockResolvedValue({ artist: { id: 'art-1', name: 'Artist' }, albums: [] });

    const first = await prefetchArtistUserRatings(['art-1']);
    expect(first.size).toBe(0);
    expect(getArtist).toHaveBeenCalledTimes(1);

    vi.mocked(getArtist).mockResolvedValue({
      artist: { id: 'art-1', name: 'Artist', userRating: 1 },
      albums: [],
    });
    const second = await prefetchArtistUserRatings(['art-1']);
    expect(second.get('art-1')).toBe(1);
    expect(getArtist).toHaveBeenCalledTimes(2);
  });

  it('does not reuse ratings across active-server calls', async () => {
    vi.mocked(getArtist).mockResolvedValue({
      artist: { id: 'art-1', name: 'Artist', userRating: 2 },
      albums: [],
    });

    const first = await prefetchArtistUserRatings(['art-1']);
    expect(first.get('art-1')).toBe(2);
    expect(getArtist).toHaveBeenCalledTimes(1);

    vi.mocked(getArtist).mockResolvedValue({
      artist: { id: 'art-1', name: 'Artist', userRating: 4 },
      albums: [],
    });
    const fresh = await prefetchArtistUserRatings(['art-1']);
    expect(fresh.get('art-1')).toBe(4);
    expect(getArtist).toHaveBeenCalledTimes(2);
  });
});
