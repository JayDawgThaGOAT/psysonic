import { getArtistsForServer } from '@/lib/api/subsonicArtists';
import { getAlbumListForServer, getRandomSongsForServer } from '@/lib/api/subsonicLibrary';
import type { SubsonicAlbum, SubsonicArtist, SubsonicSong } from '@/lib/api/subsonicTypes';
import { runLocalRandomSongs } from '@/lib/library/browseTextSearch';
import { shuffleArray } from '@/lib/util/shuffleArray';
import type { HomeFeedOffsets, HomeFeedSnapshot } from '@/features/home/store/homeFeedCache';

export const HOME_REQUEST_TIMEOUT_MS = 4000;
export const HOME_PAGE_SIZE = 12;
export const HOME_HERO_COUNT = 8;
export const HOME_DISCOVER_SLICE = 20;
export const HOME_DISCOVER_SONGS_SIZE = 18;
export const HOME_DISCOVER_ARTISTS_SIZE = 16;

export type HomeAlbumSection = keyof HomeFeedOffsets;

type OwnedAlbum = SubsonicAlbum & { serverId: string };
type OwnedArtist = SubsonicArtist & { serverId: string };
type OwnedSong = SubsonicSong & { serverId: string };

interface MixMinRatingsConfig {
  enabled: boolean;
  minSong: number;
  minAlbum: number;
  minArtist: number;
}

interface HomeScopeSource {
  servers: Array<{ id: string }>;
  activeServerId: string | null;
  libraryBrowseServerIds: string[];
  libraryBrowseSelectionByServer: Record<string, string[]>;
}

export interface HomeFeedScope {
  serverIds: string[];
  scopeKey: string;
}

interface HomeFeedLoaderDeps {
  getAlbumListForServer: typeof getAlbumListForServer;
  getArtistsForServer: typeof getArtistsForServer;
  getRandomSongsForServer: typeof getRandomSongsForServer;
  runLocalRandomSongs: typeof runLocalRandomSongs;
  filterAlbumsByMixRatingsAcrossServers: <T extends OwnedAlbum>(
    albums: T[],
    config: MixMinRatingsConfig,
  ) => Promise<T[]>;
  shuffle: <T>(items: T[]) => T[];
}

const defaultDeps: Omit<HomeFeedLoaderDeps, 'filterAlbumsByMixRatingsAcrossServers'> = {
  getAlbumListForServer,
  getArtistsForServer,
  getRandomSongsForServer,
  runLocalRandomSongs,
  shuffle: shuffleArray,
};

interface LoadHomeFeedOptions {
  serverIds: string[];
  scopeKey: string;
  scopeVersion: number;
  randomSize: number;
  showArtists: boolean;
  showSongs: boolean;
  mixConfig: MixMinRatingsConfig;
  deps: Pick<HomeFeedLoaderDeps, 'filterAlbumsByMixRatingsAcrossServers'> & Partial<HomeFeedLoaderDeps>;
}

interface LoadMoreHomeAlbumsOptions {
  snapshot: HomeFeedSnapshot;
  section: HomeAlbumSection;
  mixConfig: MixMinRatingsConfig;
  deps: Pick<HomeFeedLoaderDeps, 'filterAlbumsByMixRatingsAcrossServers'> & Partial<HomeFeedLoaderDeps>;
}

interface ServerBundle {
  serverId: string;
  starred: OwnedAlbum[];
  newest: OwnedAlbum[];
  random: OwnedAlbum[];
  frequent: OwnedAlbum[];
  recent: OwnedAlbum[];
  artists: OwnedArtist[];
  songs: OwnedSong[];
}

const albumTypes: Record<HomeAlbumSection, Parameters<typeof getAlbumListForServer>[1]> = {
  starred: 'starred',
  recent: 'newest',
  random: 'random',
  mostPlayed: 'frequent',
  recentlyPlayed: 'recent',
};

export function deriveHomeFeedScope(source: HomeScopeSource): HomeFeedScope {
  const selected = new Set(source.libraryBrowseServerIds);
  const serverIds = source.libraryBrowseServerIds.length === 0
    ? (source.activeServerId ? [source.activeServerId] : [])
    : source.servers.filter(server => selected.has(server.id)).map(server => server.id);
  const scopeKey = JSON.stringify(serverIds.map(serverId => [
    serverId,
    source.libraryBrowseSelectionByServer[serverId] ?? [],
  ]));
  return { serverIds, scopeKey };
}

