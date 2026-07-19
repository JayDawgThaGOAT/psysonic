import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  activeServer: { id: 'srv-owner', username: 'host' },
  createPlaylist: vi.fn(),
  deletePlaylist: vi.fn(),
  writeOrbitState: vi.fn(),
  writeOrbitHeartbeat: vi.fn(),
  setPhase: vi.fn(),
  setState: vi.fn(),
  phase: 'idle',
  bindingRevision: 0,
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: {
    getState: () => ({
      servers: [mocks.activeServer, { id: 'srv-other', username: 'other' }],
      getActiveServer: () => mocks.activeServer,
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
      phase: mocks.phase,
      bindingRevision: mocks.bindingRevision,
      setPhase: mocks.setPhase,
    }),
    setState: mocks.setState,
  },
}));
vi.mock('@/lib/api/subsonicPlaylists', () => ({
  createPlaylist: mocks.createPlaylist,
  deletePlaylist: mocks.deletePlaylist,
}));
vi.mock('@/features/orbit/utils/remote', () => ({
  writeOrbitState: mocks.writeOrbitState,
  writeOrbitHeartbeat: mocks.writeOrbitHeartbeat,
}));
vi.mock('@/features/orbit/utils/transitions', () => ({
  readOrbitTransitionSettings: () => ({ gaplessEnabled: true, crossfadeEnabled: false, crossfadeDuration: 0 }),
}));
vi.mock('@/features/playback/store/playerStore', () => ({ usePlayerStore: { getState: () => ({}) } }));
vi.mock('@/lib/api/subsonicLibrary', () => ({ getSongForServer: vi.fn() }));
vi.mock('@/lib/media/songToTrack', () => ({ songToTrack: vi.fn() }));

import { startOrbitSession } from '@/features/orbit/utils/host';

beforeEach(() => {
  mocks.phase = 'idle';
  mocks.bindingRevision = 0;
  mocks.activeServer.id = 'srv-owner';
  mocks.activeServer.username = 'host';
  mocks.createPlaylist.mockReset()
    .mockResolvedValueOnce({ id: 'session-playlist' })
    .mockResolvedValueOnce({ id: 'outbox-playlist' });
  mocks.deletePlaylist.mockReset().mockResolvedValue(undefined);
  mocks.writeOrbitState.mockReset().mockResolvedValue(undefined);
  mocks.writeOrbitHeartbeat.mockReset().mockResolvedValue(undefined);
  mocks.setPhase.mockReset();
  mocks.setState.mockReset();
});

describe('startOrbitSession server ownership', () => {
  it('pins every remote call to the requested server even if active state changes', async () => {
    mocks.createPlaylist.mockImplementationOnce(async () => {
      mocks.activeServer.id = 'srv-other';
      mocks.activeServer.username = 'other';
      return { id: 'session-playlist' };
    });

    await startOrbitSession({ name: 'Session', sid: 'aaaa1111', serverId: 'srv-owner' });

    expect(mocks.createPlaylist).toHaveBeenNthCalledWith(1, '__psyorbit_aaaa1111__', undefined, 'srv-owner');
    expect(mocks.createPlaylist).toHaveBeenNthCalledWith(2, '__psyorbit_aaaa1111_from_host__', undefined, 'srv-owner');
    expect(mocks.writeOrbitState).toHaveBeenCalledWith(
      'session-playlist',
      expect.objectContaining({ sid: 'aaaa1111', host: 'host' }),
      'srv-owner',
    );
    expect(mocks.writeOrbitHeartbeat).toHaveBeenCalledWith(
      'outbox-playlist',
      '__psyorbit_aaaa1111_from_host__',
      'srv-owner',
    );
    expect(mocks.setState).toHaveBeenCalledWith(expect.objectContaining({
      role: 'host',
      serverId: 'srv-owner',
      phase: 'active',
    }));
  });

  it('cleans up partial creation on the same captured owner', async () => {
    mocks.createPlaylist
      .mockReset()
      .mockResolvedValueOnce({ id: 'session-playlist' })
      .mockRejectedValueOnce(new Error('create failed'));

    await expect(startOrbitSession({ name: 'Session', sid: 'bbbb2222', serverId: 'srv-owner' }))
      .rejects.toThrow('create failed');
    expect(mocks.deletePlaylist).toHaveBeenCalledWith('session-playlist', 'srv-owner');
  });

  it('does not bind after a server switch invalidates the starting generation', async () => {
    let resolveCreate!: (value: { id: string }) => void;
    mocks.createPlaylist.mockReset().mockReturnValueOnce(
      new Promise(resolve => { resolveCreate = resolve; }),
    );

    const start = startOrbitSession({ name: 'Session', sid: 'cccc3333', serverId: 'srv-owner' });
    await vi.waitFor(() => expect(mocks.createPlaylist).toHaveBeenCalledTimes(1));
    mocks.bindingRevision = 1;
    resolveCreate({ id: 'session-playlist' });

    await expect(start).rejects.toThrow('Orbit start superseded');
    expect(mocks.createPlaylist).toHaveBeenCalledTimes(1);
    expect(mocks.setState).not.toHaveBeenCalled();
    expect(mocks.deletePlaylist).toHaveBeenCalledWith('session-playlist', 'srv-owner');
  });
});
