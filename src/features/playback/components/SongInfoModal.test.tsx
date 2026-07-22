import { beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';

const mocks = vi.hoisted(() => ({
  getSong: vi.fn(),
  getSongForServer: vi.fn(),
  libraryGetFacts: vi.fn(),
  ndGetSongPath: vi.fn(),
}));

vi.mock('@/lib/api/subsonicLibrary', () => ({
  getSong: mocks.getSong,
  getSongForServer: mocks.getSongForServer,
}));
vi.mock('@/lib/api/library', () => ({ libraryGetFacts: mocks.libraryGetFacts }));
vi.mock('@/lib/api/navidromeAdmin', () => ({ ndGetSongPath: mocks.ndGetSongPath }));
vi.mock('@/lib/library/libraryReady', () => ({ libraryIsReady: vi.fn(() => Promise.resolve(true)) }));
vi.mock('@/store/libraryIndexStore', () => ({
  useLibraryIndexStore: { getState: () => ({ isIndexEnabled: () => true }) },
}));

import SongInfoModal from './SongInfoModal';
import { resetAuthStore, resetPlayerStore } from '@/test/helpers/storeReset';
import { useAuthStore } from '@/store/authStore';
import { usePlayerStore } from '@/features/playback/store/playerStore';

describe('SongInfoModal server ownership', () => {
  beforeEach(() => {
    resetAuthStore();
    resetPlayerStore();
    Object.values(mocks).forEach(mock => mock.mockReset());
    useAuthStore.setState({
      activeServerId: 'srv-active',
      servers: [
        { id: 'srv-active', name: 'Active', url: 'https://active.test', username: 'a', password: 'p' },
        { id: 'srv-owner', name: 'Owner', url: 'https://owner.test', username: 'owner', password: 'secret' },
      ],
      subsonicServerIdentityByServer: {
        'srv-owner': { type: 'navidrome', serverVersion: '0.62.0', openSubsonic: true },
      },
    });
    mocks.getSongForServer.mockResolvedValue({
      id: 'shared',
      serverId: 'srv-owner',
      title: 'Owner Song',
      artist: 'Owner Artist',
      album: 'Owner Album',
      duration: 120,
    });
    mocks.libraryGetFacts.mockResolvedValue([]);
    mocks.ndGetSongPath.mockResolvedValue('/owner/music/song.flac');
  });

  it('loads metadata, local facts, and native path from the captured owner', async () => {
    usePlayerStore.getState().openSongInfo('shared', 'srv-owner');
    const view = renderWithProviders(<SongInfoModal />);

    expect(await view.findByText('Owner Song')).toBeInTheDocument();
    expect(mocks.getSongForServer).toHaveBeenCalledWith('srv-owner', 'shared');
    expect(mocks.getSong).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.libraryGetFacts).toHaveBeenCalledWith('srv-owner', 'shared'));
    expect(mocks.ndGetSongPath).toHaveBeenCalledWith(
      'https://owner.test',
      'owner',
      'secret',
      'shared',
    );
    expect(await view.findByText('/owner/music/song.flac')).toBeInTheDocument();
  });
});
