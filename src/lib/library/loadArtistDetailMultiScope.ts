import {
  libraryScopeArtistDetail,
  type LibraryScopePair,
} from '@/lib/api/library/scopeReads';
import { albumToAlbum, artistToArtist, trackToSong } from '@/lib/library/advancedSearchLocal';
import type { SubsonicAlbum, SubsonicArtist, SubsonicSong } from '@/lib/api/subsonicTypes';

export interface ArtistDetailMultiScopePayload {
  artist: SubsonicArtist;
  albums: SubsonicAlbum[];
  topSongs: SubsonicSong[];
  topTracksServerId: string | null;
  topTracksFingerprint: string | null;
}

/**
 * Load priority-deduped artist detail across the user's selected libraries
 * (one or more). Returns null on IPC failure or when the merged artist anchor is missing.
 */
export async function tryLoadArtistDetailMultiScope(
  scopes: LibraryScopePair[],
  serverId: string,
  artistId: string,
  topTracksLimit: number | null = 5,
): Promise<ArtistDetailMultiScopePayload | null> {
  try {
    const response = await libraryScopeArtistDetail(serverId, {
      scopes,
      artistId,
      serverId,
      ...(topTracksLimit == null ? {} : { topTracksLimit }),
    });
    if (!response.artist?.id) return null;
    return {
      artist: artistToArtist(response.artist),
      albums: response.albums.map(albumToAlbum),
      topSongs: [...response.tracks.map(trackToSong)].sort(
        (a, b) => (b.playCount ?? 0) - (a.playCount ?? 0),
      ),
      topTracksServerId: response.topTracksServerId ?? null,
      topTracksFingerprint: response.topTracksFingerprint ?? null,
    };
  } catch {
    return null;
  }
}
