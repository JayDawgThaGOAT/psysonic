import { invoke } from '@tauri-apps/api/core';
import { getArtistForServer } from '@/lib/api/subsonicArtists';
import { getAlbumForServer } from '@/lib/api/subsonicLibrary';
import { mapServerIdFromIndexKey, serverIndexKeyForId } from '@/lib/api/library/internal';
import { shouldAttemptSubsonicForServer } from '@/lib/network/subsonicNetworkGuard';

const MIX_RATING_PREFETCH_CONCURRENCY = 8;
const ENTITY_RATING_BATCH_LIMIT = 300;

export type EntityRatingKind = 'track' | 'album' | 'artist';

export interface EntityUserRatingRef {
  serverId: string;
  entityKind: EntityRatingKind;
  entityId: string;
}

interface EntityUserRatingDto extends EntityUserRatingRef {
  rating: number;
  fetchedAt: number;
}

export function entityUserRatingKey({ serverId, entityKind, entityId }: EntityUserRatingRef): string {
  return `${serverId}\u0001${entityKind}\u0001${entityId}`;
}

function validRefs(refs: EntityUserRatingRef[]): EntityUserRatingRef[] {
  const unique = new Map<string, EntityUserRatingRef>();
  for (const ref of refs) {
    if (ref.serverId && ref.entityId) unique.set(entityUserRatingKey(ref), ref);
  }
  return [...unique.values()];
}

function chunks<T>(values: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < values.length; index += size) out.push(values.slice(index, index + size));
  return out;
}

/** Navidrome and some JSON shapes use `rating` where Subsonic docs say `userRating`. */
export function parseSubsonicEntityStarRating(entity: {
  userRating?: unknown;
  rating?: unknown;
}): number | undefined {
  const value = entity.userRating ?? entity.rating;
  if (value === null || value === undefined) return undefined;
  const rating = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(rating) ? rating : undefined;
}

/** Read cached owner-scoped ratings. The index uses server keys; callers use saved-server ids. */
export async function getLocalEntityUserRatings(refs: EntityUserRatingRef[]): Promise<Map<string, number>> {
  const unique = validRefs(refs);
  if (!unique.length) return new Map();
  const requestedByIndexKey = new Map<string, EntityUserRatingRef>();
  for (const ref of unique) {
    requestedByIndexKey.set(entityUserRatingKey({ ...ref, serverId: serverIndexKeyForId(ref.serverId) }), ref);
  }
  try {
    const responses = await Promise.all(chunks(unique, ENTITY_RATING_BATCH_LIMIT).map(batch =>
      invoke<EntityUserRatingDto[]>('library_get_entity_user_ratings', {
        refs: batch.map(ref => ({ ...ref, serverId: serverIndexKeyForId(ref.serverId) })),
      }),
    ));
    const out = new Map<string, number>();
    for (const response of responses.flat()) {
      const requested = requestedByIndexKey.get(entityUserRatingKey(response));
      const serverId = requested?.serverId ?? mapServerIdFromIndexKey(response.serverId);
      out.set(entityUserRatingKey({ ...response, serverId }), response.rating);
    }
    return out;
  } catch {
    return new Map();
  }
}

/** Write a known owner-scoped rating without waiting for a full library sync. */
export function putLocalEntityUserRatings(ratings: Array<EntityUserRatingRef & { rating: number }>): void {
  const valid = ratings.filter(rating =>
    rating.serverId && rating.entityId && Number.isFinite(rating.rating),
  );
  for (const batch of chunks(valid, ENTITY_RATING_BATCH_LIMIT)) {
    void invoke<void>('library_put_entity_user_ratings', {
      ratings: batch.map(rating => ({ ...rating, serverId: serverIndexKeyForId(rating.serverId), fetchedAt: 0 })),
    }).catch(() => {});
  }
}

const hydrationQueued = new Set<string>();
const hydrationQueue: EntityUserRatingRef[] = [];
let activeHydrations = 0;

function scheduleEntityRatingHydration(refs: EntityUserRatingRef[]): void {
  for (const ref of validRefs(refs)) {
    const key = entityUserRatingKey(ref);
    if (ref.entityKind === 'track' || hydrationQueued.has(key) || !shouldAttemptSubsonicForServer(ref.serverId)) continue;
    hydrationQueued.add(key);
    hydrationQueue.push(ref);
  }
  while (activeHydrations < MIX_RATING_PREFETCH_CONCURRENCY && hydrationQueue.length) {
    const ref = hydrationQueue.shift()!;
    activeHydrations++;
    void (async () => {
      try {
        const entity = ref.entityKind === 'artist'
          ? (await getArtistForServer(ref.serverId, ref.entityId)).artist
          : (await getAlbumForServer(ref.serverId, ref.entityId)).album;
        const rating = parseSubsonicEntityStarRating(entity);
        if (rating !== undefined) putLocalEntityUserRatings([{ ...ref, rating }]);
      } catch {
        // A later list pass may retry transient server failures.
      } finally {
        hydrationQueued.delete(entityUserRatingKey(ref));
        activeHydrations--;
        scheduleEntityRatingHydration([]);
      }
    })();
  }
}

/** Resolve local ratings, then schedule non-blocking hydration for missing albums and artists. */
export async function resolveEntityUserRatings(
  refs: EntityUserRatingRef[],
  knownRefs: EntityUserRatingRef[] = [],
): Promise<Map<string, number>> {
  const local = await getLocalEntityUserRatings(refs);
  const knownKeys = new Set(validRefs(knownRefs).map(entityUserRatingKey));
  scheduleEntityRatingHydration(validRefs(refs).filter(ref => (
    !local.has(entityUserRatingKey(ref)) && !knownKeys.has(entityUserRatingKey(ref))
  )));
  return local;
}

/** Persist ratings already supplied by a list/detail payload for the next local-first pass. */
export function rememberEntityUserRating(
  ref: EntityUserRatingRef,
  payloadRating: unknown,
): void {
  const rating = parseSubsonicEntityStarRating({ userRating: payloadRating });
  if (rating !== undefined) putLocalEntityUserRatings([{ ...ref, rating }]);
}

/** Legacy prefetch APIs now return local hits and schedule, rather than await, hydration. */
async function prefetchForServer(
  entityKind: 'artist' | 'album',
  serverId: string | null | undefined,
  ids: string[],
): Promise<Map<string, number>> {
  if (!serverId) return new Map();
  const refs = ids.map(entityId => ({ serverId, entityKind, entityId }));
  const ratings = await resolveEntityUserRatings(refs);
  const byId = new Map<string, number>();
  for (const ref of refs) {
    const rating = ratings.get(entityUserRatingKey(ref));
    if (rating !== undefined) byId.set(ref.entityId, rating);
  }
  return byId;
}

export function prefetchArtistUserRatingsForServer(serverId: string, ids: string[], _concurrency = MIX_RATING_PREFETCH_CONCURRENCY): Promise<Map<string, number>> {
  return prefetchForServer('artist', serverId, ids);
}

export function prefetchAlbumUserRatingsForServer(serverId: string, ids: string[], _concurrency = MIX_RATING_PREFETCH_CONCURRENCY): Promise<Map<string, number>> {
  return prefetchForServer('album', serverId, ids);
}

/** Kept for compatibility with prior callers that invalidated the frontend TTL cache. */
export function invalidateEntityUserRatingCaches(_id: string): void {}
