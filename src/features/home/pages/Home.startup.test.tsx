import type { ReactNode } from 'react';
import { act, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HomeFeedSnapshot } from '@/features/home/store/homeFeedCache';

const homeMocks = vi.hoisted(() => ({
  connection: { status: 'checking' as 'checking' | 'connected' | 'disconnected' },
  loadHomeFeedWithStatus: vi.fn(),
  loadHomeChronologicalFeed: vi.fn(),
  unavailableServerIds: new Set<string>(),
}));

vi.mock('@/features/album', () => ({
  AlbumRow: () => null,
  LosslessAlbumsRail: () => null,
}));
vi.mock('@/features/home/components/Hero', () => ({
  default: ({ albums }: { albums: Array<{ name: string }> }) => (
    <div data-testid="home-hero">{albums.map(album => album.name).join(',')}</div>
  ),
}));
vi.mock('@/features/home/components/SongRail', () => ({ default: () => null }));
vi.mock('@/features/home/components/BecauseYouLikeRail', () => ({ default: () => null }));
vi.mock('@/features/home/components/MainstageDiagnosticFrame', () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/features/playback/utils/mixRatingFilter', () => ({
  filterAlbumsByMixRatingsAcrossServers: vi.fn(async albums => albums),
  getMixMinRatingsConfigFromAuth: () => ({
    enabled: false, minSong: 0, minAlbum: 0, minArtist: 0,
  }),
}));
vi.mock('@/lib/perf/perfFlags', () => ({
  usePerfProbeFlags: () => ({
    disableMainstageRails: true,
    disableHomeAlbumRows: false,
    disableHomeSongRails: false,
    disableMainstageRailArtwork: true,
    disableHomeRailArtwork: false,
    disableMainstageHero: false,
    disableMainstageGridCards: true,
    disableHomeArtworkFx: false,
    disableHomeArtworkClip: false,
  }),
}));
vi.mock('@/lib/perf/psyLabDebugTraces', () => ({
  usePsyLabDebugTraces: () => ({ mainstage: false }),
}));
vi.mock('@/lib/perf/perfTelemetry', () => ({ bumpPerfCounter: vi.fn() }));
vi.mock('@/cover/useLibraryCoverPrefetch', () => ({ useLibraryCoverPrefetch: vi.fn() }));
vi.mock('@/cover/warmDiskPeek', () => ({
  primeAlbumCoversForDisplay: vi.fn(async () => undefined),
  warmHomeMainstageCovers: vi.fn(async () => undefined),
}));
vi.mock('@/features/home/store/becauseYouLikeCache', () => ({
  readBecauseYouLikeCache: () => null,
}));
vi.mock('@/lib/hooks/useConnectionStatus', () => ({
  useConnectionStatus: () => ({ status: homeMocks.connection.status }),
}));
vi.mock('@/features/offline', () => ({
  useOfflineBrowseContext: () => ({ active: false }),
  useOfflineBrowseReloadToken: () => 0,
  useDevOfflineBrowseStore: (selector: (state: { forceOffline: boolean }) => unknown) => (
    selector({ forceOffline: false })
  ),
}));
vi.mock('@/lib/library/libraryBrowseScope', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/library/libraryBrowseScope')>()),
  deriveLibraryBrowseScope: () => ({
    anchorServerId: 'server-a',
    pairs: [{ serverId: 'server-a', libraryId: 'library-a' }],
  }),
}));
vi.mock('@/lib/network/serverReachability', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/network/serverReachability')>()),
  useUnavailableServerIds: () => homeMocks.unavailableServerIds,
}));
vi.mock('@/features/home/pages/homeFeedLoader', () => ({
  deriveHomeFeedScope: () => ({ serverIds: ['server-a'], scopeKey: 'scope' }),
  loadHomeFeedWithStatus: homeMocks.loadHomeFeedWithStatus,
  loadHomeChronologicalFeed: homeMocks.loadHomeChronologicalFeed,
  loadMoreHomeAlbums: vi.fn(),
  patchHomeChronologicalFeed: (snapshot: HomeFeedSnapshot) => snapshot,
  preserveHomeChronologicalFeeds: (snapshot: HomeFeedSnapshot) => snapshot,
}));
vi.mock('@/features/home/pages/homeCoverPrefetch', () => ({
  groupHomeCoverPrefetchBuckets: () => [],
  homeDiscoverCoverPrefetchBucket: () => ({}),
  shouldOfferHomeLoadMore: () => false,
}));
vi.mock('@/store/offlineLocalLibrarySyncRevision', () => ({
  useLibraryScopeSyncRevision: () => 0,
}));
vi.mock('@/features/home/pages/homeDiagnosticHelpers', () => ({
  homeSnapshotForEnabledCoverWarm: (snapshot: HomeFeedSnapshot) => snapshot,
  preserveDisabledHomeSections: (snapshot: HomeFeedSnapshot) => snapshot,
  reportCachedHomeDiagnostics: vi.fn(),
}));
vi.mock('@/app/startupSplash', () => ({ scheduleStartupSplashDismiss: vi.fn() }));

