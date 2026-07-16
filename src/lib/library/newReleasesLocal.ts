import { libraryScopeListMainstageAlbums, type LibraryScopePair } from '@/lib/api/library/scopeReads';
import { albumToAlbum } from '@/lib/library/advancedSearchLocal';

export async function loadLocalNewReleases(
  anchorServerId: string,
  scopes: LibraryScopePair[],
  limit: number,
  offset = 0,
) {
  if (!anchorServerId || scopes.length === 0) return { albums: [], hasMore: false };
  const response = await libraryScopeListMainstageAlbums(anchorServerId, {
    scopes,
    feed: 'newReleases',
    limit,
    offset,
  });
  return { albums: response.albums.map(albumToAlbum), hasMore: response.hasMore };
}