export function allocateHomeQuotas(target: number, serverCount: number): number[] {
  if (target <= 0 || serverCount <= 0) return Array.from({ length: Math.max(0, serverCount) }, () => 0);
  const floor = Math.floor(target / serverCount);
  const remainder = target % serverCount;
  return Array.from({ length: serverCount }, (_, index) => floor + (index < remainder ? 1 : 0));
}

export function stableRoundRobin<T>(groups: readonly T[][], target = Number.POSITIVE_INFINITY): T[] {
  const result: T[] = [];
  const maxLength = Math.max(0, ...groups.map(group => group.length));
  for (let index = 0; index < maxLength && result.length < target; index += 1) {
    for (const group of groups) {
      const item = group[index];
      if (item !== undefined) result.push(item);
      if (result.length >= target) break;
    }
  }
  return result;
}

export function advanceHomeOffsets(
  offsets: HomeFeedOffsets,
  section: HomeAlbumSection,
  rawCounts: Record<string, number>,
): HomeFeedOffsets {
  return {
    ...offsets,
    [section]: Object.fromEntries(Object.entries(offsets[section]).map(([serverId, offset]) => [
      serverId,
      offset + (rawCounts[serverId] ?? 0),
    ])),
  };
}

function createOffsets(serverIds: string[]): HomeFeedOffsets {
  const section = () => Object.fromEntries(serverIds.map(serverId => [serverId, 0]));
  return {
    starred: section(),
    recent: section(),
    random: section(),
    mostPlayed: section(),
    recentlyPlayed: section(),
  };
}

function ownedKey(item: { id: string; serverId?: string }): string {
  return `${item.serverId ?? ''}:${item.id}`;
}

function dedupeOwned<T extends { id: string; serverId?: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = ownedKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function isolated<T>(request: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await request();
  } catch {
    return fallback;
  }
}

