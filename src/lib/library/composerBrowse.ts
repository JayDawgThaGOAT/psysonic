import type { SubsonicAlbum, SubsonicArtist } from '@/lib/api/subsonicTypes';
import { libraryScopeListComposers, type LibraryScopePair } from '@/lib/api/library/scopeReads';
import { artistToArtist } from '@/lib/library/advancedSearchLocal';
import {
  ndListAlbumsByArtistRoleForServer,
  ndListArtistsByRoleForServer,
} from '@/lib/api/navidromeBrowse';
import { ownedEntityKey } from '@/lib/util/ownedEntityKey';

/**
 * Navidrome's `/api/artist?role=composer` can include artists whose
 * `stats.composer.albumCount` is zero (performer-only credits with no composer
 * tags). Drop them from the Composers browse catalog.
 */
export function filterArtistsWithRoleAlbumCredits(artists: SubsonicArtist[]): SubsonicArtist[] {
  return artists.filter(a => (a.albumCount ?? 0) > 0);
}

export async function loadLocalComposerCatalog(
  serverId: string,
  scopes: LibraryScopePair[],
): Promise<SubsonicArtist[]> {
  const composers = await libraryScopeListComposers(serverId, {
    scopes,
    sort: 'name',
    limit: 10_000,
  });
  return composers.map(artistToArtist);
}

export async function loadNetworkComposerCatalog(
  serverId: string,
  libraryIds: string[],
): Promise<SubsonicArtist[]> {
  const requests = libraryIds.length > 0
    ? libraryIds.map(libraryId => (
        ndListArtistsByRoleForServer(serverId, 'composer', 0, 10_000, 'name', 'ASC', libraryId)
      ))
    : [ndListArtistsByRoleForServer(serverId, 'composer', 0, 10_000)];
  const settled = await Promise.allSettled(requests);
  const batches = settled.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
  if (batches.length === 0) {
    const failure = settled.find(result => result.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
  }
  const merged = new Map<string, SubsonicArtist>();
  for (const composer of batches.flat()) {
    const key = ownedEntityKey(composer);
    const current = merged.get(key);
    merged.set(key, {
      ...current,
      ...composer,
      albumCount: Math.max(current?.albumCount ?? 0, composer.albumCount ?? 0),
    });
  }
  return [...merged.values()];
}

export async function loadNetworkComposerAlbums(
  serverId: string,
  composerId: string,
  libraryIds: string[],
): Promise<SubsonicAlbum[]> {
  const requests = libraryIds.length > 0
    ? libraryIds.map(libraryId => (
        ndListAlbumsByArtistRoleForServer(
          serverId,
          composerId,
          'composer',
          0,
          500,
          'name',
          'ASC',
          libraryId,
        )
      ))
    : [ndListAlbumsByArtistRoleForServer(serverId, composerId, 'composer', 0, 500)];
  const settled = await Promise.allSettled(requests);
  const batches = settled.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
  if (batches.length === 0) {
    const failure = settled.find(result => result.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
  }
  const merged = new Map<string, SubsonicAlbum>();
  for (const album of batches.flat()) merged.set(ownedEntityKey(album), album);
  return [...merged.values()];
}
