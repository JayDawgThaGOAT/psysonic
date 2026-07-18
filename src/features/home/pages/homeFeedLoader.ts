import { getArtistsForServer } from '@/lib/api/subsonicArtists';
import { getAlbumListForServer, getRandomSongsForServer } from '@/lib/api/subsonicLibrary';
import type { SubsonicAlbum, SubsonicArtist, SubsonicSong } from '@/lib/api/subsonicTypes';
import {
  libraryScopeListMainstageAlbums,
  type LibraryScopePair,
} from '@/lib/api/library/scopeReads';
import { albumToAlbum } from '@/lib/library/advancedSearchLocal';
import { runLocalRandomArtists, runLocalRandomSongs } from '@/lib/library/browseTextSearch';
import { deriveLibraryBrowseServerIdsWithFallback } from '@/lib/library/libraryBrowseScope';
import { shuffleArray } from '@/lib/util/shuffleArray';
import type { HomeFeedOffsets, HomeFeedSnapshot } from '@/features/home/store/homeFeedCache';

export const HOME_REQUEST_TIMEOUT_MS = 4000;
export const HOME_PAGE_SIZE = 12;
export const HOME_HERO_COUNT = 8;
export const HOME_DISCOVER_SLICE = 20;
export const HOME_DISCOVER_SONGS_SIZE = 18;
export const HOME_DISCOVER_ARTISTS_SIZE = 16;

export type HomeAlbumSection = keyof HomeFeedOffsets;
export type PerServerHomeAlbumSection = Exclude<HomeAlbumSection, 'recent' | 'recentlyPlayed'>;

export type HomeFeedLoadSection =
  | 'starred'
  | 'mostPlayed'
  | 'hero'
  | 'discover'
  | 'discoverArtists'
  | 'discoverSongs';

export type HomeFeedEnabledSections = Record<HomeFeedLoadSection, boolean>;

export interface HomeSectionResult {
  status: 'success' | 'disabled';
  durationMs: number;
  itemCount: number;
  detail?: string;
}

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
  libraryScopeListMainstageAlbums: typeof libraryScopeListMainstageAlbums;
  runLocalRandomSongs: typeof runLocalRandomSongs;
  runLocalRandomArtists: typeof runLocalRandomArtists;
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
  libraryScopeListMainstageAlbums,
  runLocalRandomSongs,
  runLocalRandomArtists,
  shuffle: shuffleArray,
};

interface LoadHomeFeedOptions {
  serverIds: string[];
  scopeKey: string;
  anchorServerId: string;
  scopes: LibraryScopePair[];
  scopeVersion: number;
  randomSize: number;
  showArtists: boolean;
  showSongs: boolean;
  enabledSections?: Partial<HomeFeedEnabledSections>;
  onSectionResult?: (section: HomeFeedLoadSection, result: HomeSectionResult) => void;
  mixConfig: MixMinRatingsConfig;
  deps: Pick<HomeFeedLoaderDeps, 'filterAlbumsByMixRatingsAcrossServers'> & Partial<HomeFeedLoaderDeps>;
}

interface LoadMoreHomeAlbumsOptions {
  snapshot: HomeFeedSnapshot;
  section: HomeAlbumSection;
  anchorServerId: string;
  scopes: LibraryScopePair[];
  mixConfig: MixMinRatingsConfig;
  deps: Pick<HomeFeedLoaderDeps, 'filterAlbumsByMixRatingsAcrossServers'> & Partial<HomeFeedLoaderDeps>;
}

interface LoadHomeChronologicalFeedOptions {
  anchorServerId: string;
  scopes: LibraryScopePair[];
  feed: 'newReleases' | 'recentlyPlayed';
  offset?: number;
  deps?: Pick<HomeFeedLoaderDeps, 'libraryScopeListMainstageAlbums'>;
}

export type HomeChronologicalFeedResult =
  | { status: 'success'; albums: SubsonicAlbum[]; hasMore: boolean; durationMs: number }
  | { status: 'error'; durationMs: number; detail: string }
  | { status: 'timeout'; durationMs: number };

