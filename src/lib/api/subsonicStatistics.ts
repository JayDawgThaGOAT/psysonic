import { useAuthStore } from '@/store/authStore';
import { getArtistsForServer } from '@/lib/api/subsonicArtists';
import { getAlbumListForServer, getRandomSongsForServer } from '@/lib/api/subsonicLibrary';
import { libraryScopeCacheKeyForServer } from '@/lib/api/subsonicClient';
import {
  libraryScopeStatistics,
  libraryScopeMostPlayed,
  type LibraryScopeMostPlayedResponse,
  type LibraryStatisticsScope,
} from '@/lib/api/library/scopeReads';
import type {
  StatisticsLibraryAggregates,
  StatisticsOverviewData,
  SubsonicAlbum,
} from '@/lib/api/subsonicTypes';
import { deriveLibraryBrowseIndexScopes } from '@/lib/library/libraryBrowseScope';
import { genreTagsFor } from '@/lib/library/genreTags';
import { readyLibraryServerKeys } from '@/lib/library/libraryReady';

/** Cache TTL for statistics page aggregates — same 7-minute window as
 *  the rating prefetch cache in subsonicRatings.ts. */
const STATS_CACHE_TTL = 7 * 60 * 1000;

/** Key `prefix:serverId:scope` — Statistics caches share scope with `libraryFilterParams()`. */
export function statisticsPageCacheKey(prefix: string): string | null {
  const { activeServerId } = useAuthStore.getState();
  if (!activeServerId) return null;
  return `${prefix}:${activeServerId}:${libraryScopeCacheKeyForServer(activeServerId)}`;
}

export function statisticsIndexScopes(): LibraryStatisticsScope[] {
  const state = useAuthStore.getState();
  return deriveLibraryBrowseIndexScopes(state);
}

/** Ranked local-index albums for the same selected server/folder scope as Statistics. */
export function fetchMostPlayedAlbums(
  limit: number,
  offset: number,
): Promise<LibraryScopeMostPlayedResponse> {
  return libraryScopeMostPlayed({
    scopes: statisticsIndexScopes(),
    limit,
    offset,
  });
}

function statisticsAggregateCacheKey(scopes: LibraryStatisticsScope[]): string | null {
  if (scopes.length === 0) return null;
  return `statsAgg:${scopes.map(scope => `${scope.serverId}:${scope.libraryIds.join(',') || 'all'}`).join('|')}`;
}

const statisticsAggregatesCache = new Map<string, { value: StatisticsLibraryAggregates; expiresAt: number }>();

async function fetchStatisticsAlbumsForScope(
  scope: LibraryStatisticsScope,
  pageSize: number,
  limit: number,
): Promise<{ albums: SubsonicAlbum[]; capped: boolean }> {
  const albumsById = new Map<string, SubsonicAlbum>();
  const libraryIds = scope.libraryIds.length > 1 ? scope.libraryIds : [null];
  let capped = false;
  for (const libraryId of libraryIds) {
    let offset = 0;
    while (albumsById.size < limit) {
      const size = Math.min(pageSize, limit - albumsById.size);
      const albums = await getAlbumListForServer(
        scope.serverId,
        'alphabeticalByName',
        size,
        offset,
        libraryId ? { musicFolderId: libraryId } : {},
      );
      for (const album of albums) albumsById.set(album.id, album);
      if (albums.length < size) break;
      offset += size;
    }
    if (albumsById.size >= limit) {
      capped = true;
      break;
    }
  }
  return { albums: [...albumsById.values()], capped };
}

