import { useAuthStore } from '@/store/authStore';
import { getAlbumListForServer } from '@/lib/api/subsonicLibrary';
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

  const aggregate = await libraryScopeStatistics(scopes);
  const result: StatisticsLibraryAggregates = {
    artistCount: aggregate.artistCount,
    playtimeSec: aggregate.playtimeSec,
    albumsCounted: aggregate.albumCount,
    songsCounted: aggregate.songCount,
    capped: false,
    genres: aggregate.genres,
    formats: aggregate.formats.map(format => ({ format: format.value, count: format.songCount })),
  };
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
