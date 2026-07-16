import { albumCoverRef } from '@/cover/ref';
import { coverServerScopeForServerId } from '@/cover/serverScope';
import type { LibraryCoverPrefetchBucket } from '@/cover/useLibraryCoverPrefetch';
import type { SubsonicAlbum, SubsonicArtist, SubsonicSong } from '@/lib/api/subsonicTypes';

export function groupHomeCoverPrefetchBuckets(
  buckets: LibraryCoverPrefetchBucket[],
): LibraryCoverPrefetchBucket[] {
  const grouped: LibraryCoverPrefetchBucket[] = [];
  for (const bucket of buckets) {
    if (bucket.refs?.length) {
      grouped.push(bucket);
      continue;
    }
    const byOwner = new Map<string, LibraryCoverPrefetchBucket>();
    const ownerBucket = (serverId?: string) => {
      const key = serverId?.trim() ?? '';
      let next = byOwner.get(key);
      if (!next) {
        next = {
          limit: bucket.limit,
          priority: bucket.priority,
          surface: bucket.surface,
          serverScope: coverServerScopeForServerId(key),
        };
        byOwner.set(key, next);
      }
      return next;
    };
    for (const album of bucket.albums ?? []) {
      const next = ownerBucket((album as SubsonicAlbum).serverId);
      next.albums = [...(next.albums ?? []), album];
    }
    for (const artist of bucket.artists ?? []) {
      const next = ownerBucket((artist as SubsonicArtist).serverId);
      next.artists = [...(next.artists ?? []), artist];
    }
    for (const song of bucket.songs ?? []) {
      const next = ownerBucket((song as SubsonicSong).serverId);
      next.songs = [...(next.songs ?? []), song];
    }
    grouped.push(...byOwner.values());
  }
  return grouped;
}

export function homeDiscoverCoverPrefetchBucket(
  songs: ReadonlyArray<Pick<SubsonicSong, 'albumId' | 'coverArt' | 'serverId'>>,
  limit = 16,
): LibraryCoverPrefetchBucket {
  return {
    refs: songs.flatMap(song => {
      const albumId = song.albumId?.trim();
      if (!albumId) return [];
      return [albumCoverRef(
        albumId,
        song.coverArt ?? albumId,
        coverServerScopeForServerId(song.serverId),
      )];
    }),
    limit,
    priority: 'middle',
  };
}

export function shouldOfferHomeLoadMore(hasMore: boolean): boolean {
  return hasMore;
}
