import type { Results } from '@/features/search/searchBrowseTypes';
import { ownedOverrideValue } from '@/lib/util/ownedEntityKey';

export function filterStarredSearchResults(
  results: Results,
  starredOverrides: Record<string, boolean>,
): Results {
  const isFavorite = (entity: { id: string; serverId?: string; starred?: string }) =>
    ownedOverrideValue(starredOverrides, entity) ?? Boolean(entity.starred);

  return {
    artists: results.artists.filter(isFavorite),
    albums: results.albums.filter(isFavorite),
    songs: results.songs.filter(isFavorite),
  };
}
