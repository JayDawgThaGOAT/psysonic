import type { SubsonicAlbum, SubsonicArtist, SubsonicSong } from '@/lib/api/subsonicTypes';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Hero from '@/features/home/components/Hero';
import { AlbumRow } from '@/features/album';
import SongRail from '@/features/home/components/SongRail';
import BecauseYouLikeRail from '@/features/home/components/BecauseYouLikeRail';
import { LosslessAlbumsRail } from '@/features/album';
import { useTranslation } from 'react-i18next';
import { NavLink, useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useHomeStore } from '@/features/home/store/homeStore';
import { useAuthStore } from '@/store/authStore';
import {
  filterAlbumsByMixRatingsAcrossServers,
  getMixMinRatingsConfigFromAuth,
} from '@/features/playback/utils/mixRatingFilter';
import { usePerfProbeFlags } from '@/lib/perf/perfFlags';
import { bumpPerfCounter } from '@/lib/perf/perfTelemetry';
import { useLibraryCoverPrefetch } from '@/cover/useLibraryCoverPrefetch';
import { primeAlbumCoversForDisplay, warmHomeMainstageCovers } from '@/cover/warmDiskPeek';
import { readBecauseYouLikeCache } from '@/features/home/store/becauseYouLikeCache';
import {
  isHomeFeedSnapshotEmpty,
  readHomeFeedCache,
  readHomeFeedCacheStale,
  writeHomeFeedCache,
  type HomeFeedSnapshot,
} from '@/features/home/store/homeFeedCache';
import { useConnectionStatus } from '@/lib/hooks/useConnectionStatus';
import { useOfflineBrowseContext } from '@/features/offline';
import { useOfflineBrowseReloadToken } from '@/features/offline';
import { useDevOfflineBrowseStore } from '@/features/offline';
import { appendServerQuery } from '@/lib/navigation/detailServerScope';
import {
  deriveHomeFeedScope,
  loadHomeFeed,
  loadMoreHomeAlbums,
  type HomeAlbumSection,
} from '@/features/home/pages/homeFeedLoader';

/** Match Random Albums overshoot when mix filter uses album/artist axes so hero + discover row can still fill. */
const HOME_RANDOM_FETCH = 100;
const HOME_DISCOVER_SLICE = 20;
const HOME_ALBUM_ROW_ARTWORK_SIZE = 300;
const HOME_SONG_RAIL_ARTWORK_SIZE = 200;
const HOME_ARTWORK_WINDOWING = true;
// At least one viewport width of cards on first paint (low values left half the row as placeholders).
const HOME_ALBUM_ROW_INITIAL_ARTWORK_BUDGET = 14;
const HOME_SONG_RAIL_INITIAL_ARTWORK_BUDGET = 16;
const HOME_BECAUSE_CARD_COVER_CSS_PX = 160;
// Keep artwork enabled across Home rows in normal mode.
const HOME_ARTWORK_VISIBLE_ROW_BUDGET_WHEN_ENABLED = 8;

function getInitialHomeFeed(): HomeFeedSnapshot | null {
  const state = useAuthStore.getState();
  const { scopeKey } = deriveHomeFeedScope(state);
  if (!scopeKey) return null;
  return readHomeFeedCache(scopeKey, state.libraryBrowseScopeVersion)
    ?? readHomeFeedCacheStale(scopeKey);
}