const albumTypes: Record<PerServerHomeAlbumSection, Parameters<typeof getAlbumListForServer>[1]> = {
  starred: 'starred',
  random: 'random',
  mostPlayed: 'frequent',
};

const mainstageFeeds = {
  recent: 'newReleases',
  recentlyPlayed: 'recentlyPlayed',
} as const;

export function deriveHomeFeedScope(source: HomeScopeSource): HomeFeedScope {
  const serverIds = deriveLibraryBrowseServerIdsWithFallback(source);
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
  section: PerServerHomeAlbumSection,
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
    recent: { offset: 0, hasMore: false },
    random: section(),
    mostPlayed: section(),
    recentlyPlayed: { offset: 0, hasMore: false },
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

function nowMs(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

function elapsedMs(startedAt: number): number {
  return Math.max(0, Math.round(nowMs() - startedAt));
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

export async function loadHomeChronologicalFeed(
  options: LoadHomeChronologicalFeedOptions,
): Promise<HomeChronologicalFeedResult> {
  const deps = { ...defaultDeps, ...options.deps };
  const startedAt = nowMs();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const request = deps.libraryScopeListMainstageAlbums(options.anchorServerId, {
    scopes: options.scopes,
    feed: options.feed,
    limit: HOME_PAGE_SIZE,
    offset: options.offset ?? 0,
    includeGenreCounts: false,
  }).then(response => ({
    status: 'success' as const,
    albums: response.albums.map(albumToAlbum),
    hasMore: response.hasMore,
    durationMs: elapsedMs(startedAt),
  })).catch((error: unknown) => ({
    status: 'error' as const,
    durationMs: elapsedMs(startedAt),
    detail: error instanceof Error ? error.message : String(error),
  }));
  try {
    return await Promise.race([
      request,
      new Promise<HomeChronologicalFeedResult>(resolve => {
        timer = setTimeout(() => resolve({
          status: 'timeout',
          durationMs: elapsedMs(startedAt),
        }), HOME_REQUEST_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function patchHomeChronologicalFeed(
  snapshot: HomeFeedSnapshot,
  section: 'recent' | 'recentlyPlayed',
  result: HomeChronologicalFeedResult,
): HomeFeedSnapshot {
  if (result.status !== 'success') return snapshot;
  return {
    ...snapshot,
    savedAt: Date.now(),
    offsets: {
      ...snapshot.offsets,
      [section]: { offset: result.albums.length, hasMore: result.hasMore },
    },
    [section]: result.albums,
  };
}

export function preserveHomeChronologicalFeeds(
  snapshot: HomeFeedSnapshot,
  previous: HomeFeedSnapshot | null,
): HomeFeedSnapshot {
  if (!previous || previous.scopeKey !== snapshot.scopeKey) return snapshot;
  return {
    ...snapshot,
    offsets: {
      ...snapshot.offsets,
      recent: previous.offsets.recent,
      recentlyPlayed: previous.offsets.recentlyPlayed,
    },
    recent: previous.recent,
    recentlyPlayed: previous.recentlyPlayed,
  };
}

type TimedServerItems<T> = {
  items: T[];
  durationMs: number;
  outcome: 'rows' | 'empty' | 'timeout' | 'error';
  source?: 'local' | 'network';
};

async function loadServerAlbums(
  serverId: string,
  type: Parameters<typeof getAlbumListForServer>[1],
  size: number,
  deps: HomeFeedLoaderDeps,
): Promise<TimedServerItems<OwnedAlbum>> {
  const startedAt = nowMs();
  if (size <= 0) return { items: [], durationMs: 0, outcome: 'empty' };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const request = deps.getAlbumListForServer(serverId, type, size, 0, {}, HOME_REQUEST_TIMEOUT_MS)
    .then(albums => ({ albums, outcome: albums.length > 0 ? 'rows' as const : 'empty' as const }))
    .catch(() => ({ albums: [] as SubsonicAlbum[], outcome: 'error' as const }));
  const result = await Promise.race([
    request,
    new Promise<{ albums: SubsonicAlbum[]; outcome: 'timeout' }>(resolve => {
      timer = setTimeout(() => resolve({ albums: [], outcome: 'timeout' }), HOME_REQUEST_TIMEOUT_MS);
    }),
  ]);
  if (timer) clearTimeout(timer);
  return {
    items: result.albums.map(album => ({ ...album, serverId })),
    durationMs: elapsedMs(startedAt),
    outcome: result.outcome,
  };
}

async function loadServerArtists(
  serverId: string,
  size: number,
  deps: HomeFeedLoaderDeps,
): Promise<TimedServerItems<OwnedArtist>> {
  const startedAt = nowMs();
  if (size <= 0) return { items: [], durationMs: 0, outcome: 'empty' };
  const request: Promise<{
    artists: SubsonicArtist[];
    source: 'local' | 'network';
    outcome: TimedServerItems<OwnedArtist>['outcome'];
  }> = (async () => {
    try {
      const local = await deps.runLocalRandomArtists(serverId, size);
      if (local != null) return { artists: local, source: 'local' as const, outcome: local.length > 0 ? 'rows' as const : 'empty' as const };
    } catch {
      // A local read failure must not prevent the existing server fallback.
    }
    try {
      const artists = await deps.getArtistsForServer(serverId, HOME_REQUEST_TIMEOUT_MS);
      return { artists, source: 'network' as const, outcome: artists.length > 0 ? 'rows' as const : 'empty' as const };
    } catch {
      return { artists: [] as SubsonicArtist[], source: 'network' as const, outcome: 'error' as const };
    }
  })();
  const result = await withinHomeDeadline(request, {
    artists: [] as SubsonicArtist[], source: 'local' as const, outcome: 'timeout' as const,
  });
  const items = result.artists.map(artist => ({ ...artist, serverId }));
  return {
    items,
    durationMs: elapsedMs(startedAt),
    outcome: result.outcome,
    source: result.source,
  };
}

async function loadServerSongs(
  serverId: string,
  size: number,
  deps: HomeFeedLoaderDeps,
): Promise<OwnedSong[]> {
  if (size <= 0) return [];
  const songs = await withinHomeDeadline(
    isolated(async () => {
      const local = await deps.runLocalRandomSongs(serverId, size);
      if (local != null) return local;
      return deps.getRandomSongsForServer(serverId, size, undefined, HOME_REQUEST_TIMEOUT_MS);
    }, [] as SubsonicSong[]),
    [] as SubsonicSong[],
  );
  return songs.map(song => ({ ...song, serverId }));
}

function formatServerTimings<T>(
  serverIds: readonly string[],
  groups: readonly TimedServerItems<T>[],
): string {
  return serverIds.map((serverId, index) => {
    const group = groups[index];
    return `${serverId}: ${group?.durationMs ?? 0}ms/${group?.items.length ?? 0}/${group?.source ?? 'network'}/${group?.outcome ?? 'empty'}`;
  }).join(', ');
}

export async function loadHomeFeed(options: LoadHomeFeedOptions): Promise<HomeFeedSnapshot> {
  const deps = { ...defaultDeps, ...options.deps };
  const enabled: HomeFeedEnabledSections = {
    starred: true,
    mostPlayed: true,
    hero: true,
    discover: true,
    discoverArtists: options.showArtists,
    discoverSongs: options.showSongs,
    ...options.enabledSections,
  };
  const report = (section: HomeFeedLoadSection, result: HomeSectionResult) => {
    try {
      options.onSectionResult?.(section, result);
    } catch {
      // Diagnostics must not prevent Home from loading.
    }
  };
  for (const section of Object.keys(enabled) as HomeFeedLoadSection[]) {
    if (!enabled[section]) report(section, { status: 'disabled', durationMs: 0, itemCount: 0 });
  }
  const albumQuotas = allocateHomeQuotas(HOME_PAGE_SIZE, options.serverIds.length);
  const randomQuotas = allocateHomeQuotas(options.randomSize, options.serverIds.length);
  const artistQuotas = allocateHomeQuotas(HOME_DISCOVER_ARTISTS_SIZE, options.serverIds.length);
  const songQuotas = allocateHomeQuotas(HOME_DISCOVER_SONGS_SIZE, options.serverIds.length);
  const emptyGroups = () => options.serverIds.map(() => [] as OwnedAlbum[]);
  const loadAlbumGroups = (type: Parameters<typeof getAlbumListForServer>[1], quotas: number[]) => (
    Promise.all(options.serverIds.map((serverId, index) => (
      loadServerAlbums(serverId, type, quotas[index] ?? 0, deps)
    )))
  );

  const starredStartedAt = nowMs();
  const starredPromise = enabled.starred
    ? loadAlbumGroups('starred', albumQuotas).then(groups => {
        const items = dedupeOwned(stableRoundRobin(groups.map(group => group.items), HOME_PAGE_SIZE));
        report('starred', {
          status: 'success', durationMs: elapsedMs(starredStartedAt), itemCount: items.length,
          detail: formatServerTimings(options.serverIds, groups),
        });
        return { groups: groups.map(group => group.items), items };
      })
    : Promise.resolve({ groups: emptyGroups(), items: [] as OwnedAlbum[] });

  const mostPlayedStartedAt = nowMs();
  const mostPlayedPromise = enabled.mostPlayed
    ? loadAlbumGroups('frequent', albumQuotas).then(groups => {
        const items = dedupeOwned(stableRoundRobin(groups.map(group => group.items), HOME_PAGE_SIZE));
        report('mostPlayed', {
          status: 'success', durationMs: elapsedMs(mostPlayedStartedAt), itemCount: items.length,
          detail: formatServerTimings(options.serverIds, groups),
        });
        return { groups: groups.map(group => group.items), items };
      })
    : Promise.resolve({ groups: emptyGroups(), items: [] as OwnedAlbum[] });

  const randomEnabled = enabled.hero || enabled.discover;
  const randomStartedAt = nowMs();
  const randomPromise = randomEnabled
    ? loadAlbumGroups('random', randomQuotas).then(async groups => {
        const fetchDurationMs = elapsedMs(randomStartedAt);
        const raw = dedupeOwned(stableRoundRobin(groups.map(group => group.items), options.randomSize));
        const filterStartedAt = nowMs();
        const filtered = dedupeOwned(await deps.filterAlbumsByMixRatingsAcrossServers(raw, options.mixConfig));
        const filterDurationMs = elapsedMs(filterStartedAt);
        const heroAlbums = enabled.hero ? filtered.slice(0, HOME_HERO_COUNT) : [];
        const discoverStart = enabled.hero ? HOME_HERO_COUNT : 0;
        const random = enabled.discover ? filtered.slice(discoverStart, discoverStart + HOME_PAGE_SIZE) : [];
        const durationMs = elapsedMs(randomStartedAt);
        if (enabled.hero) report('hero', {
          status: 'success', durationMs, itemCount: heroAlbums.length,
          detail: [
            `shared random album fetch=${fetchDurationMs}ms`,
            `mix rating filter=${filterDurationMs}ms`,
            formatServerTimings(options.serverIds, groups),
          ].join('; '),
        });
        if (enabled.discover) report('discover', {
          status: 'success', durationMs, itemCount: random.length,
          detail: [
            `shared random album fetch=${fetchDurationMs}ms`,
            `mix rating filter=${filterDurationMs}ms`,
            formatServerTimings(options.serverIds, groups),
          ].join('; '),
        });
        return { groups: groups.map(group => group.items), heroAlbums, random };
      })
    : Promise.resolve({ groups: emptyGroups(), heroAlbums: [] as OwnedAlbum[], random: [] as OwnedAlbum[] });

  const artistsStartedAt = nowMs();
  const artistsPromise = enabled.discoverArtists
    ? Promise.all(options.serverIds.map((serverId, index) => (
      loadServerArtists(serverId, artistQuotas[index] ?? 0, deps)
    ))).then(groups => {
        const items = dedupeOwned(stableRoundRobin(
          groups.map((group, index) => deps.shuffle(group.items).slice(0, artistQuotas[index] ?? 0)),
          HOME_DISCOVER_ARTISTS_SIZE,
        ));
        report('discoverArtists', {
          status: 'success', durationMs: elapsedMs(artistsStartedAt), itemCount: items.length,
          detail: formatServerTimings(options.serverIds, groups),
        });
        return items;
      })
    : Promise.resolve([] as OwnedArtist[]);

  const songsStartedAt = nowMs();
  const songsPromise = enabled.discoverSongs
    ? Promise.all(options.serverIds.map((serverId, index) => (
        loadServerSongs(serverId, songQuotas[index] ?? 0, deps)
      ))).then(groups => {
        const items = dedupeOwned(stableRoundRobin(groups, HOME_DISCOVER_SONGS_SIZE));
        report('discoverSongs', {
          status: 'success', durationMs: elapsedMs(songsStartedAt), itemCount: items.length,
        });
        return items;
      })
    : Promise.resolve([] as OwnedSong[]);

  const [starredResult, mostPlayedResult, randomResult, artists, songs] = await Promise.all([
    starredPromise,
    mostPlayedPromise,
    randomPromise,
    artistsPromise,
    songsPromise,
  ]);

  let offsets = createOffsets(options.serverIds);
  const advanceInitial = (section: PerServerHomeAlbumSection, groups: OwnedAlbum[][]) => {
    offsets = advanceHomeOffsets(offsets, section, Object.fromEntries(
      options.serverIds.map((serverId, index) => [serverId, groups[index]?.length ?? 0]),
    ));
  };
  advanceInitial('starred', starredResult.groups);
  advanceInitial('random', randomResult.groups);
  advanceInitial('mostPlayed', mostPlayedResult.groups);

  return {
    scopeKey: options.scopeKey,
    scopeVersion: options.scopeVersion,
    savedAt: Date.now(),
    offsets,
    starred: starredResult.items,
    recent: [],
    heroAlbums: randomResult.heroAlbums,
    random: randomResult.random,
    mostPlayed: mostPlayedResult.items,
    recentlyPlayed: [],
    randomArtists: artists,
    discoverSongs: songs,
  };
}

export async function loadMoreHomeAlbums(options: LoadMoreHomeAlbumsOptions): Promise<HomeFeedSnapshot> {
  const deps = { ...defaultDeps, ...options.deps };
  if (options.section === 'recent' || options.section === 'recentlyPlayed') {
    const section = options.section;
    const cursor = options.snapshot.offsets[section];
    if (!cursor.hasMore) return options.snapshot;
    const response = await loadHomeChronologicalFeed({
      anchorServerId: options.anchorServerId,
      scopes: options.scopes,
      feed: mainstageFeeds[section],
      offset: cursor.offset,
      deps: { libraryScopeListMainstageAlbums: deps.libraryScopeListMainstageAlbums },
    });
    if (response.status !== 'success') return options.snapshot;
    return {
      ...options.snapshot,
      savedAt: Date.now(),
      offsets: {
        ...options.snapshot.offsets,
        [section]: {
          offset: cursor.offset + response.albums.length,
          hasMore: response.hasMore,
        },
      },
      [section]: [
        ...options.snapshot[section],
        ...response.albums,
      ],
    };
  }
  const section = options.section as PerServerHomeAlbumSection;
  const serverIds = Object.keys(options.snapshot.offsets[section]);
  const quotas = allocateHomeQuotas(HOME_PAGE_SIZE, serverIds.length);
  const groups = await Promise.all(serverIds.map((serverId, index) => {
    const quota = quotas[index] ?? 0;
    if (quota <= 0) return Promise.resolve<OwnedAlbum[]>([]);
    return withinHomeDeadline(
      isolated(
        () => deps.getAlbumListForServer(
          serverId,
          albumTypes[section],
          quota,
          options.snapshot.offsets[section][serverId] ?? 0,
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
  if (section === 'random') {
    batch = await deps.filterAlbumsByMixRatingsAcrossServers(batch, options.mixConfig);
  }
  const current = options.snapshot[section];
  const merged = dedupeOwned([...current, ...batch]);
  return {
    ...options.snapshot,
    savedAt: Date.now(),
    offsets: advanceHomeOffsets(options.snapshot.offsets, section, rawCounts),
    [section]: merged,
  };
}
