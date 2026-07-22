import { useEffect, useMemo } from 'react';
import type { SubsonicSong } from '@/lib/api/subsonicTypes';
import { COVER_ARTIST_TOP_TRACK_CSS_PX } from '@/cover/layoutSizes';
import { useLibraryCoverPrefetch } from '@/cover/useLibraryCoverPrefetch';
import {
  uniqueAlbumCoverSourcesFromSongs,
  warmUniqueAlbumCoversFromLibrary,
} from '@/cover/warmDiskPeek';
import { coverServerScopeForOwnerServerId } from '@/cover/serverScope';
import { COVER_SCOPE_ACTIVE, coverScopeKey, type CoverServerScope } from '@/cover/types';

const DEFAULT_LIMIT = 48;

type SongAlbumSource = Pick<SubsonicSong, 'albumId' | 'coverArt' | 'serverId'>;

/**
 * Standard cover pipeline warm for track-list surfaces: dedupe visible songs to
 * album ids, register library prefetch, peek disk tiers, and high-priority ensure
 * misses — same building blocks as album grids, without per-track mf-* fetch ids.
 */
export function useWarmTrackListAlbumCovers(
  songs: ReadonlyArray<SongAlbumSource>,
  displayCssPx: number = COVER_ARTIST_TOP_TRACK_CSS_PX,
  opts?: { enabled?: boolean; limit?: number },
): void {
  const enabled = opts?.enabled ?? true;
  const limit = opts?.limit ?? DEFAULT_LIMIT;

  const albums = useMemo(
    () => uniqueAlbumCoverSourcesFromSongs(songs, limit),
    [songs, limit],
  );
  const warmKey = useMemo(
    () => albums.map(album => `${album.serverId ?? ''}\u0001${album.albumId}\u0001${album.coverArt}`).join('\u0002'),
    [albums],
  );
  const prefetchBuckets = useMemo(() => {
    const grouped = new Map<string, {
      serverScope: CoverServerScope;
      albums: Array<{ id: string; coverArt: string }>;
    }>();
    for (const album of albums) {
      const serverScope = album.serverId
        ? coverServerScopeForOwnerServerId(album.serverId)
        : COVER_SCOPE_ACTIVE;
      const key = coverScopeKey(serverScope);
      const group = grouped.get(key) ?? { serverScope, albums: [] };
      group.albums.push({ id: album.albumId, coverArt: album.coverArt });
      grouped.set(key, group);
    }
    return [...grouped.values()].map(group => ({
      albums: group.albums,
      limit: group.albums.length,
      priority: 'high' as const,
      serverScope: group.serverScope,
    }));
  }, [albums]);

  useLibraryCoverPrefetch(
    prefetchBuckets,
    [warmKey, enabled],
  );

  useEffect(() => {
    if (!enabled || displayCssPx <= 0 || albums.length === 0) return;
    let cancelled = false;
    void warmUniqueAlbumCoversFromLibrary(albums, displayCssPx, 'dense').then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
    // albumIds content is keyed by `warmKey`; listing the array retriggers warm on
    // benign parent re-renders that rebuild the songs slice reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, warmKey, displayCssPx]);
}
