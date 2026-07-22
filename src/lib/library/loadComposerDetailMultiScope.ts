import {
  libraryScopeComposerDetail,
  type LibraryScopePair,
} from '@/lib/api/library/scopeReads';
import { albumToAlbum, artistToArtist } from '@/lib/library/advancedSearchLocal';
import type { SubsonicAlbum, SubsonicArtist } from '@/lib/api/subsonicTypes';

export interface ComposerDetailMultiScopePayload {
  composer: SubsonicArtist;
  albums: SubsonicAlbum[];
}

export async function tryLoadComposerDetailMultiScope(
  scopes: LibraryScopePair[],
  serverId: string,
  composerId: string,
): Promise<ComposerDetailMultiScopePayload | null> {
  try {
    const response = await libraryScopeComposerDetail(serverId, {
      scopes,
      composerId,
      serverId,
    });
    if (!response.composer?.id) return null;
    return {
      composer: artistToArtist(response.composer),
      albums: response.albums.map(albumToAlbum),
    };
  } catch {
    return null;
  }
}
