import { ndGetPlaylistTracks } from '@/lib/api/navidromeSmart';
import { usePlaylistMembershipStore } from '@/store/playlistMembershipStore';

interface RunPlaylistRefreshSmartDeps {
  id: string;
  serverId: string;
  touchPlaylist: (id: string, serverId?: string) => void;
}

/** Force Navidrome to re-evaluate one smart playlist, then trigger its detail reload. */
export async function runPlaylistRefreshSmart({
  id,
  serverId,
  touchPlaylist,
}: RunPlaylistRefreshSmartDeps): Promise<void> {
  // Navidrome refreshes smart membership when the native tracks request starts at zero.
  await ndGetPlaylistTracks(id, serverId, { start: 0, end: 1 });
  usePlaylistMembershipStore.getState().invalidatePlaylistSongIds(id, serverId);
  touchPlaylist(id, serverId);
}
