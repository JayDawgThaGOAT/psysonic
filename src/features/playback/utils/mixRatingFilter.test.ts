import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SubsonicAlbum, SubsonicSong } from '@/lib/api/subsonicTypes';
import { usePlayerStore } from '@/features/playback/store/playerStore';
import { resetPlayerStore } from '@/test/helpers/storeReset';

vi.mock('@/lib/api/subsonicRatings', () => ({
  prefetchArtistUserRatings: vi.fn(),
  prefetchAlbumUserRatings: vi.fn(),
  prefetchArtistUserRatingsForServer: vi.fn(),
  prefetchAlbumUserRatingsForServer: vi.fn(),
  parseSubsonicEntityStarRating: vi.fn((entity: { userRating?: unknown; rating?: unknown }) =>
    entity.userRating ?? entity.rating),
}));

import {
  prefetchAlbumUserRatings,
  prefetchAlbumUserRatingsForServer,
  prefetchArtistUserRatings,
  prefetchArtistUserRatingsForServer,
} from '@/lib/api/subsonicRatings';
import {
  enrichSongsForMixRatingFilter,
  filterAlbumsByMixRatingsAcrossServers,
  filterTopArtistsForMixRatings,
  passesMixMinRatings,
} from '@/features/playback/utils/mixRatingFilter';

const enabledArtist2: { enabled: true; minSong: 0; minAlbum: 0; minArtist: 2 } = {
  enabled: true,
  minSong: 0,
  minAlbum: 0,
  minArtist: 2,
};

function song(partial: Partial<SubsonicSong> & Pick<SubsonicSong, 'id'>): SubsonicSong {
  return {
    title: 't',
    artist: 'A',
    album: 'Al',
    albumId: 'alb-1',
    artistId: 'art-1',
    duration: 180,
    ...partial,
  };
}

function album(
  partial: Pick<SubsonicAlbum, 'id' | 'name' | 'artistId'> & { serverId: string },
): SubsonicAlbum & { serverId: string } {
  return {
    artist: 'Artist',
    songCount: 1,
    duration: 180,
    ...partial,
  };
}

beforeEach(() => {
  resetPlayerStore();
  vi.mocked(prefetchArtistUserRatings).mockReset();
  vi.mocked(prefetchAlbumUserRatings).mockReset();
  vi.mocked(prefetchArtistUserRatingsForServer).mockReset();
  vi.mocked(prefetchAlbumUserRatingsForServer).mockReset();
  vi.mocked(prefetchAlbumUserRatings).mockResolvedValue(new Map());
  vi.mocked(prefetchArtistUserRatingsForServer).mockResolvedValue(new Map());
  vi.mocked(prefetchAlbumUserRatingsForServer).mockResolvedValue(new Map());
});

describe('filterAlbumsByMixRatingsAcrossServers', () => {
  it('enriches per server and preserves the original merged order', async () => {
    const config = { enabled: true, minSong: 0, minAlbum: 2, minArtist: 2 };
    const albums: Array<SubsonicAlbum & { serverId: string }> = [
      album({ id: 'shared', name: 'A shared', artistId: 'artist-a', serverId: 'server-a' }),
      album({ id: 'keep-b', name: 'B keep', artistId: 'artist-b', serverId: 'server-b' }),
      album({ id: 'keep-a', name: 'A keep', artistId: 'artist-a2', serverId: 'server-a' }),
      album({ id: 'shared', name: 'B shared', artistId: 'artist-b2', serverId: 'server-b' }),
    ];
    vi.mocked(prefetchAlbumUserRatingsForServer).mockImplementation(async serverId => (
      serverId === 'server-a'
        ? new Map([['shared', 1], ['keep-a', 4]])
        : new Map([['keep-b', 4], ['shared', 5]])
    ));
    vi.mocked(prefetchArtistUserRatingsForServer).mockImplementation(async serverId => (
      serverId === 'server-a'
        ? new Map([['artist-a', 5], ['artist-a2', 5]])
        : new Map([['artist-b', 5], ['artist-b2', 5]])
    ));

    const result = await filterAlbumsByMixRatingsAcrossServers(albums, config);

    expect(result.map(album => `${album.serverId}:${album.id}`)).toEqual([
      'server-b:keep-b',
      'server-a:keep-a',
      'server-b:shared',
    ]);
    expect(prefetchAlbumUserRatingsForServer).toHaveBeenCalledWith(
      'server-a',
      ['shared', 'keep-a'],
    );
    expect(prefetchAlbumUserRatingsForServer).toHaveBeenCalledWith(
      'server-b',
      ['keep-b', 'shared'],
    );
  });
});

describe('passesMixMinRatings — artist axis', () => {
  it('excludes when artistUserRating is at or below threshold', () => {
    expect(passesMixMinRatings(song({ id: '1', artistUserRating: 1 }), enabledArtist2)).toBe(false);
    expect(passesMixMinRatings(song({ id: '2', artistUserRating: 2 }), enabledArtist2)).toBe(false);
    expect(passesMixMinRatings(song({ id: '3', artistUserRating: 3 }), enabledArtist2)).toBe(true);
  });

  it('keeps unrated artists (missing or zero)', () => {
    expect(passesMixMinRatings(song({ id: '1' }), enabledArtist2)).toBe(true);
    expect(passesMixMinRatings(song({ id: '2', artistUserRating: 0 }), enabledArtist2)).toBe(true);
  });

  it('uses playerStore userRatingOverrides before API fields', () => {
    usePlayerStore.getState().setUserRatingOverride('art-1', 1);
    expect(
      passesMixMinRatings(song({ id: '1', artistUserRating: 5 }), enabledArtist2),
    ).toBe(false);
  });

  it('uses OpenSubsonic artists[] ref when artistUserRating is absent', () => {
    const low = song({
      id: '1',
      artists: [{ id: 'art-1', userRating: 1 }],
    });
    expect(passesMixMinRatings(low, enabledArtist2)).toBe(false);
  });
});

describe('enrichSongsForMixRatingFilter', () => {
  it('prefetches entity artist rating even when song carries a misleading artists[] ref', async () => {
    vi.mocked(prefetchArtistUserRatings).mockResolvedValue(new Map([['art-1', 1]]));

    const input = [
      song({
        id: '1',
        artists: [{ id: 'art-1', userRating: 5 }],
      }),
    ];
    const out = await enrichSongsForMixRatingFilter(input, enabledArtist2);

    expect(prefetchArtistUserRatings).toHaveBeenCalledWith(['art-1']);
    expect(out[0].artistUserRating).toBe(1);
    expect(passesMixMinRatings(out[0], enabledArtist2)).toBe(false);
  });
});

describe('filterTopArtistsForMixRatings', () => {
  it('drops artists rated at or below the threshold', async () => {
    vi.mocked(prefetchArtistUserRatings).mockResolvedValue(
      new Map([
        ['a1', 1],
        ['a2', 3],
      ]),
    );

    const out = await filterTopArtistsForMixRatings(
      [
        { id: 'a1', name: 'Low' },
        { id: 'a2', name: 'Ok' },
        { id: 'a3', name: 'Unrated' },
      ],
      enabledArtist2,
    );

    expect(out.map(a => a.id)).toEqual(['a2', 'a3']);
  });
});
