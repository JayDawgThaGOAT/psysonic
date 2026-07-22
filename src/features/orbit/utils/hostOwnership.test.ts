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
  activeServerId: 'srv-owner',
  libraryBrowseServerIds: ['srv-owner'] as string[],
  libraryBrowseScopeVersion: 0,
  switchActiveServer: vi.fn(),
  setLibraryBrowseServerExclusive: vi.fn(),
  retainQueueForServer: vi.fn(),
  clearQueue: vi.fn(),
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: {
    getState: () => ({
      servers: [mocks.activeServer, { id: 'srv-other', username: 'other' }],
      activeServerId: mocks.activeServerId,
      libraryBrowseServerIds: mocks.libraryBrowseServerIds,
      libraryBrowseScopeVersion: mocks.libraryBrowseScopeVersion,
      musicFoldersByServer: {},
      getActiveServer: () => mocks.activeServer,
      setLibraryBrowseServerExclusive: mocks.setLibraryBrowseServerExclusive,
    }),
    setState: (update: object | ((state: object) => object)) => {
      const current = {
        servers: [mocks.activeServer, { id: 'srv-other', username: 'other' }],
        activeServerId: mocks.activeServerId,
        libraryBrowseServerIds: mocks.libraryBrowseServerIds,
        libraryBrowseScopeVersion: mocks.libraryBrowseScopeVersion,
        musicFoldersByServer: {},
      };
      const next = (typeof update === 'function' ? update(current) : update) as {
        activeServerId?: string | null;
        libraryBrowseServerIds?: string[];
        libraryBrowseScopeVersion?: number;
      };
      if (next.activeServerId !== undefined) mocks.activeServerId = next.activeServerId ?? '';
      if (next.libraryBrowseServerIds) mocks.libraryBrowseServerIds = next.libraryBrowseServerIds;
      if (next.libraryBrowseScopeVersion !== undefined) {
        mocks.libraryBrowseScopeVersion = next.libraryBrowseScopeVersion;
      }
    },
  },
}));
vi.mock('@/utils/server/switchActiveServer', () => ({ switchActiveServer: mocks.switchActiveServer }));
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
vi.mock('@/features/playback/store/playerStore', () => ({
  usePlayerStore: {
    getState: () => ({
      retainQueueForServer: mocks.retainQueueForServer,
      clearQueue: mocks.clearQueue,
    }),
  },
}));
vi.mock('@/lib/api/subsonicLibrary', () => ({ getSongForServer: vi.fn() }));
vi.mock('@/lib/media/songToTrack', () => ({ songToTrack: vi.fn() }));

import { startOrbitSession } from '@/features/orbit/utils/host';

beforeEach(() => {
  mocks.phase = 'idle';
  mocks.bindingRevision = 0;
  mocks.activeServerId = 'srv-owner';
  mocks.libraryBrowseServerIds = ['srv-owner'];
  mocks.libraryBrowseScopeVersion = 0;
  mocks.activeServer.id = 'srv-owner';
  mocks.activeServer.username = 'host';
  mocks.switchActiveServer.mockReset().mockImplementation(async (server: { id: string }) => {
    mocks.activeServerId = server.id;
    return true;
  });
  mocks.setLibraryBrowseServerExclusive.mockReset().mockImplementation((serverId: string) => {
    mocks.libraryBrowseServerIds = [serverId];
  });
  mocks.retainQueueForServer.mockReset();
  mocks.clearQueue.mockReset();
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
    expect(mocks.retainQueueForServer).toHaveBeenCalledWith('srv-owner');
  });

  it('switches to a selected scoped server and records the scope to restore', async () => {
    mocks.activeServerId = 'srv-owner';
    mocks.libraryBrowseServerIds = ['srv-owner', 'srv-other'];

    await startOrbitSession({ name: 'Session', sid: 'dddd4444', serverId: 'srv-other' });

    expect(mocks.switchActiveServer).toHaveBeenCalledWith(expect.objectContaining({ id: 'srv-other' }));
    expect(mocks.setLibraryBrowseServerExclusive).toHaveBeenCalledWith('srv-other');
    expect(mocks.retainQueueForServer).toHaveBeenCalledWith('srv-other');
    expect(mocks.setState).toHaveBeenCalledWith(expect.objectContaining({
      serverId: 'srv-other',
      hostScopeSnapshot: {
        activeServerId: 'srv-owner',
        libraryBrowseServerIds: ['srv-owner', 'srv-other'],
      },
    }));
  });

  it('clears instead of pruning when the host requests an empty queue', async () => {
    await startOrbitSession({
      name: 'Session',
      sid: 'eeee5555',
      serverId: 'srv-owner',
      clearQueue: true,
    });

    expect(mocks.clearQueue).toHaveBeenCalledTimes(1);
    expect(mocks.retainQueueForServer).not.toHaveBeenCalled();
  });

  it('restores the previous active server and library scope when startup fails', async () => {
    mocks.libraryBrowseServerIds = ['srv-owner', 'srv-other'];
    mocks.createPlaylist.mockReset().mockRejectedValueOnce(new Error('create failed'));

    await expect(startOrbitSession({ name: 'Session', sid: 'ffff6666', serverId: 'srv-other' }))
      .rejects.toThrow('create failed');

    expect(mocks.activeServerId).toBe('srv-owner');
    expect(mocks.libraryBrowseServerIds).toEqual(['srv-owner', 'srv-other']);
    expect(mocks.setPhase).toHaveBeenLastCalledWith('idle');
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
