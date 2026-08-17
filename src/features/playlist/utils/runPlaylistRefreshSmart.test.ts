import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlaylistMembershipStore } from '@/store/playlistMembershipStore';
import { runPlaylistRefreshSmart } from './runPlaylistRefreshSmart';

const ndGetPlaylistTracksMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/navidromeSmart', () => ({
  ndGetPlaylistTracks: ndGetPlaylistTracksMock,
}));

describe('runPlaylistRefreshSmart', () => {
  beforeEach(() => {
    ndGetPlaylistTracksMock.mockReset().mockResolvedValue([]);
    usePlaylistMembershipStore.getState().clearAllPlaylistSongIds();
  });

  it('forces evaluation, invalidates membership, and reloads the detail', async () => {
    const touchPlaylist = vi.fn();
    usePlaylistMembershipStore.getState().setPlaylistSongIds('smart-1', ['old'], 'server-a');

    await runPlaylistRefreshSmart({
      id: 'smart-1',
      serverId: 'server-a',
      touchPlaylist,
    });

    expect(ndGetPlaylistTracksMock).toHaveBeenCalledWith(
      'smart-1',
      'server-a',
      { start: 0, end: 1 },
    );
    expect(usePlaylistMembershipStore.getState()
      .getPlaylistSongIds('smart-1', 'server-a')).toBeUndefined();
    expect(touchPlaylist).toHaveBeenCalledWith('smart-1', 'server-a');
  });
});