export default function Home() {
  const perfFlags = usePerfProbeFlags();
  const homeAlbumRowsDisabled = perfFlags.disableMainstageRails || perfFlags.disableHomeAlbumRows;
  const homeSongRailsDisabled = perfFlags.disableMainstageRails || perfFlags.disableHomeSongRails;
  const homeRailArtworkDisabled = perfFlags.disableMainstageRailArtwork || perfFlags.disableHomeRailArtwork;
  const homeSections = useHomeStore(s => s.sections);
  const activeServerId = useAuthStore(s => s.activeServerId);
  const servers = useAuthStore(s => s.servers);
  const libraryBrowseServerIds = useAuthStore(s => s.libraryBrowseServerIds);
  const libraryBrowseSelectionByServer = useAuthStore(s => s.libraryBrowseSelectionByServer);
  const scopeVersion = useAuthStore(s => s.libraryBrowseScopeVersion);
  const { serverIds, scopeKey } = useMemo(() => deriveHomeFeedScope({
    servers,
    activeServerId,
    libraryBrowseServerIds,
    libraryBrowseSelectionByServer,
  }), [activeServerId, libraryBrowseSelectionByServer, libraryBrowseServerIds, servers]);
  const connStatus = useConnectionStatus().status;
  const devForceOffline = useDevOfflineBrowseStore(s => s.forceOffline);
  const offlineBrowseActive = useOfflineBrowseContext().active;
  const offlineBrowseReloadTs = useOfflineBrowseReloadToken();
  const isVisible = (id: string) => homeSections.find(s => s.id === id)?.visible ?? true;

  const [initialFeed] = useState(getInitialHomeFeed);
  const [starred, setStarred] = useState<SubsonicAlbum[]>(initialFeed?.starred ?? []);
  const [recent, setRecent] = useState<SubsonicAlbum[]>(initialFeed?.recent ?? []);
  const [random, setRandom] = useState<SubsonicAlbum[]>(initialFeed?.random ?? []);
  const [heroAlbums, setHeroAlbums] = useState<SubsonicAlbum[]>(initialFeed?.heroAlbums ?? []);
  const [mostPlayed, setMostPlayed] = useState<SubsonicAlbum[]>(initialFeed?.mostPlayed ?? []);
  const [recentlyPlayed, setRecentlyPlayed] = useState<SubsonicAlbum[]>(initialFeed?.recentlyPlayed ?? []);
  const [randomArtists, setRandomArtists] = useState<SubsonicArtist[]>(initialFeed?.randomArtists ?? []);
  const [discoverSongs, setDiscoverSongs] = useState<SubsonicSong[]>(initialFeed?.discoverSongs ?? []);
  const [loading, setLoading] = useState(initialFeed == null);
  const displayedSnapshotRef = useRef<HomeFeedSnapshot | null>(initialFeed);

  const applyFeedSnapshot = (snap: HomeFeedSnapshot) => {
    displayedSnapshotRef.current = snap;
    setStarred(snap.starred);
    setRecent(snap.recent);
    setRandom(snap.random);
    setHeroAlbums(snap.heroAlbums);
    setMostPlayed(snap.mostPlayed);
    setRecentlyPlayed(snap.recentlyPlayed);
    setRandomArtists(snap.randomArtists);
    setDiscoverSongs(snap.discoverSongs);
  };

  useEffect(() => {
    bumpPerfCounter('homeCommits');
  });

  useLibraryCoverPrefetch(
    [
      { albums: heroAlbums, priority: 'high' },
      { albums: recent, priority: 'high' },
      {
        albums: [...random, ...mostPlayed, ...recentlyPlayed, ...starred],
        artists: randomArtists,
        limit: 24,
        priority: 'low',
      },
      { songs: discoverSongs, limit: 16, priority: 'middle' },
    ],
    [heroAlbums, recent, random, mostPlayed, recentlyPlayed, starred, randomArtists, discoverSongs],
  );

  useEffect(() => {
    if (serverIds.length === 0 || !scopeKey) return;
    let cancelled = false;
    const fetchFreshHomeFeed = async (): Promise<HomeFeedSnapshot | null> => {
      const mixCfg = getMixMinRatingsConfigFromAuth();
      const albumMix =
        mixCfg.enabled && (mixCfg.minAlbum > 0 || mixCfg.minArtist > 0);
      const randomSize = albumMix ? HOME_RANDOM_FETCH : HOME_DISCOVER_SLICE;
      return loadHomeFeed({
        serverIds,
        scopeKey,
        scopeVersion,
        randomSize,
        showArtists: isVisible('discoverArtists'),
        showSongs: isVisible('discoverSongs'),
        mixConfig: mixCfg,
        deps: { filterAlbumsByMixRatingsAcrossServers },
      });
    };

    const cached = readHomeFeedCache(scopeKey, scopeVersion)
      ?? (offlineBrowseActive ? readHomeFeedCacheStale(scopeKey) : null);
    if (cached) {
      if (displayedSnapshotRef.current !== cached) applyFeedSnapshot(cached);
      // React Compiler set-state-in-effect rule: cache synchronization within this effect.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      void warmHomeMainstageCovers(cached);
      const becauseSnap = readBecauseYouLikeCache(scopeKey, scopeVersion);
      void primeAlbumCoversForDisplay(becauseSnap?.recs ?? [], HOME_BECAUSE_CARD_COVER_CSS_PX, {
        limit: 6,
      });
      // Keep the current visit visually stable, but prepare fresh data so the
      // next re-enter opens with a newer snapshot immediately.
      if (!offlineBrowseActive) {
        void (async () => {
          try {
            const fresh = await fetchFreshHomeFeed();
            if (!fresh || cancelled || isHomeFeedSnapshotEmpty(fresh)) return;
            if (displayedSnapshotRef.current !== cached) return;
            writeHomeFeedCache(fresh);
            void warmHomeMainstageCovers(fresh);
          } catch {
            /* ignore */
          }
        })();
      }
      return () => {
        cancelled = true;
      };
    }

    const stale = offlineBrowseActive ? readHomeFeedCacheStale(scopeKey) : null;
    if (stale) {
      applyFeedSnapshot(stale);
      setLoading(false);
      return () => { cancelled = true; };
    }

    setLoading(true);
    (async () => {
      try {
        const snap = await fetchFreshHomeFeed();
        if (!snap) return;
        if (cancelled) return;
        if (offlineBrowseActive && isHomeFeedSnapshotEmpty(snap)) return;
        writeHomeFeedCache(snap);
        applyFeedSnapshot(snap);
        if (!cancelled) setLoading(false);
        void warmHomeMainstageCovers(snap);
        const becauseSnap = readBecauseYouLikeCache(scopeKey, scopeVersion);
        void primeAlbumCoversForDisplay(becauseSnap?.recs ?? [], HOME_BECAUSE_CARD_COVER_CSS_PX, {
          limit: 6,
        });
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    scopeKey,
    scopeVersion,
    homeSections,
    offlineBrowseActive,
    offlineBrowseReloadTs,
  ]);

  /** When offline toggles without a library-filter bump, re-apply stale cache if the feed was cleared. */
  useEffect(() => {
    if (!scopeKey || !offlineBrowseActive) return;
    const stale = readHomeFeedCacheStale(scopeKey);
    if (!stale || isHomeFeedSnapshotEmpty(stale)) return;
    if (recent.length > 0 || random.length > 0 || heroAlbums.length > 0) return;
    // React Compiler set-state-in-effect rule: state set from an async result resolved in this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    applyFeedSnapshot(stale);
    setLoading(false);
  }, [scopeKey, connStatus, devForceOffline, offlineBrowseActive]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = async (section: HomeAlbumSection) => {
    const current = displayedSnapshotRef.current;
    if (!current) return;
    try {
      const next = await loadMoreHomeAlbums({
        snapshot: current,
        section,
        mixConfig: getMixMinRatingsConfigFromAuth(),
        deps: { filterAlbumsByMixRatingsAcrossServers },
      });
      writeHomeFeedCache(next);
      applyFeedSnapshot(next);
    } catch (e) {
      console.error('Failed to load more', e);
    }
  };

  const { t } = useTranslation();
  const navigate = useNavigate();
  let artworkRowsLeft = homeRailArtworkDisabled ? 0 : HOME_ARTWORK_VISIBLE_ROW_BUDGET_WHEN_ENABLED;
  const reserveArtworkRow = () => {
    if (artworkRowsLeft <= 0) return false;
    artworkRowsLeft -= 1;
    return true;
  };
  const recentArtworkEnabled =
    !homeRailArtworkDisabled &&
    !homeAlbumRowsDisabled &&
    isVisible('recent') &&
    recent.length > 0 &&
    reserveArtworkRow();
  const discoverArtworkEnabled =
    !homeRailArtworkDisabled &&
    !homeAlbumRowsDisabled &&
    isVisible('discover') &&
    random.length > 0 &&
    reserveArtworkRow();
  const discoverSongsArtworkEnabled =
    !homeRailArtworkDisabled &&
    !homeSongRailsDisabled &&
    isVisible('discoverSongs') &&
    discoverSongs.length > 0 &&
    reserveArtworkRow();
  const recentlyPlayedArtworkEnabled =
    !homeRailArtworkDisabled &&
    !homeAlbumRowsDisabled &&
    isVisible('recentlyPlayed') &&
    recentlyPlayed.length > 0 &&
    reserveArtworkRow();
  const starredArtworkEnabled =
    !homeRailArtworkDisabled &&
    !homeAlbumRowsDisabled &&
    isVisible('starred') &&
    starred.length > 0 &&
    reserveArtworkRow();
  const mostPlayedArtworkEnabled =
    !homeRailArtworkDisabled &&
    !homeAlbumRowsDisabled &&
    isVisible('mostPlayed') &&
    mostPlayed.length > 0 &&
    reserveArtworkRow();
  const becauseYouLikeHasSeed =
    mostPlayed.length > 0 || recentlyPlayed.length > 0 || starred.length > 0;
  const becauseYouLikeArtworkEnabled =
    !homeRailArtworkDisabled &&
    !homeAlbumRowsDisabled &&
    isVisible('becauseYouLike') &&
    becauseYouLikeHasSeed &&
    reserveArtworkRow();
  const losslessAlbumsArtworkEnabled =
    !homeRailArtworkDisabled &&
    !homeAlbumRowsDisabled &&
    isVisible('losslessAlbums') &&
    reserveArtworkRow();

  const homeLiteArtworkFx = perfFlags.disableHomeArtworkFx;
  const homeFlatArtworkClip = perfFlags.disableHomeArtworkClip;
  // Treat the library as empty when every album endpoint returned zero. The
  // song/artist rails can be empty for non-empty libraries (rare server quirks),
  // so they don't count toward this signal.
  const libraryEmpty =
    !loading &&
    recent.length === 0 &&
    random.length === 0 &&
    mostPlayed.length === 0 &&
    recentlyPlayed.length === 0 &&
    starred.length === 0;
  // Every section toggled off in Settings → Personalisation → Mainstage. The
  // page would otherwise be entirely blank, so surface a guided empty state
  // pointing back at the toggles (or the option to hide Mainstage from the
  // sidebar) instead of leaving the user on nothing.
  const allSectionsHidden = homeSections.every(s => !s.visible);
  return (
    <div
      className={[
        homeLiteArtworkFx ? 'home-lite-artwork' : '',
        homeFlatArtworkClip ? 'home-flat-artwork-clip' : '',
      ].filter(Boolean).join(' ') || undefined}
    >
      {!loading && !perfFlags.disableMainstageHero && isVisible('hero') && <Hero albums={heroAlbums} />}

      <div className="content-body" style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
            <div className="spinner" />
          </div>
        ) : allSectionsHidden ? (
          <div className="empty-state" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>
              {t('home.mainstageEmptyTitle')}
            </div>
            <div style={{ maxWidth: 460 }}>{t('home.mainstageEmptyBody')}</div>
            <button
              type="button"
              className="btn btn-primary"
              style={{ marginTop: '0.5rem' }}
              onClick={() => navigate('/settings', { state: { tab: 'personalisation' } })}
            >
              {t('home.mainstageEmptyCta')}
            </button>
          </div>
        ) : libraryEmpty ? (
          <div className="empty-state" style={{ padding: '4rem 1rem', textAlign: 'center' }}>
            {t('common.libraryEmpty')}
          </div>
        ) : (
          <>
            {!homeAlbumRowsDisabled && isVisible('recent') && (
              <AlbumRow
                title={t('sidebar.newReleases')}
                titleLink="/new-releases"
                albums={recent}
                onLoadMore={() => loadMore('recent')}
                moreText={t('home.loadMore')}
                disableArtwork={!recentArtworkEnabled}
                artworkSize={HOME_ALBUM_ROW_ARTWORK_SIZE}
                windowArtworkByViewport={HOME_ARTWORK_WINDOWING}
                initialArtworkBudget={HOME_ALBUM_ROW_INITIAL_ARTWORK_BUDGET}
              />
            )}
            {!homeAlbumRowsDisabled && isVisible('becauseYouLike') && becauseYouLikeHasSeed && (
              <BecauseYouLikeRail
                mostPlayed={mostPlayed}
                recentlyPlayed={recentlyPlayed}
                starred={starred}
                scopeKey={scopeKey}
                scopeVersion={scopeVersion}
                disableArtwork={!becauseYouLikeArtworkEnabled}
              />
            )}
            {!homeAlbumRowsDisabled && isVisible('discover') && (
              <AlbumRow
                title={t('home.discover')}
                titleLink="/random/albums"
                albums={random}
                onLoadMore={() => loadMore('random')}
                moreText={t('home.discoverMore')}
                disableArtwork={!discoverArtworkEnabled}
                artworkSize={HOME_ALBUM_ROW_ARTWORK_SIZE}
                windowArtworkByViewport={HOME_ARTWORK_WINDOWING}
                initialArtworkBudget={HOME_ALBUM_ROW_INITIAL_ARTWORK_BUDGET}
              />
            )}
            {!homeSongRailsDisabled && isVisible('discoverSongs') && discoverSongs.length > 0 && (
              <SongRail
                title={t('home.discoverSongs')}
                songs={discoverSongs}
                disableArtwork={!discoverSongsArtworkEnabled}
                artworkSize={HOME_SONG_RAIL_ARTWORK_SIZE}
                windowArtworkByViewport={HOME_ARTWORK_WINDOWING}
                initialArtworkBudget={HOME_SONG_RAIL_INITIAL_ARTWORK_BUDGET}
              />
            )}
            {!perfFlags.disableMainstageGridCards && isVisible('discoverArtists') && randomArtists.length > 0 && (
              <section className="album-row-section">
                <div className="album-row-header">
                  <NavLink to="/artists" className="section-title-link" style={{ marginBottom: 0 }}>
                    {t('home.discoverArtists')}<ChevronRight size={18} className="section-title-chevron" />
                  </NavLink>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {randomArtists.map(a => (
                    <button
                      key={`${a.serverId ?? ''}:${a.id}`}
                      className="artist-ext-link"
                      onClick={() => {
                        const query = appendServerQuery(undefined, a.serverId);
                        navigate(`/artist/${a.id}${query ? `?${query}` : ''}`);
                      }}
                    >
                      {a.name}
                    </button>
                  ))}
                  <button className="artist-ext-link" onClick={() => navigate('/artists')}
                    style={{ opacity: 0.6 }}>
                    {t('home.discoverArtistsMore')} →
                  </button>
                </div>
              </section>
            )}
            {!homeAlbumRowsDisabled && isVisible('recentlyPlayed') && recentlyPlayed.length > 0 && (
              <AlbumRow
                title={t('home.recentlyPlayed')}
                albums={recentlyPlayed}
                onLoadMore={() => loadMore('recentlyPlayed')}
                moreText={t('home.loadMore')}
                disableArtwork={!recentlyPlayedArtworkEnabled}
                artworkSize={HOME_ALBUM_ROW_ARTWORK_SIZE}
                windowArtworkByViewport={HOME_ARTWORK_WINDOWING}
                initialArtworkBudget={HOME_ALBUM_ROW_INITIAL_ARTWORK_BUDGET}
              />
            )}
            {!homeAlbumRowsDisabled && isVisible('starred') && starred.length > 0 && (
              <AlbumRow
                title={t('home.starred')}
                titleLink="/favorites"
                albums={starred}
                onLoadMore={() => loadMore('starred')}
                moreText={t('home.loadMore')}
                disableArtwork={!starredArtworkEnabled}
                artworkSize={HOME_ALBUM_ROW_ARTWORK_SIZE}
                windowArtworkByViewport={HOME_ARTWORK_WINDOWING}
                initialArtworkBudget={HOME_ALBUM_ROW_INITIAL_ARTWORK_BUDGET}
              />
            )}
            {!homeAlbumRowsDisabled && isVisible('mostPlayed') && (
              <AlbumRow
                title={t('home.mostPlayed')}
                titleLink="/most-played"
                albums={mostPlayed}
                onLoadMore={() => loadMore('mostPlayed')}
                moreText={t('home.loadMore')}
                disableArtwork={!mostPlayedArtworkEnabled}
                artworkSize={HOME_ALBUM_ROW_ARTWORK_SIZE}
                windowArtworkByViewport={HOME_ARTWORK_WINDOWING}
                initialArtworkBudget={HOME_ALBUM_ROW_INITIAL_ARTWORK_BUDGET}
              />
            )}
            {!homeAlbumRowsDisabled && isVisible('losslessAlbums') && (
              <LosslessAlbumsRail
                serverIds={serverIds}
                scopeVersion={scopeVersion}
                disableArtwork={!losslessAlbumsArtworkEnabled}
                artworkSize={HOME_ALBUM_ROW_ARTWORK_SIZE}
                windowArtworkByViewport={HOME_ARTWORK_WINDOWING}
                initialArtworkBudget={HOME_ALBUM_ROW_INITIAL_ARTWORK_BUDGET}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
