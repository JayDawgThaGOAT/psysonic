import type { HomeSectionId } from '@/features/home/store/homeStore';
import type { HomeFeedSnapshot } from '@/features/home/store/homeFeedCache';
import type { MainstageDiagnosticFinish } from '@/features/home/store/mainstageDiagnosticStore';

export type MainstageEnabledSections = Record<HomeSectionId, boolean>;

export function preserveDisabledHomeSections(
  snapshot: HomeFeedSnapshot,
  previous: HomeFeedSnapshot | null,
  enabled: MainstageEnabledSections,
): HomeFeedSnapshot {
  if (!previous || previous.scopeKey !== snapshot.scopeKey) return snapshot;
  return {
    ...snapshot,
    starred: enabled.starred ? snapshot.starred : previous.starred,
    random: enabled.discover ? snapshot.random : previous.random,
    heroAlbums: enabled.hero ? snapshot.heroAlbums : previous.heroAlbums,
    mostPlayed: enabled.mostPlayed ? snapshot.mostPlayed : previous.mostPlayed,
    randomArtists: enabled.discoverArtists ? snapshot.randomArtists : previous.randomArtists,
    discoverSongs: enabled.discoverSongs ? snapshot.discoverSongs : previous.discoverSongs,
    offsets: {
      ...snapshot.offsets,
      starred: enabled.starred ? snapshot.offsets.starred : previous.offsets.starred,
      random: enabled.discover ? snapshot.offsets.random : previous.offsets.random,
      mostPlayed: enabled.mostPlayed ? snapshot.offsets.mostPlayed : previous.offsets.mostPlayed,
    },
  };
}

export function homeSnapshotForEnabledCoverWarm(
  snapshot: HomeFeedSnapshot,
  enabled: MainstageEnabledSections,
): HomeFeedSnapshot {
  return {
    ...snapshot,
    starred: enabled.starred ? snapshot.starred : [],
    recent: enabled.recent ? snapshot.recent : [],
    random: enabled.discover ? snapshot.random : [],
    heroAlbums: enabled.hero ? snapshot.heroAlbums : [],
    mostPlayed: enabled.mostPlayed ? snapshot.mostPlayed : [],
    recentlyPlayed: enabled.recentlyPlayed ? snapshot.recentlyPlayed : [],
    randomArtists: enabled.discoverArtists ? snapshot.randomArtists : [],
    discoverSongs: enabled.discoverSongs ? snapshot.discoverSongs : [],
  };
}

export function reportCachedHomeDiagnostics(
  snapshot: HomeFeedSnapshot,
  isEnabled: (id: HomeSectionId) => boolean,
  finish: (id: HomeSectionId, result: MainstageDiagnosticFinish) => void,
): void {
  const cachedSections = {
    hero: snapshot.heroAlbums,
    recent: snapshot.recent,
    discover: snapshot.random,
    discoverSongs: snapshot.discoverSongs,
    discoverArtists: snapshot.randomArtists,
    recentlyPlayed: snapshot.recentlyPlayed,
    starred: snapshot.starred,
    mostPlayed: snapshot.mostPlayed,
  } as const;
  for (const [id, items] of Object.entries(cachedSections) as Array<[
    keyof typeof cachedSections,
    readonly unknown[],
  ]>) {
    if (!isEnabled(id)) continue;
    finish(id, {
      status: items.length > 0 ? 'ready' : 'empty',
      durationMs: 0,
      itemCount: items.length,
      detail: 'cache',
    });
  }
}
