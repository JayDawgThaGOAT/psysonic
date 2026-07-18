import { beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';

const hoisted = vi.hoisted(() => ({
  playlistState: {
    playlists: [] as Array<{ id: string; name: string; serverId?: string }>,
    recentIds: [] as string[],
    createPlaylist: vi.fn(),
    touchPlaylist: vi.fn(),
    fetchPlaylistsForServer: vi.fn(async () => undefined),
  },
}));

vi.mock('@/features/playlist', () => ({
  usePlaylistStore: (selector: (state: typeof hoisted.playlistState) => unknown) =>
    selector(hoisted.playlistState),
  addTracksToPlaylistWithDedup: vi.fn(),
  showAddTracksDedupToast: vi.fn(),
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (state: { activeServerId: string }) => unknown) =>
    selector({ activeServerId: 'srv-a' }),
}));

import { AddToPlaylistSubmenu } from '@/features/contextMenu/components/AddToPlaylistSubmenu';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';

describe('AddToPlaylistSubmenu', () => {
  beforeEach(() => {
    hoisted.playlistState.playlists = [];
    hoisted.playlistState.fetchPlaylistsForServer.mockClear();
  });

  it('does not refetch repeatedly when an owner has no playlists', async () => {
    const view = renderWithProviders(
      <AddToPlaylistSubmenu songIds={['track-1']} serverId="srv-b" onDone={vi.fn()} />,
    );

    await waitFor(() => {
      expect(hoisted.playlistState.fetchPlaylistsForServer).toHaveBeenCalledTimes(1);
    });

    hoisted.playlistState.playlists = [];
    view.rerender(
      <AddToPlaylistSubmenu songIds={['track-1']} serverId="srv-b" onDone={vi.fn()} />,
    );

    await waitFor(() => {
      expect(hoisted.playlistState.fetchPlaylistsForServer).toHaveBeenCalledTimes(1);
    });
  });
});
