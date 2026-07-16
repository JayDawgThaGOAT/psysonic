import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAllStores } from '@/test/helpers/storeReset';
import { useAuthStore } from '@/store/authStore';
import { usePlayerStore } from '@/features/playback/store/playerStore';
import NowPlayingDropdown from './NowPlayingDropdown';

const { getNowPlayingForServersMock, coverScopes, navigateMock } = vi.hoisted(() => ({
  getNowPlayingForServersMock: vi.fn(),
  coverScopes: [] as unknown[],
  navigateMock: vi.fn(),
}));

vi.mock('react-router-dom', async importOriginal => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('@/lib/api/subsonicScrobble', () => ({
  getNowPlayingForServers: getNowPlayingForServersMock,
}));

vi.mock('@/cover/TrackCoverArtImage', () => ({
  TrackCoverArtImage: ({ serverScope }: { serverScope: unknown }) => {
    coverScopes.push(serverScope);
    return <div data-testid="cover" />;
  },
}));

function entry(serverId: string, id: string, username: string) {
  return {
    id,
    title: `Track ${id}`,
    artist: 'Artist',
    album: 'Album',
    albumId: `album-${id}`,
    coverArt: `cover-${id}`,
    duration: 180,
    username,
    minutesAgo: 0,
    playerId: 1,
    playerName: 'Web',
    serverId,
  };
}

beforeEach(() => {
  resetAllStores();
  coverScopes.length = 0;
  navigateMock.mockReset();
  getNowPlayingForServersMock.mockReset();
  useAuthStore.setState({
    servers: [
      { id: 'a', name: 'Alpha', url: 'http://a.test', username: 'owner-a', password: 'p' },
      { id: 'b', name: 'Beta', url: 'http://b.test', username: 'owner-b', password: 'p' },
    ],
    activeServerId: 'a',
    libraryBrowseServerIds: ['a', 'b'],
    isLoggedIn: true,
  });
  usePlayerStore.setState({ isPlaying: false, queueItems: [], queueServerId: null, queueIndex: 0 });
});

describe('NowPlayingDropdown multi-server scope', () => {
  it('renders listeners from every selected server with owner labels and cover scopes', async () => {
    getNowPlayingForServersMock.mockResolvedValue([
      entry('a', 'one', 'alice'),
      entry('b', 'two', 'bob'),
    ]);
    renderWithProviders(<NowPlayingDropdown />);

    fireEvent.click(screen.getByRole('button', { name: /Live/i }));
    expect(await screen.findByText('Track one')).toBeInTheDocument();
    expect(screen.getByText('Track two')).toBeInTheDocument();
    expect(screen.getByText(/alice \(Web\) · Alpha/)).toBeInTheDocument();
    expect(screen.getByText(/bob \(Web\) · Beta/)).toBeInTheDocument();
    expect(getNowPlayingForServersMock).toHaveBeenCalledWith(['a', 'b']);
    expect(coverScopes).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'server', serverId: 'a' }),
      expect.objectContaining({ kind: 'server', serverId: 'b' }),
    ]));
  });

  it('keeps the owning server in album navigation', async () => {
    getNowPlayingForServersMock.mockResolvedValue([entry('b', 'two', 'bob')]);
    renderWithProviders(<NowPlayingDropdown />);

    fireEvent.click(screen.getByRole('button', { name: /Live/i }));
    fireEvent.click(await screen.findByText('Track two'));
    expect(navigateMock).toHaveBeenCalledWith('/album/album-two?server=b');
  });

  it('refetches when the selected server scope changes', async () => {
    getNowPlayingForServersMock.mockResolvedValue([]);
    renderWithProviders(<NowPlayingDropdown />);
    await waitFor(() => expect(getNowPlayingForServersMock).toHaveBeenCalledWith(['a', 'b']));

    useAuthStore.setState({ libraryBrowseServerIds: ['b'] });
    await waitFor(() => expect(getNowPlayingForServersMock).toHaveBeenCalledWith(['b']));
  });

  it('drops stale own-account sessions from the previous playback server', async () => {
    getNowPlayingForServersMock.mockResolvedValue([
      entry('a', 'stale-local', 'owner-a'),
      entry('b', 'remote-client', 'owner-b'),
    ]);
    usePlayerStore.setState({
      isPlaying: true,
      queueItems: [
        { serverId: 'a', trackId: 'stale-local' },
        { serverId: 'b', trackId: 'remote-client' },
      ],
      queueServerId: 'a',
      queueIndex: 1,
    });
    renderWithProviders(<NowPlayingDropdown />);

    fireEvent.click(screen.getByRole('button', { name: /Live/i }));
    expect(await screen.findByText('Track remote-client')).toBeInTheDocument();
    expect(screen.queryByText('Track stale-local')).not.toBeInTheDocument();
  });

  it('drops stopped rows returned by a server', async () => {
    getNowPlayingForServersMock.mockResolvedValue([
      { ...entry('a', 'stopped', 'alice'), state: 'stopped' },
      entry('b', 'playing', 'bob'),
    ]);
    renderWithProviders(<NowPlayingDropdown />);

    fireEvent.click(screen.getByRole('button', { name: /Live/i }));
    expect(await screen.findByText('Track playing')).toBeInTheDocument();
    expect(screen.queryByText('Track stopped')).not.toBeInTheDocument();
  });
});
