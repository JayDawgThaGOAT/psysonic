import type { SubsonicAlbum, SubsonicArtist, SubsonicSong } from '@/lib/api/subsonicTypes';

/** Session cache so leaving Mainstage and returning does not refetch + reshuffle everything. */
export type HomeFeedSnapshot = {
  scopeKey: string;
  scopeVersion: number;
  savedAt: number;
  offsets: HomeFeedOffsets;
  starred: SubsonicAlbum[];
  recent: SubsonicAlbum[];
  random: SubsonicAlbum[];
  heroAlbums: SubsonicAlbum[];
  mostPlayed: SubsonicAlbum[];
  recentlyPlayed: SubsonicAlbum[];
  randomArtists: SubsonicArtist[];
  discoverSongs: SubsonicSong[];
};

export type HomeFeedOffsets = {
  starred: Record<string, number>;
  recent: Record<string, number>;
  random: Record<string, number>;
  mostPlayed: Record<string, number>;
  recentlyPlayed: Record<string, number>;
};

const TTL_MS = 15 * 60 * 1000;
const MAX_SNAPSHOTS = 4;
const snapshots = new Map<string, HomeFeedSnapshot>();

function cacheKey(scopeKey: string, scopeVersion: number): string {
  return JSON.stringify([scopeKey, scopeVersion]);
}

export function readHomeFeedCache(
  scopeKey: string | null | undefined,
  scopeVersion: number,
): HomeFeedSnapshot | null {
  if (!scopeKey) return null;
  const key = cacheKey(scopeKey, scopeVersion);
  const snapshot = snapshots.get(key);
  if (!snapshot) return null;
  if (Date.now() - snapshot.savedAt > TTL_MS) return null;
  snapshots.delete(key);
  snapshots.set(key, snapshot);
  return snapshot;
}

/** Last good snapshot for this complete scope when its version changed while offline. */
export function readHomeFeedCacheStale(
  scopeKey: string | null | undefined,
): HomeFeedSnapshot | null {
  if (!scopeKey) return null;
  let newest: HomeFeedSnapshot | null = null;
  for (const snapshot of snapshots.values()) {
    if (snapshot.scopeKey !== scopeKey || Date.now() - snapshot.savedAt > TTL_MS) continue;
    if (!newest
      || snapshot.savedAt > newest.savedAt
      || (snapshot.savedAt === newest.savedAt && snapshot.scopeVersion > newest.scopeVersion)) {
      newest = snapshot;
    }
  }
  return newest;
}

export function isHomeFeedSnapshotEmpty(snap: HomeFeedSnapshot): boolean {
  return snap.heroAlbums.length === 0
    && snap.recent.length === 0
    && snap.random.length === 0
    && snap.starred.length === 0
    && snap.mostPlayed.length === 0
    && snap.recentlyPlayed.length === 0
    && snap.discoverSongs.length === 0
    && snap.randomArtists.length === 0;
}

export function writeHomeFeedCache(data: Omit<HomeFeedSnapshot, 'savedAt'>): void {
  const snapshot = { ...data, savedAt: Date.now() };
  const key = cacheKey(snapshot.scopeKey, snapshot.scopeVersion);
  snapshots.delete(key);
  snapshots.set(key, snapshot);
  while (snapshots.size > MAX_SNAPSHOTS) {
    const oldestKey = snapshots.keys().next().value as string | undefined;
    if (!oldestKey) break;
    snapshots.delete(oldestKey);
  }
}

export function clearHomeFeedCache(): void {
  snapshots.clear();
}
