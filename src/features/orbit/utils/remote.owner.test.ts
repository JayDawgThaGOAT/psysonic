import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeInitialOrbitState } from '@/features/orbit/api/orbit';

const mocks = vi.hoisted(() => ({
  getPlaylist: vi.fn(),
  getPlaylistForServer: vi.fn(),
  getPlaylists: vi.fn(),
  getPlaylistsForServer: vi.fn(),
  updatePlaylistMeta: vi.fn(),
}));

vi.mock('@/lib/api/subsonicPlaylists', () => mocks);

import {
  findSessionPlaylistId,
  readOrbitState,
  writeOrbitHeartbeat,
  writeOrbitState,
} from '@/features/orbit/utils/remote';

beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset());
});

describe('Orbit remote owner routing', () => {
  it('uses explicit-server playlist reads and writes throughout', async () => {
    const state = makeInitialOrbitState({ sid: 'aaaa1111', host: 'host', name: 'Session' });
    mocks.getPlaylistsForServer.mockResolvedValue([{ id: 'session-pl', name: '__psyorbit_aaaa1111__' }]);
    mocks.getPlaylistForServer.mockResolvedValue({
      playlist: { id: 'session-pl', name: '__psyorbit_aaaa1111__', comment: JSON.stringify(state) },
      songs: [],
    });

    await expect(findSessionPlaylistId('aaaa1111', 'srv-owner')).resolves.toBe('session-pl');
    await expect(readOrbitState('session-pl', 'srv-owner')).resolves.toEqual(state);
    await writeOrbitState('session-pl', state, 'srv-owner');
    await writeOrbitHeartbeat('outbox-pl', '__psyorbit_aaaa1111_from_host__', 'srv-owner');

    expect(mocks.getPlaylistsForServer).toHaveBeenCalledWith('srv-owner', true);
    expect(mocks.getPlaylistForServer).toHaveBeenCalledWith('srv-owner', 'session-pl');
    expect(mocks.updatePlaylistMeta).toHaveBeenNthCalledWith(
      1,
      'session-pl',
      '__psyorbit_aaaa1111__',
      expect.any(String),
      true,
      'srv-owner',
    );
    expect(mocks.updatePlaylistMeta).toHaveBeenNthCalledWith(
      2,
      'outbox-pl',
      '__psyorbit_aaaa1111_from_host__',
      expect.any(String),
      true,
      'srv-owner',
    );
    expect(mocks.getPlaylist).not.toHaveBeenCalled();
    expect(mocks.getPlaylists).not.toHaveBeenCalled();
  });
});
