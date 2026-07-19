import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ownedEntityKey } from '@/lib/util/ownedEntityKey';
import type { SubsonicSong } from '@/lib/api/subsonicTypes';
import { useAlbumDetailSort } from './useAlbumDetailSort';

const song = (serverId: string, title: string): SubsonicSong => ({
  id: 'shared',
  serverId,
  title,
  artist: 'Artist',
  album: 'Album',
  albumId: 'album',
  duration: 100,
});

describe('useAlbumDetailSort owner identity', () => {
  it('sorts equal raw ids using owner-qualified favorite and rating state', () => {
    const a = song('srv-a', 'A');
    const b = song('srv-b', 'B');
    const { result, rerender } = renderHook(
      props => useAlbumDetailSort(props),
      {
        initialProps: {
          songs: [a, b],
          filterText: '',
          starredSongs: new Set([ownedEntityKey(b)]),
          ratings: { [ownedEntityKey(a)]: 5, [ownedEntityKey(b)]: 1 },
          userRatingOverrides: {},
        },
      },
    );

    act(() => result.current.handleSort('favorite'));
    expect(result.current.displayedSongs.map(item => item.serverId)).toEqual(['srv-a', 'srv-b']);

    rerender({
      songs: [a, b],
      filterText: '',
      starredSongs: new Set([ownedEntityKey(b)]),
      ratings: { [ownedEntityKey(a)]: 5, [ownedEntityKey(b)]: 1 },
      userRatingOverrides: {},
    });
    act(() => result.current.handleSort('rating'));
    expect(result.current.displayedSongs.map(item => item.serverId)).toEqual(['srv-b', 'srv-a']);
  });
});
