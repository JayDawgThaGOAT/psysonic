import { beforeEach, describe, expect, it, vi } from 'vitest';

const libraryListRandomArtists = vi.fn();
const librarySelectionForServer = vi.fn();
const libraryIsReady = vi.fn();

vi.mock('@/lib/api/library', () => ({
  libraryListRandomArtists: (...args: unknown[]) => libraryListRandomArtists(...args),
}));
vi.mock('@/lib/api/subsonicClient', () => ({
  libraryScopeForServer: vi.fn(),
  libraryScopePairsForServer: vi.fn(),
  librarySelectionForServer: (...args: unknown[]) => librarySelectionForServer(...args),
}));
vi.mock('./libraryReady', () => ({
  libraryIsReady: (...args: unknown[]) => libraryIsReady(...args),
  waitForLibraryBrowseReady: vi.fn(),
}));

import {
  browseRaceCountsArtists,
  filterBrowseArtistsByNameQuery,
  raceBrowseWithLocalFallback,
  runLocalRandomArtists,
} from './browseTextSearch';

describe('filterBrowseArtistsByNameQuery', () => {
  it('matches Cyrillic names regardless of query case', () => {
    const artists = [{ id: '1', name: 'Кино' }];
    expect(filterBrowseArtistsByNameQuery(artists, 'кин')).toHaveLength(1);
    expect(filterBrowseArtistsByNameQuery(artists, 'КИН')).toHaveLength(1);
  });
});

describe('raceBrowseWithLocalFallback', () => {
  it('returns local when network throws and local has data', async () => {
    const outcome = await raceBrowseWithLocalFallback(
      () => false,
      async () => [{ id: 'a1', name: 'Local Artist' }],
      async () => {
        throw new Error('server down');
      },
      {
        surface: 'artists_browse',
        query: 'test',
        counts: browseRaceCountsArtists,
      },
    );
    expect(outcome?.source).toBe('local');
    expect(outcome?.result).toHaveLength(1);
  });

  it('falls back to local after race when network was faster but returned null', async () => {
    let localCalls = 0;
    const outcome = await raceBrowseWithLocalFallback(
      () => false,
      async () => {
        localCalls += 1;
        return localCalls >= 2 ? ['hit'] : null;
      },
      async () => null,
    );
    expect(outcome?.source).toBe('local');
    expect(outcome?.result).toEqual(['hit']);
  });

  it('returns network when local is unavailable', async () => {
    const outcome = await raceBrowseWithLocalFallback(
      () => false,
      async () => null,
      async () => ['network'],
    );
    expect(outcome?.source).toBe('network');
    expect(outcome?.result).toEqual(['network']);
  });
});

describe('runLocalRandomArtists', () => {
  beforeEach(() => {
    libraryListRandomArtists.mockReset();
    librarySelectionForServer.mockReset();
    libraryIsReady.mockReset();
  });

  it('uses the local command for a ready whole-library server', async () => {
    librarySelectionForServer.mockReturnValue([]);
    libraryIsReady.mockResolvedValue(true);
    libraryListRandomArtists.mockResolvedValue([
      { serverId: 'server-a', id: 'artist-a', name: 'Artist A', syncedAt: 1, rawJson: {} },
    ]);

    await expect(runLocalRandomArtists('server-a', 16)).resolves.toEqual([
      expect.objectContaining({ serverId: 'server-a', id: 'artist-a', name: 'Artist A' }),
    ]);
    expect(libraryListRandomArtists).toHaveBeenCalledWith('server-a', 16);
  });

  it('keeps scoped selections on the network path', async () => {
    librarySelectionForServer.mockReturnValue(['library-a']);

    await expect(runLocalRandomArtists('server-a', 16)).resolves.toBeNull();
    expect(libraryIsReady).not.toHaveBeenCalled();
    expect(libraryListRandomArtists).not.toHaveBeenCalled();
  });
});
