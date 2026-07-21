import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeInitialOrbitState } from '@/features/orbit/api/orbit';
import { useOrbitStore } from '@/features/orbit/store/orbitStore';

const mocks = vi.hoisted(() => ({
  writeOrbitState: vi.fn(),
  deletePlaylist: vi.fn(),
  authState: {
    servers: [
      { id: 'srv-old', url: 'https://old.example' },
      { id: 'srv-selected', url: 'https://selected.example' },
      { id: 'srv-new', url: 'https://new.example' },
    ],
    activeServerId: 'srv-selected' as string | null,
    libraryBrowseServerIds: ['srv-selected'] as string[],
    libraryBrowseScopeVersion: 0,
    musicFoldersByServer: {},
    musicFolders: [],
  },
}));

vi.mock('@/features/orbit/utils/remote', () => ({
  writeOrbitState: mocks.writeOrbitState,
  writeOrbitHeartbeat: vi.fn(),
}));
vi.mock('@/lib/api/subsonicPlaylists', () => ({
  createPlaylist: vi.fn(),
  deletePlaylist: mocks.deletePlaylist,
  getPlaylistForServer: vi.fn(),
  getPlaylistsForServer: vi.fn(),
  addSongsToPlaylist: vi.fn(),
}));
vi.mock('@/lib/api/subsonicLibrary', () => ({ getSongForServer: vi.fn() }));
vi.mock('@/lib/media/songToTrack', () => ({ songToTrack: vi.fn() }));
vi.mock('@/store/authStore', () => ({
  useAuthStore: {
    getState: () => mocks.authState,
    setState: (update: object | ((state: typeof mocks.authState) => object)) => {
      Object.assign(
        mocks.authState,
        typeof update === 'function' ? update(mocks.authState) : update,
      );
    },
  },
}));
vi.mock('@/utils/server/switchActiveServer', () => ({ switchActiveServer: vi.fn() }));
vi.mock('@/store/playlistMembershipStore', () => ({
  usePlaylistMembershipStore: { getState: () => ({ setPlaylistSongIds: vi.fn() }) },
}));
vi.mock('@/features/playback/store/playerStore', () => ({ usePlayerStore: { getState: () => ({}) } }));
vi.mock('@/features/orbit/utils/transitions', () => ({ readOrbitTransitionSettings: vi.fn() }));

import { endOrbitSession } from '@/features/orbit/utils/host';
import { leaveOrbitSession } from '@/features/orbit/utils/guest';

function bind(role: 'host' | 'guest', revision: number, serverId: string): void {
  useOrbitStore.setState({
    role,
    serverId,
    bindingRevision: revision,
    sessionId: `session-${revision}`,
    sessionPlaylistId: `session-pl-${revision}`,
    outboxPlaylistId: `outbox-pl-${revision}`,
    phase: 'active',
    state: makeInitialOrbitState({ sid: `aaaa111${revision}`, host: 'host', name: 'Session' }),
  });
}

beforeEach(() => {
  useOrbitStore.setState({
    role: null,
    serverId: null,
    bindingRevision: 0,
    sessionId: null,
    sessionPlaylistId: null,
    outboxPlaylistId: null,
    phase: 'idle',
    state: null,
    hostScopeSnapshot: null,
  });
  mocks.authState.activeServerId = 'srv-selected';
  mocks.authState.libraryBrowseServerIds = ['srv-selected'];
  mocks.authState.libraryBrowseScopeVersion = 0;
  mocks.writeOrbitState.mockReset().mockResolvedValue(undefined);
  mocks.deletePlaylist.mockReset().mockResolvedValue(undefined);
});

describe('Orbit teardown generations', () => {
  it('a late host teardown cannot reset a replacement session', async () => {
    let resolveWrite!: () => void;
    mocks.writeOrbitState.mockReturnValue(new Promise<void>(resolve => { resolveWrite = resolve; }));
    bind('host', 1, 'srv-old');

    const teardown = endOrbitSession();
    await vi.waitFor(() => expect(mocks.writeOrbitState).toHaveBeenCalled());
    useOrbitStore.getState().reset();
    bind('host', 2, 'srv-new');
    resolveWrite();
    await teardown;

    expect(useOrbitStore.getState()).toEqual(expect.objectContaining({
      role: 'host',
      serverId: 'srv-new',
      bindingRevision: 2,
    }));
  });

  it('a late guest teardown cannot reset a replacement session', async () => {
    let resolveDelete!: () => void;
    mocks.deletePlaylist.mockReturnValue(new Promise<void>(resolve => { resolveDelete = resolve; }));
    bind('guest', 1, 'srv-old');

    const teardown = leaveOrbitSession();
    await vi.waitFor(() => expect(mocks.deletePlaylist).toHaveBeenCalled());
    useOrbitStore.getState().reset();
    bind('guest', 2, 'srv-new');
    resolveDelete();
    await teardown;

    expect(useOrbitStore.getState()).toEqual(expect.objectContaining({
      role: 'guest',
      serverId: 'srv-new',
      bindingRevision: 2,
    }));
  });

  it('restores the host active server and library scope before returning to idle', async () => {
    bind('host', 1, 'srv-selected');
    useOrbitStore.setState({
      hostScopeSnapshot: {
        activeServerId: 'srv-old',
        libraryBrowseServerIds: ['srv-old', 'srv-selected'],
      },
    });

    await endOrbitSession();

    expect(mocks.authState.activeServerId).toBe('srv-old');
    expect(mocks.authState.libraryBrowseServerIds).toEqual(['srv-old', 'srv-selected']);
    expect(useOrbitStore.getState()).toEqual(expect.objectContaining({
      role: null,
      phase: 'idle',
      hostScopeSnapshot: null,
    }));
  });
});
