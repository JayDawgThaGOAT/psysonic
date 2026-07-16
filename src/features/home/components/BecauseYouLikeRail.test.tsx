import { describe, expect, it } from 'vitest';
import type { SubsonicAlbum } from '@/lib/api/subsonicTypes';
import { buildAnchorPool } from '@/features/home/components/BecauseYouLikeRail';

function album(serverId: string | undefined, artistId: string, name: string): SubsonicAlbum {
  return {
    id: `${serverId ?? 'missing'}-${artistId}`,
    name: `${name} Album`,
    artist: name,
    artistId,
    songCount: 1,
    duration: 1,
    serverId,
  };
}

describe('buildAnchorPool', () => {
  it('keeps same-id artists from different owners and skips ownerless seeds', () => {
    const pool = buildAnchorPool([
      [album('srv-a', 'artist-1', 'Artist A'), album(undefined, 'artist-2', 'Ownerless')],
      [album('srv-b', 'artist-1', 'Artist B'), album('srv-a', 'artist-1', 'Duplicate')],
    ], 20);

    expect(pool).toEqual([
      { id: 'artist-1', name: 'Artist A', serverId: 'srv-a' },
      { id: 'artist-1', name: 'Artist B', serverId: 'srv-b' },
    ]);
  });
});
