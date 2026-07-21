import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ORBIT_PLAYLIST_PREFIX,
  makeInitialOrbitState,
  orbitOutboxPlaylistName,
  orbitSessionPlaylistName,
  type OrbitState,
} from '@/features/orbit/api/orbit';
import { ORBIT_ORPHAN_TTL_MS } from '@/features/orbit/utils/constants';

const { getPlaylistsForServer, deletePlaylist } = vi.hoisted(() => ({
  getPlaylistsForServer: vi.fn(),
  deletePlaylist: vi.fn(),
}));

const { authState, orbitState } = vi.hoisted(() => ({
  authState: {
    servers: [{ id: 'srv-owner', username: 'me' }] as Array<{ id: string; username?: string }>,
  },
  orbitState: { sessionId: null as string | null, serverId: 'srv-owner' as string | null },
}));

vi.mock('@/lib/api/subsonicPlaylists', () => ({ getPlaylistsForServer, deletePlaylist }));
vi.mock('@/store/authStore', () => ({
  useAuthStore: {
    getState: () => ({
      servers: authState.servers,
    }),
  },
}));
vi.mock('@/features/orbit/store/orbitStore', () => ({
  useOrbitStore: { getState: () => orbitState },
}));

import { cleanupOrphanedOrbitPlaylists } from '@/features/orbit/utils/cleanup';

type FakePlaylist = {
  id: string;
  name: string;
  owner?: string;
  comment?: string;
  changed?: string;
};

/** A session-playlist comment whose heartbeat (`positionAt`) is `ageMs` old. */
function sessionComment(sid: string, ageMs: number, ended = false): string {
  const state: OrbitState = makeInitialOrbitState({ sid, host: 'me', name: 'sesh' });
  state.positionAt = Date.now() - ageMs;
  if (ended) state.ended = true;
  return JSON.stringify(state);
}

/** An outbox comment whose heartbeat `ts` is `ageMs` old. */
function outboxComment(ageMs: number): string {
  return JSON.stringify({ ts: Date.now() - ageMs });
}

beforeEach(() => {
  authState.servers = [{ id: 'srv-owner', username: 'me' }];
  orbitState.sessionId = null;
  orbitState.serverId = 'srv-owner';
  deletePlaylist.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  getPlaylistsForServer.mockReset();
});

async function runWith(playlists: FakePlaylist[]): Promise<string[]> {
  getPlaylistsForServer.mockResolvedValue(playlists);
  await cleanupOrphanedOrbitPlaylists();
  expect(getPlaylistsForServer).toHaveBeenCalledWith('srv-owner', true);
  for (const call of deletePlaylist.mock.calls) expect(call[1]).toBe('srv-owner');
  return deletePlaylist.mock.calls.map(c => c[0] as string);
}

describe('cleanupOrphanedOrbitPlaylists', () => {
  it('keeps a fresh session playlist from another device (regression for the regex bug)', async () => {
    const sid = 'aaaa1111';
    const deleted = await runWith([
      { id: 'p1', name: orbitSessionPlaylistName(sid), owner: 'me', comment: sessionComment(sid, 1_000) },
    ]);
    expect(deleted).toEqual([]);
  });

  it('deletes a stale session playlist past the orphan TTL', async () => {
    const sid = 'bbbb2222';
    const deleted = await runWith([
      {
        id: 'p2',
        name: orbitSessionPlaylistName(sid),
        owner: 'me',
        comment: sessionComment(sid, ORBIT_ORPHAN_TTL_MS + 60_000),
      },
    ]);
    expect(deleted).toEqual(['p2']);
  });

  it('deletes a session the host explicitly ended even when fresh', async () => {
    const sid = 'cccc3333';
    const deleted = await runWith([
      {
        id: 'p3',
        name: orbitSessionPlaylistName(sid),
        owner: 'me',
        comment: sessionComment(sid, 1_000, /* ended */ true),
      },
    ]);
    expect(deleted).toEqual(['p3']);
  });

  it('never touches this device\'s current session', async () => {
    const sid = 'dddd4444';
    orbitState.sessionId = sid;
    const deleted = await runWith([
      // Stale heartbeat, but it's *our* live session → must be skipped.
      {
        id: 'p4',
        name: orbitSessionPlaylistName(sid),
        owner: 'me',
        comment: sessionComment(sid, ORBIT_ORPHAN_TTL_MS + 60_000),
      },
    ]);
    expect(deleted).toEqual([]);
  });

  it('does not protect a same-id session on a different server', async () => {
    const sid = 'dddd4444';
    orbitState.sessionId = sid;
    orbitState.serverId = 'srv-other';
    const deleted = await runWith([
      {
        id: 'p4',
        name: orbitSessionPlaylistName(sid),
        owner: 'me',
        comment: sessionComment(sid, ORBIT_ORPHAN_TTL_MS + 60_000),
      },
    ]);
    expect(deleted).toEqual(['p4']);
  });

  it('keeps a fresh outbox but prunes a stale one', async () => {
    const sid = 'eeee5555';
    const deleted = await runWith([
      { id: 'fresh', name: orbitOutboxPlaylistName(sid, 'bob'), owner: 'me', comment: outboxComment(1_000) },
      {
        id: 'stale',
        name: orbitOutboxPlaylistName(sid, 'eve'),
        owner: 'me',
        comment: outboxComment(ORBIT_ORPHAN_TTL_MS + 60_000),
      },
    ]);
    expect(deleted).toEqual(['stale']);
  });

  it('prunes an unrecognisable __psyorbit_* playlist', async () => {
    const deleted = await runWith([
      { id: 'junk', name: `${ORBIT_PLAYLIST_PREFIX}not-a-real-name`, owner: 'me' },
    ]);
    expect(deleted).toEqual(['junk']);
  });

  it('ignores playlists owned by another user', async () => {
    const sid = 'ffff6666';
    const deleted = await runWith([
      {
        id: 'foreign',
        name: orbitSessionPlaylistName(sid),
        owner: 'someone-else',
        comment: sessionComment(sid, ORBIT_ORPHAN_TTL_MS + 60_000),
      },
    ]);
    expect(deleted).toEqual([]);
  });

  it('sweeps stale owned playlists on every configured server', async () => {
    authState.servers = [
      { id: 'srv-owner', username: 'me' },
      { id: 'srv-other', username: 'also-me' },
    ];
    getPlaylistsForServer.mockImplementation(async (serverId: string) => ([{
      id: `${serverId}-stale`,
      name: orbitSessionPlaylistName('abcd1234'),
      owner: serverId === 'srv-owner' ? 'me' : 'also-me',
      comment: sessionComment('abcd1234', ORBIT_ORPHAN_TTL_MS + 60_000),
    }]));

    await expect(cleanupOrphanedOrbitPlaylists()).resolves.toBe(2);
    expect(getPlaylistsForServer).toHaveBeenCalledWith('srv-owner', true);
    expect(getPlaylistsForServer).toHaveBeenCalledWith('srv-other', true);
    expect(deletePlaylist).toHaveBeenCalledWith('srv-owner-stale', 'srv-owner');
    expect(deletePlaylist).toHaveBeenCalledWith('srv-other-stale', 'srv-other');
  });
});
