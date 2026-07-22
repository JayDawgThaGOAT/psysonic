import { describe, expect, it } from 'vitest';
import {
  uniqueAlbumCoverSourcesFromSongs,
  uniqueAlbumIdsFromSongs,
} from '@/cover/warmDiskPeek';

describe('uniqueAlbumIdsFromSongs', () => {
  it('dedupes by albumId and respects limit', () => {
    const ids = uniqueAlbumIdsFromSongs(
      [
        { albumId: 'a1' },
        { albumId: 'a1' },
        { albumId: 'a2' },
        { albumId: 'a3' },
      ],
      2,
    );
    expect(ids).toEqual(['a1', 'a2']);
  });

  it('skips empty album ids', () => {
    expect(uniqueAlbumIdsFromSongs([{ albumId: '' }, { albumId: '  ' }, { albumId: 'x' }])).toEqual(['x']);
  });
});

describe('uniqueAlbumCoverSourcesFromSongs', () => {
  it('preserves equal album ids owned by different servers', () => {
    expect(uniqueAlbumCoverSourcesFromSongs([
      { albumId: 'same', coverArt: 'cover-a', serverId: 'a' },
      { albumId: 'same', coverArt: 'cover-b', serverId: 'b' },
      { albumId: 'same', coverArt: 'duplicate-a', serverId: 'a' },
    ])).toEqual([
      { albumId: 'same', coverArt: 'cover-a', serverId: 'a' },
      { albumId: 'same', coverArt: 'cover-b', serverId: 'b' },
    ]);
  });
});