export async function withinHomeDeadline<T>(request: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      request,
      new Promise<T>(resolve => {
        timer = setTimeout(() => resolve(fallback), HOME_REQUEST_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function loadServerBundle(
  serverId: string,
  albumQuota: number,
  randomQuota: number,
  artistQuota: number,
  songQuota: number,
  showArtists: boolean,
  showSongs: boolean,
  deps: HomeFeedLoaderDeps,
): Promise<ServerBundle> {
  const albums = (type: Parameters<typeof getAlbumListForServer>[1], size: number) => (
    size > 0
      ? withinHomeDeadline(
          isolated(() => deps.getAlbumListForServer(serverId, type, size, 0, {}, HOME_REQUEST_TIMEOUT_MS), []),
          [] as SubsonicAlbum[],
        )
      : Promise.resolve<SubsonicAlbum[]>([])
  );
  const songs = showSongs && songQuota > 0
    ? withinHomeDeadline(
        isolated(async () => {
          const local = await deps.runLocalRandomSongs(serverId, songQuota);
          if (local != null) return local;
          return deps.getRandomSongsForServer(serverId, songQuota, undefined, HOME_REQUEST_TIMEOUT_MS);
        }, [] as SubsonicSong[]),
        [] as SubsonicSong[],
      )
    : Promise.resolve<SubsonicSong[]>([]);

  const [starred, newest, random, frequent, recent, artists, randomSongs] = await Promise.all([
    albums('starred', albumQuota),
    albums('newest', albumQuota),
    albums('random', randomQuota),
    albums('frequent', albumQuota),
    albums('recent', albumQuota),
    showArtists && artistQuota > 0
      ? withinHomeDeadline(
          isolated(() => deps.getArtistsForServer(serverId, HOME_REQUEST_TIMEOUT_MS), []),
          [] as SubsonicArtist[],
        )
      : Promise.resolve<SubsonicArtist[]>([]),
    songs,
  ]);
  const stamp = <T extends { serverId?: string }>(items: T[]) => items.map(item => ({ ...item, serverId }));
  return {
    serverId,
    starred: stamp(starred),
    newest: stamp(newest),
    random: stamp(random),
    frequent: stamp(frequent),
    recent: stamp(recent),
    artists: stamp(artists),
    songs: stamp(randomSongs),
  };
}

export async function loadHomeFeed(options: LoadHomeFeedOptions): Promise<HomeFeedSnapshot> {
  const deps = { ...defaultDeps, ...options.deps };
  const albumQuotas = allocateHomeQuotas(HOME_PAGE_SIZE, options.serverIds.length);
  const randomQuotas = allocateHomeQuotas(options.randomSize, options.serverIds.length);
  const artistQuotas = allocateHomeQuotas(HOME_DISCOVER_ARTISTS_SIZE, options.serverIds.length);
  const songQuotas = allocateHomeQuotas(HOME_DISCOVER_SONGS_SIZE, options.serverIds.length);
  const bundles = await Promise.all(options.serverIds.map((serverId, index) => loadServerBundle(
    serverId,
    albumQuotas[index] ?? 0,
    randomQuotas[index] ?? 0,
    artistQuotas[index] ?? 0,
    songQuotas[index] ?? 0,
    options.showArtists,
    options.showSongs,
    deps,
  )));

  let offsets = createOffsets(options.serverIds);
  const advanceInitial = (section: HomeAlbumSection, groups: OwnedAlbum[][]) => {
    offsets = advanceHomeOffsets(offsets, section, Object.fromEntries(
      options.serverIds.map((serverId, index) => [serverId, groups[index]?.length ?? 0]),
    ));
  };
  const starredGroups = bundles.map(bundle => bundle.starred);
  const recentGroups = bundles.map(bundle => bundle.newest);
  const randomGroups = bundles.map(bundle => bundle.random);
  const mostPlayedGroups = bundles.map(bundle => bundle.frequent);
  const recentlyPlayedGroups = bundles.map(bundle => bundle.recent);
  advanceInitial('starred', starredGroups);
  advanceInitial('recent', recentGroups);
  advanceInitial('random', randomGroups);
  advanceInitial('mostPlayed', mostPlayedGroups);
  advanceInitial('recentlyPlayed', recentlyPlayedGroups);

  const randomRaw = dedupeOwned(stableRoundRobin(randomGroups, options.randomSize));
  const filteredRandom = dedupeOwned(await deps.filterAlbumsByMixRatingsAcrossServers(
    randomRaw as OwnedAlbum[],
    options.mixConfig,
  ));
  const artists = dedupeOwned(stableRoundRobin(
    bundles.map((bundle, index) => deps.shuffle(bundle.artists).slice(0, artistQuotas[index] ?? 0)),
    HOME_DISCOVER_ARTISTS_SIZE,
  ));

  return {
    scopeKey: options.scopeKey,
    scopeVersion: options.scopeVersion,
    savedAt: Date.now(),
    offsets,
    starred: dedupeOwned(stableRoundRobin(starredGroups, HOME_PAGE_SIZE)),
    recent: dedupeOwned(stableRoundRobin(recentGroups, HOME_PAGE_SIZE)),
    heroAlbums: filteredRandom.slice(0, HOME_HERO_COUNT),
    random: filteredRandom.slice(HOME_HERO_COUNT, HOME_DISCOVER_SLICE),
    mostPlayed: dedupeOwned(stableRoundRobin(mostPlayedGroups, HOME_PAGE_SIZE)),
    recentlyPlayed: dedupeOwned(stableRoundRobin(recentlyPlayedGroups, HOME_PAGE_SIZE)),
    randomArtists: artists,
    discoverSongs: dedupeOwned(stableRoundRobin(bundles.map(bundle => bundle.songs), HOME_DISCOVER_SONGS_SIZE)),
  };
}

export async function loadMoreHomeAlbums(options: LoadMoreHomeAlbumsOptions): Promise<HomeFeedSnapshot> {
  const deps = { ...defaultDeps, ...options.deps };
  const serverIds = Object.keys(options.snapshot.offsets[options.section]);
  const quotas = allocateHomeQuotas(HOME_PAGE_SIZE, serverIds.length);
  const groups = await Promise.all(serverIds.map((serverId, index) => {
    const quota = quotas[index] ?? 0;
    if (quota <= 0) return Promise.resolve<OwnedAlbum[]>([]);
    return withinHomeDeadline(
      isolated(
        () => deps.getAlbumListForServer(
          serverId,
          albumTypes[options.section],
          quota,
          options.snapshot.offsets[options.section][serverId] ?? 0,
          {},
          HOME_REQUEST_TIMEOUT_MS,
        ).then(items => items.map(item => ({ ...item, serverId }))),
        [] as OwnedAlbum[],
      ),
      [] as OwnedAlbum[],
    );
  }));
  const rawCounts = Object.fromEntries(serverIds.map((serverId, index) => [serverId, groups[index]?.length ?? 0]));
  let batch = stableRoundRobin(groups, HOME_PAGE_SIZE);
  if (options.section === 'random') {
    batch = await deps.filterAlbumsByMixRatingsAcrossServers(batch, options.mixConfig);
  }
  const current = options.snapshot[options.section];
  const merged = dedupeOwned([...current, ...batch]);
  return {
    ...options.snapshot,
    savedAt: Date.now(),
    offsets: advanceHomeOffsets(options.snapshot.offsets, options.section, rawCounts),
    [options.section]: merged,
  };
}
