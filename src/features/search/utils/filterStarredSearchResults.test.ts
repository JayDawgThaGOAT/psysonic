import { describe, expect, it } from 'vitest';
import type { Results } from '@/features/search/searchBrowseTypes';
import { filterStarredSearchResults } from '@/features/search/utils/filterStarredSearchResults';

const results: Results = {
  artists: [],
  albums: [],
  songs: [
    { id: 'shared', serverId: 'srv-a', title: 'A', artist: 'A', album: 'A', albumId: 'a', duration: 1 },
    { id: 'shared', serverId: 'srv-b', title: 'B', artist: 'B', album: 'B', albumId: 'b', duration: 1 },
  ],
};

describe('filterStarredSearchResults', () => {
  it('keeps duplicate raw ids isolated by server owner', () => {
    const filtered = filterStarredSearchResults(results, {
      'srv-a:shared': true,
      'srv-b:shared': false,
    });

    expect(filtered.songs.map(song => song.serverId)).toEqual(['srv-a']);
  });
});
