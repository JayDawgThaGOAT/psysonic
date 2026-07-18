import { describe, expect, it } from 'vitest';
import { toMini } from '@/features/miniPlayer/utils/miniPlayerHelpers';
import type { Track } from '@/lib/media/trackTypes';

describe('miniPlayerHelpers', () => {
  it('preserves track ownership and artist refs in the mini transport mapper', () => {
    const track: Track = {
      id: 'track-1',
      title: 'Track',
      artist: 'Primary',
      artists: [{ id: 'artist-1', name: 'Primary' }, { id: 'artist-2', name: 'Guest' }],
      artistId: 'artist-1',
      album: 'Album',
      albumId: 'album-1',
      duration: 120,
      serverId: 'srv-owner',
    };

    expect(toMini(track)).toEqual(expect.objectContaining({
      id: 'track-1',
      artistId: 'artist-1',
      serverId: 'srv-owner',
      artists: track.artists,
    }));
  });
});
