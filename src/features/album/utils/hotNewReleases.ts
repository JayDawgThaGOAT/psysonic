import { getAlbumListForServer } from '@/lib/api/subsonicLibrary';
import type { SubsonicAlbum } from '@/lib/api/subsonicTypes';
import type { LibraryScopePair } from '@/lib/api/library/scopeReads';

export const HOT_NEW_RELEASE_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;
const HOT_NEW_RELEASE_SAMPLE_SIZE = 24;
const HOT_NEW_RELEASE_CONCURRENCY = 4;

function createdAtMs(album: SubsonicAlbum): number | null {
  const value = Date.parse(album.created ?? '');
  return Number.isFinite(value) ? value : null;
}

export function mergeHotNewReleases(
  local: SubsonicAlbum[],
  hot: SubsonicAlbum[],
): SubsonicAlbum[] {
  const byId = new Map<string, SubsonicAlbum>();
  for (const album of local) byId.set(album.id, album);
  for (const album of hot) {
    const prior = byId.get(album.id);
    byId.set(album.id, prior ? { ...prior, ...album } : album);
  }
  return [...byId.values()].sort((left, right) => (
    (createdAtMs(right) ?? -Infinity) - (createdAtMs(left) ?? -Infinity)
  ));
}

/** Bounded page-only freshness overlay. It never writes incomplete album summaries into SQLite. */
export async function fetchHotNewReleases(
  scopes: LibraryScopePair[],
  now = Date.now(),
): Promise<SubsonicAlbum[]> {
  const cutoff = now - HOT_NEW_RELEASE_WINDOW_MS;
  const results: SubsonicAlbum[] = [];
  let next = 0;
  const worker = async () => {
    for (;;) {
      const scope = scopes[next++];
      if (!scope) return;
      try {
        const albums = await getAlbumListForServer(
          scope.serverId,
          'newest',
          HOT_NEW_RELEASE_SAMPLE_SIZE,
          0,
          { musicFolderId: scope.libraryId },
          8000,
        );
        results.push(...albums.filter(album => (createdAtMs(album) ?? -Infinity) >= cutoff));
      } catch {
        // Local results remain useful when one selected server is unavailable.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(HOT_NEW_RELEASE_CONCURRENCY, scopes.length) }, worker));
  return mergeHotNewReleases([], results);
}
