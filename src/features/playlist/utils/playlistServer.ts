import type { SubsonicPlaylist } from '@/lib/api/subsonicTypes';
import { useAuthStore } from '@/store/authStore';

let playlistServerIntentGeneration = 0;

export async function runLatestPlaylistServerIntent(
  playlist: SubsonicPlaylist,
  action: () => void,
): Promise<void> {
  const generation = ++playlistServerIntentGeneration;
  const serverId = playlist.serverId;
  if (!serverId || !useAuthStore.getState().servers.some(server => server.id === serverId)) return;
  await Promise.resolve();
  if (generation === playlistServerIntentGeneration) action();
}

export function playlistDetailPath(playlist: SubsonicPlaylist): string {
  const query = playlist.serverId ? `?server=${encodeURIComponent(playlist.serverId)}` : '';
  return `/playlists/${playlist.id}${query}`;
}
