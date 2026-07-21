import { libraryScopeListMainstageAlbums, type LibraryScopePair } from '@/lib/api/library/scopeReads';
import { albumToAlbum } from '@/lib/library/advancedSearchLocal';
import type { GenreAlbumCountRow } from '@/lib/api/library/dto';

export async function loadLocalNewReleases(
  anchorServerId: string,
  scopes: LibraryScopePair[],
  limit: number,
  offset = 0,
  genres: string[] = [],
  includeGenreCounts = true,
): Promise<{ albums: ReturnType<typeof albumToAlbum>[]; hasMore: boolean; genreCounts: GenreAlbumCountRow[] }> {
  if (!anchorServerId || scopes.length === 0) return { albums: [], hasMore: false, genreCounts: [] };
  const response = await libraryScopeListMainstageAlbums(anchorServerId, {
    scopes,
    feed: 'newReleases',
    limit,
    offset,
    genres,
    includeGenreCounts,
  });
  return {
    albums: response.albums.map(albumToAlbum),
    hasMore: response.hasMore,
    genreCounts: response.genreCounts,
  };
}
