import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { useAuthStore } from '@/store/authStore';

const getMusicFoldersForServerMock = vi.fn();
const getMusicIndexesForServerMock = vi.fn();

vi.mock('@/lib/api/subsonicLibrary', () => ({
  getMusicFoldersForServer: (...args: unknown[]) => getMusicFoldersForServerMock(...args),
  getMusicIndexesForServer: (...args: unknown[]) => getMusicIndexesForServerMock(...args),
  getMusicDirectoryForServer: vi.fn(),
}));

vi.mock('@/features/playback/store/playerStore', () => ({
  usePlayerStore: (selector: (state: object) => unknown) => selector({
    currentTrack: null,
    isPlaying: false,
    playTrack: vi.fn(),
    openContextMenu: vi.fn(),
    contextMenu: { isOpen: false },
  }),
}));

vi.mock('@/features/folderBrowser/hooks/useFolderBrowserNowPlayingPath', () => ({
  useFolderBrowserNowPlayingPath: () => ({
    playingPathIds: [],
    setPlayingPathIds: vi.fn(),
    isSelectedPathForCurrentTrack: false,
  }),
}));

vi.mock('@/features/folderBrowser/hooks/useFolderBrowserKeyboardNav', () => ({
  useFolderBrowserKeyboardNav: () => () => undefined,
}));

import FolderBrowser from './FolderBrowser';

describe('FolderBrowser', () => {
  beforeEach(() => {
    getMusicFoldersForServerMock.mockReset();
    getMusicIndexesForServerMock.mockReset();
    useAuthStore.setState({
      servers: [
        { id: 'server-a', name: 'Alpha', url: 'https://alpha.example', username: 'u', password: 'p' },
        { id: 'server-b', name: 'Beta', url: 'https://beta.example', username: 'u', password: 'p' },
        { id: 'server-c', name: 'Gamma', url: 'https://gamma.example', username: 'u', password: 'p' },
      ],
      activeServerId: 'server-a',
      libraryBrowseServerIds: ['server-a', 'server-b'],
    });
    getMusicFoldersForServerMock.mockImplementation(async (serverId: string) => [
      { id: 'music', name: serverId === 'server-a' ? 'Library A' : 'Library B' },
    ]);
    getMusicIndexesForServerMock.mockResolvedValue([]);
  });

  it('shows folders from every connected server in the root column', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FolderBrowser />, { route: '/folders' });

    const alphaLibrary = await screen.findByRole('button', { name: 'Alpha - Library A' });
    expect(alphaLibrary).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Beta - Library B' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gamma - Library B' })).not.toBeInTheDocument();
    expect(getMusicFoldersForServerMock).toHaveBeenCalledWith('server-a');
    expect(getMusicFoldersForServerMock).toHaveBeenCalledWith('server-b');

    await user.click(alphaLibrary);
    expect(getMusicIndexesForServerMock).toHaveBeenCalledWith('server-a', 'music');
  });
});