import Home from '@/features/home/pages/Home';
import { clearHomeFeedCache, readHomeFeedCache } from '@/features/home/store/homeFeedCache';
import { useHomeStore, DEFAULT_HOME_SECTIONS } from '@/features/home/store/homeStore';
import { useAuthStore } from '@/store/authStore';
import { useMigrationStore } from '@/store/migrationStore';
import { makeServer } from '@/test/helpers/factories';
import { resetAuthStore } from '@/test/helpers/storeReset';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => { resolve = res; });
  return { promise, resolve };
}

function snapshot(name: string): HomeFeedSnapshot {
  return {
    scopeKey: 'scope',
    scopeVersion: 1,
    savedAt: 1,
    offsets: {
      starred: { 'server-a': 0 },
      recent: { offset: 0, hasMore: false },
      random: { 'server-a': 0 },
      mostPlayed: { 'server-a': 0 },
      recentlyPlayed: { offset: 0, hasMore: false },
    },
    starred: [],
    recent: [],
    random: [],
    heroAlbums: [{
      id: name, name, artist: 'Artist', artistId: 'artist', songCount: 1, duration: 1,
    }],
    mostPlayed: [],
    recentlyPlayed: [],
    randomArtists: [],
    discoverSongs: [],
  };
}

describe('Home startup feed loading', () => {
  beforeEach(() => {
    resetAuthStore();
    clearHomeFeedCache();
    homeMocks.connection.status = 'checking';
    homeMocks.loadHomeFeedWithStatus.mockReset();
    homeMocks.loadHomeChronologicalFeed.mockReset();
    homeMocks.loadHomeChronologicalFeed.mockResolvedValue({
      status: 'success', albums: [], hasMore: false, durationMs: 0,
    });
    useMigrationStore.setState({ phase: 'idle' });
    useHomeStore.setState({ sections: DEFAULT_HOME_SECTIONS });
    const server = makeServer({ id: 'server-a' });
    useAuthStore.setState({
      servers: [server],
      activeServerId: server.id,
      libraryBrowseServerIds: [server.id],
      musicFoldersByServer: { [server.id]: [] },
      libraryBrowseSelectionByServer: { [server.id]: [] },
      libraryBrowseScopeVersion: 1,
    });
  });

  it('waits for migrations, retries on connection, and ignores invalidated loads', async () => {
    const beforeBlocked = deferred<{ snapshot: HomeFeedSnapshot; emptySnapshotReliable: boolean }>();
    const beforeConnected = deferred<{ snapshot: HomeFeedSnapshot; emptySnapshotReliable: boolean }>();
    const connected = deferred<{ snapshot: HomeFeedSnapshot; emptySnapshotReliable: boolean }>();
    homeMocks.loadHomeFeedWithStatus
      .mockReturnValueOnce(beforeBlocked.promise)
      .mockReturnValueOnce(beforeConnected.promise)
      .mockReturnValueOnce(connected.promise);

    const view = renderWithProviders(<Home />);
    expect(homeMocks.loadHomeFeedWithStatus).not.toHaveBeenCalled();

    await act(async () => {
      useMigrationStore.setState({ phase: 'completed' });
    });
    await waitFor(() => expect(homeMocks.loadHomeFeedWithStatus).toHaveBeenCalledTimes(1));

    await act(async () => {
      useMigrationStore.setState({ phase: 'inspecting' });
      beforeBlocked.resolve({ snapshot: snapshot('blocked-stale'), emptySnapshotReliable: true });
      await beforeBlocked.promise;
    });
    expect(readHomeFeedCache('scope', 1)).toBeNull();

    await act(async () => {
      useMigrationStore.setState({ phase: 'completed' });
    });
    await waitFor(() => expect(homeMocks.loadHomeFeedWithStatus).toHaveBeenCalledTimes(2));

    homeMocks.connection.status = 'connected';
    view.rerender(<Home />);
    await waitFor(() => expect(homeMocks.loadHomeFeedWithStatus).toHaveBeenCalledTimes(3));

    await act(async () => {
      beforeConnected.resolve({ snapshot: snapshot('connection-stale'), emptySnapshotReliable: true });
      await beforeConnected.promise;
    });
    expect(readHomeFeedCache('scope', 1)).toBeNull();

    await act(async () => {
      connected.resolve({ snapshot: snapshot('fresh'), emptySnapshotReliable: true });
      await connected.promise;
    });
    await waitFor(() => expect(readHomeFeedCache('scope', 1)?.heroAlbums[0]?.name).toBe('fresh'));
    expect(screen.getByTestId('home-hero')).toHaveTextContent('fresh');
  });
});
