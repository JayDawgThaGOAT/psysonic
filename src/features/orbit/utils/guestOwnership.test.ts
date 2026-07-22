import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeInitialOrbitState } from '@/features/orbit/api/orbit';

const mocks = vi.hoisted(() => ({
  activeServerId: 'srv-other',
  setPhase: vi.fn(),
  setState: vi.fn(),
  findSessionPlaylistId: vi.fn(),
  readOrbitState: vi.fn(),
  writeOrbitHeartbeat: vi.fn(),
  getPlaylistsForServer: vi.fn(),
  createPlaylist: vi.fn(),
  deletePlaylist: vi.fn(),
  bindingRevision: 0,
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: {
    getState: () => ({
      activeServerId: mocks.activeServerId,
      servers: [
        { id: 'srv-owner', username: 'guest' },
        { id: 'srv-other', username: 'other' },
      ],
      getActiveServer: () => ({ id: mocks.activeServerId, username: 'other' }),
    }),
  },
}));
vi.mock('@/features/orbit/store/orbitStore', () => ({
  orbitBindingRevisionIsCurrent: (revision: number) => mocks.bindingRevision === revision,
  orbitBindingIsCurrent: ({ bindingRevision }: { bindingRevision: number }) => (
    mocks.bindingRevision === bindingRevision
  ),
  useOrbitStore: {
    getState: () => ({
      phase: 'idle',
      bindingRevision: mocks.bindingRevision,
      setPhase: mocks.setPhase,
    }),
    setState: mocks.setState,
  },
}));
vi.mock('@/features/orbit/utils/remote', () => ({
  findSessionPlaylistId: mocks.findSessionPlaylistId,
  readOrbitState: mocks.readOrbitState,
  writeOrbitHeartbeat: mocks.writeOrbitHeartbeat,
}));
vi.mock('@/lib/api/subsonicPlaylists', () => ({
  getPlaylistsForServer: mocks.getPlaylistsForServer,
  createPlaylist: mocks.createPlaylist,
  deletePlaylist: mocks.deletePlaylist,
  getPlaylistForServer: vi.fn(),
  addSongsToPlaylist: vi.fn(),
}));
vi.mock('@/store/playlistMembershipStore', () => ({
  usePlaylistMembershipStore: { getState: () => ({ setPlaylistSongIds: vi.fn() }) },
}));
vi.mock('@/features/playback/store/playerStore', () => ({ usePlayerStore: { getState: () => ({}) } }));
vi.mock('@/lib/api/subsonicLibrary', () => ({ getSongForServer: vi.fn() }));
vi.mock('@/lib/media/songToTrack', () => ({ songToTrack: vi.fn() }));

import { joinOrbitSession } from '@/features/orbit/utils/guest';

beforeEach(() => {
  mocks.activeServerId = 'srv-other';
  mocks.bindingRevision = 0;
  mocks.setPhase.mockReset();
  mocks.setState.mockReset();
  mocks.findSessionPlaylistId.mockReset().mockImplementation(async () => {
    mocks.activeServerId = 'srv-other';
    return 'session-playlist';
  });
  mocks.readOrbitState.mockReset().mockResolvedValue(
    makeInitialOrbitState({ sid: 'aaaa1111', host: 'host', name: 'Session' }),
  );
  mocks.writeOrbitHeartbeat.mockReset().mockResolvedValue(undefined);
  mocks.getPlaylistsForServer.mockReset().mockResolvedValue([]);
  mocks.createPlaylist.mockReset().mockResolvedValue({ id: 'outbox-playlist' });
  mocks.deletePlaylist.mockReset().mockResolvedValue(undefined);
});

describe('joinOrbitSession server ownership', () => {
  it('uses the requested owner instead of the active server for every join step', async () => {
    await joinOrbitSession('aaaa1111', 'srv-owner');

    expect(mocks.findSessionPlaylistId).toHaveBeenCalledWith('aaaa1111', 'srv-owner');
    expect(mocks.readOrbitState).toHaveBeenCalledWith('session-playlist', 'srv-owner');
    expect(mocks.getPlaylistsForServer).toHaveBeenCalledWith('srv-owner', true);
    expect(mocks.createPlaylist).toHaveBeenCalledWith(
      '__psyorbit_aaaa1111_from_guest__',
      undefined,
      'srv-owner',
    );
    expect(mocks.writeOrbitHeartbeat).toHaveBeenCalledWith(
      'outbox-playlist',
      '__psyorbit_aaaa1111_from_guest__',
      'srv-owner',
    );
    expect(mocks.setState).toHaveBeenCalledWith(expect.objectContaining({
      role: 'guest',
      serverId: 'srv-owner',
      phase: 'active',
    }));
  });

  it('does not bind after a server switch invalidates the joining generation', async () => {
    let resolveFind!: (value: string) => void;
    mocks.findSessionPlaylistId.mockReset().mockReturnValue(
      new Promise(resolve => { resolveFind = resolve; }),
    );

    const join = joinOrbitSession('bbbb2222', 'srv-owner');
    await vi.waitFor(() => expect(mocks.findSessionPlaylistId).toHaveBeenCalled());
    mocks.bindingRevision = 1;
    resolveFind('session-playlist');

    await expect(join).rejects.toThrow('Join superseded');
    expect(mocks.readOrbitState).not.toHaveBeenCalled();
    expect(mocks.setState).not.toHaveBeenCalled();
  });
});
