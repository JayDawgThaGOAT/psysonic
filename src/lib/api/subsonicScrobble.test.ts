import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/store/authStore';
import { usePlayerStore } from '@/features/playback/store/playerStore';
import {
  getNowPlayingForServer,
  getNowPlayingForServers,
  reportNowPlaying,
  scrobbleSong,
} from '@/lib/api/subsonicScrobble';
import { shouldAttemptSubsonicForServer } from '@/lib/network/subsonicNetworkGuard';

const { apiForServerMock } = vi.hoisted(() => ({
  apiForServerMock: vi.fn(async (
    _serverId?: string,
    _endpoint?: string,
    _params?: Record<string, unknown>,
  ): Promise<unknown> => ({})),
}));

vi.mock('@/lib/api/subsonicClient', () => ({
  api: vi.fn(),
  apiForServer: apiForServerMock,
}));
vi.mock('@/lib/network/subsonicNetworkGuard', () => ({
  shouldAttemptSubsonicForServer: vi.fn(() => true),
}));

describe('subsonicScrobble', () => {
  beforeEach(() => {
    apiForServerMock.mockClear();
    vi.mocked(shouldAttemptSubsonicForServer).mockImplementation(() => true);
    useAuthStore.setState({
      servers: [
        { id: 'a', name: 'A', url: 'http://a.test', username: 'u', password: 'p' },
        { id: 'b', name: 'B', url: 'http://b.test', username: 'u', password: 'p' },
      ],
      activeServerId: 'b',
      isLoggedIn: true,
    });
    usePlayerStore.setState({
      queueItems: [{ serverId: 'a', trackId: 't1' }],
      queueServerId: 'a',
      queueIndex: 0,
    });
  });

  it('scrobbleSong targets the queue server when active server differs', async () => {
    await scrobbleSong('t1', 1_700_000_000_000, 'a');
    expect(apiForServerMock).toHaveBeenCalledWith(
      'a',
      'scrobble.view',
      expect.objectContaining({ id: 't1', submission: true, time: 1_700_000_000_000 }),
    );
  });

  it('reportNowPlaying and scrobbleSong use the presence guard without trackId', async () => {
    vi.mocked(shouldAttemptSubsonicForServer).mockImplementation(
      (_serverId: string, trackId?: string) => trackId === undefined,
    );

    await reportNowPlaying('t-local', 'a');
    await scrobbleSong('t-local', 1_700_000_000_000, 'a');

    expect(shouldAttemptSubsonicForServer).toHaveBeenCalledWith('a');
    expect(shouldAttemptSubsonicForServer).not.toHaveBeenCalledWith('a', expect.anything());
    expect(apiForServerMock).toHaveBeenCalledTimes(2);
    expect(apiForServerMock).toHaveBeenNthCalledWith(
      1,
      'a',
      'scrobble.view',
      expect.objectContaining({ id: 't-local', submission: false }),
    );
    expect(apiForServerMock).toHaveBeenNthCalledWith(
      2,
      'a',
      'scrobble.view',
      expect.objectContaining({ id: 't-local', submission: true }),
    );
  });

  it('annotates now-playing entries with their owning server', async () => {
    apiForServerMock.mockResolvedValueOnce({
      nowPlaying: { entry: { id: 't1', title: 'One', username: 'alice' } },
    });
    await expect(getNowPlayingForServer('a')).resolves.toEqual([
      expect.objectContaining({ id: 't1', username: 'alice', serverId: 'a' }),
    ]);
  });

  it('aggregates selected servers in scope order and tolerates partial failure', async () => {
    apiForServerMock.mockImplementation(async (serverId?: string) => {
      if (serverId === 'b') throw new Error('offline');
      return { nowPlaying: { entry: [{ id: `${serverId}-1`, title: serverId, username: 'listener' }] } };
    });

    await expect(getNowPlayingForServers(['a', 'b', 'a'])).resolves.toEqual([
      expect.objectContaining({ id: 'a-1', serverId: 'a' }),
    ]);
    expect(apiForServerMock).toHaveBeenCalledTimes(2);
  });
});
