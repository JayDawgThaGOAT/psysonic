import { getArtist, getArtistForServer } from '@/lib/api/subsonicArtists';
import { getAlbum, getAlbumForServer } from '@/lib/api/subsonicLibrary';
import {
  shouldAttemptSubsonicForActiveServer,
  shouldAttemptSubsonicForServer,
} from '@/lib/network/subsonicNetworkGuard';

const MIX_RATING_PREFETCH_CONCURRENCY = 8;
const RATING_CACHE_TTL = 7 * 60 * 1000; // 7 minutes
const ratingCache = new Map<string, { value: number; expiresAt: number }>();

function getCachedRating(key: string): number | null {
  const entry = ratingCache.get(key);
  if (!entry) return null; // cache miss
  if (Date.now() > entry.expiresAt) { ratingCache.delete(key); return null; }
  return entry.value;
}

function setCachedRating(key: string, value: number): void {
  ratingCache.set(key, { value, expiresAt: Date.now() + RATING_CACHE_TTL });
}

/** Drop cached entity ratings after `setRating` so mixes see fresh stars. */
export function invalidateEntityUserRatingCaches(id: string): void {
  for (const key of ratingCache.keys()) {
    if (key.endsWith(`:${id}`)) ratingCache.delete(key);
  }
}

function parseEntityUserRating(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

/** Navidrome and some JSON shapes use `rating` where Subsonic docs say `userRating`. */
export function parseSubsonicEntityStarRating(entity: {
  userRating?: unknown;
  rating?: unknown;
}): number | undefined {
  return parseEntityUserRating(entity.userRating ?? entity.rating);
}

/** Bump when rating parse keys change so stale cache entries are not reused. */
const ENTITY_RATING_CACHE_KEY_VER = 'v2';

type RatingEntity = 'artist' | 'album';

function ratingCacheKey(entity: RatingEntity, serverId: string, id: string): string {
  return `${entity}:${ENTITY_RATING_CACHE_KEY_VER}:${serverId}:${id}`;
}

async function prefetchUserRatings(
  entity: RatingEntity,
  serverId: string,
  ids: string[],
  fetchEntity: (id: string) => Promise<{ userRating?: unknown; rating?: unknown }>,
  concurrency: number,
  networkAllowed: boolean,
): Promise<Map<string, number>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const out = new Map<string, number>();
  if (!unique.length) return out;
  const uncached: string[] = [];
  for (const id of unique) {
    const cached = getCachedRating(ratingCacheKey(entity, serverId, id));
    if (cached !== null) out.set(id, cached);
    else uncached.push(id);
  }
  if (!uncached.length) return out;
  if (!networkAllowed) return out;
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= uncached.length) return;
      const id = uncached[i];
      try {
        const r = parseSubsonicEntityStarRating(await fetchEntity(id));
        if (r !== undefined && r > 0) {
          setCachedRating(ratingCacheKey(entity, serverId, id), r);
          out.set(id, r);
        }
      } catch {
        /* ignore */
      }
    }
  }
  const nWorkers = Math.min(concurrency, uncached.length);
  await Promise.all(Array.from({ length: nWorkers }, () => worker()));
  return out;
}

async function prefetchActiveServerUserRatings(
  ids: string[],
  fetchEntity: (id: string) => Promise<{ userRating?: unknown; rating?: unknown }>,
  concurrency: number,
): Promise<Map<string, number>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const out = new Map<string, number>();
  if (!unique.length || !shouldAttemptSubsonicForActiveServer()) return out;
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= unique.length) return;
      const id = unique[i];
      try {
        const r = parseSubsonicEntityStarRating(await fetchEntity(id));
        if (r !== undefined && r > 0) out.set(id, r);
      } catch {
        /* ignore */
      }
    }
  }
  const nWorkers = Math.min(concurrency, unique.length);
  await Promise.all(Array.from({ length: nWorkers }, () => worker()));
  return out;
}

/** Parallel `getArtist` calls to fill mix/album filters when list endpoints omit ratings. */
export async function prefetchArtistUserRatings(
  ids: string[],
  concurrency = MIX_RATING_PREFETCH_CONCURRENCY,
): Promise<Map<string, number>> {
  return prefetchActiveServerUserRatings(
    ids,
    async id => (await getArtist(id)).artist,
    concurrency,
  );
}

/** Explicit-server variant for merged multi-server browse results. */
export async function prefetchArtistUserRatingsForServer(
  serverId: string,
  ids: string[],
  concurrency = MIX_RATING_PREFETCH_CONCURRENCY,
): Promise<Map<string, number>> {
  return prefetchUserRatings(
    'artist',
    serverId,
    ids,
    async id => (await getArtistForServer(serverId, id)).artist,
    concurrency,
    shouldAttemptSubsonicForServer(serverId),
  );
}

/** Parallel `getAlbum` calls when `albumList2` entries lack `userRating`. */
export async function prefetchAlbumUserRatings(
  ids: string[],
  concurrency = MIX_RATING_PREFETCH_CONCURRENCY,
): Promise<Map<string, number>> {
  return prefetchActiveServerUserRatings(
    ids,
    async id => (await getAlbum(id)).album,
    concurrency,
  );
}

/** Explicit-server variant for merged multi-server browse results. */
export async function prefetchAlbumUserRatingsForServer(
  serverId: string,
  ids: string[],
  concurrency = MIX_RATING_PREFETCH_CONCURRENCY,
): Promise<Map<string, number>> {
  return prefetchUserRatings(
    'album',
    serverId,
    ids,
    async id => (await getAlbumForServer(serverId, id)).album,
    concurrency,
    shouldAttemptSubsonicForServer(serverId),
  );
}