async function fetchStatisticsNetworkAggregates(
  scopes: LibraryStatisticsScope[],
): Promise<StatisticsLibraryAggregates> {
  const pageSize = 500;
  const albumLimitPerServer = 5_000;
  const byServer = await Promise.all(scopes.map(async scope => {
    const [artists, formatSongs, albumResult] = await Promise.all([
      getArtistsForServer(scope.serverId).catch(() => []),
      getRandomSongsForServer(scope.serverId, 500).catch(() => []),
      fetchStatisticsAlbumsForScope(scope, pageSize, albumLimitPerServer),
    ]);
    return { artists, formatSongs, ...albumResult };
  }));

  const genreAgg = new Map<string, { songCount: number; albumCount: number }>();
  const formatCounts = new Map<string, number>();
  let artistCount = 0;
  let playtimeSec = 0;
  let albumsCounted = 0;
  let songsCounted = 0;
  let formatTrackCount = 0;
  let capped = false;
  for (const server of byServer) {
    artistCount += server.artists.length;
    capped ||= server.capped;
    for (const album of server.albums) {
      playtimeSec += album.duration ?? 0;
      albumsCounted += 1;
      const songCount = album.songCount ?? 0;
      songsCounted += songCount;
      const labels = genreTagsFor(album);
      for (const label of labels.length > 0 ? labels : ['']) {
        const aggregate = genreAgg.get(label) ?? { songCount: 0, albumCount: 0 };
        aggregate.songCount += songCount;
        aggregate.albumCount += 1;
        genreAgg.set(label, aggregate);
      }
    }
    for (const song of server.formatSongs) {
      const format = song.suffix?.toUpperCase() ?? 'Unknown';
      formatCounts.set(format, (formatCounts.get(format) ?? 0) + 1);
      formatTrackCount += 1;
    }
  }

  return {
    artistCount,
    playtimeSec,
    albumsCounted,
    songsCounted,
    capped,
    genres: [...genreAgg.entries()]
      .map(([value, counts]) => ({ value, ...counts }))
      .sort((a, b) => b.songCount - a.songCount),
    formats: [...formatCounts.entries()]
      .map(([format, count]) => ({ format, count }))
      .sort((a, b) => b.count - a.count),
    formatTrackCount,
  };
}

/**
 * Reads aggregate counts from the local index. Cache keys include every selected
 * server/folder, and intentionally preserve duplicate entities across scopes.
 */
export async function fetchStatisticsLibraryAggregates(): Promise<StatisticsLibraryAggregates> {
  const scopes = statisticsIndexScopes();
  const key = statisticsAggregateCacheKey(scopes);
  if (key) {
    const hit = statisticsAggregatesCache.get(key);
    if (hit && Date.now() < hit.expiresAt) return hit.value;
  }

  const indexReady = await readyLibraryServerKeys(scopes.map(scope => scope.serverId));
  const result = indexReady
    ? await libraryScopeStatistics(scopes).then<StatisticsLibraryAggregates>(aggregate => ({
      artistCount: aggregate.artistCount,
      playtimeSec: aggregate.playtimeSec,
      albumsCounted: aggregate.albumCount,
      songsCounted: aggregate.songCount,
      capped: false,
      genres: aggregate.genres,
      formats: aggregate.formats.map(format => ({ format: format.value, count: format.songCount })),
      formatTrackCount: aggregate.songCount,
    })).catch(() => fetchStatisticsNetworkAggregates(scopes))
    : await fetchStatisticsNetworkAggregates(scopes);
  if (key) {
    statisticsAggregatesCache.set(key, { value: result, expiresAt: Date.now() + STATS_CACHE_TTL });
  }
  return result;
}

/** Recent / frequent / highest album strips for Statistics. */
const statisticsOverviewCache = new Map<string, { value: StatisticsOverviewData; expiresAt: number }>();

export async function fetchStatisticsOverview(): Promise<StatisticsOverviewData> {
  const scopes = statisticsIndexScopes();
  const scopeKey = statisticsAggregateCacheKey(scopes);
  const key = scopeKey ? `statsOverview:${scopeKey}` : null;
  if (key) {
    const hit = statisticsOverviewCache.get(key);
    if (hit && Date.now() < hit.expiresAt) return hit.value;
  }
  const serverIds = scopes.map(scope => scope.serverId);
  const fetchType = (type: 'recent' | 'frequent' | 'highest', size: number) =>
    Promise.all(serverIds.map(serverId =>
      getAlbumListForServer(serverId, type, size).catch(() => [] as SubsonicAlbum[]),
    )).then(results => results.flat());
  const [recent, frequent, highest] = await Promise.all([
    fetchType('recent', 20),
    fetchType('frequent', 12),
    fetchType('highest', 12),
  ]);
  const result: StatisticsOverviewData = {
    recent,
    frequent,
    highest,
  };
  if (key) {
    statisticsOverviewCache.set(key, { value: result, expiresAt: Date.now() + STATS_CACHE_TTL });
  }
  return result;
}
