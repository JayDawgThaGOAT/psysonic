import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SubsonicAlbum } from '@/lib/api/subsonicTypes';
import { fetchHotNewReleases, mergeHotNewReleases } from './hotNewReleases';

const getAlbumListForServer = vi.fn();
vi.mock('@/lib/api/subsonicLibrary', () => ({
  getAlbumListForServer: (...args: unknown[]) => getAlbumListForServer(...args),
}));

function album(id: string, created: string, serverId = 's1'): SubsonicAlbum {
  return { id, created, serverId, name: id, artist: 'Artist', artistId: 'artist', songCount: 1, duration: 1 };
}

describe('hot New Releases overlay', () => {
  beforeEach(() => getAlbumListForServer.mockReset());

  it('merges only equal owner identities and orders by catalog creation time', () => {
    const merged = mergeHotNewReleases(
      [album('local', '2026-01-01T00:00:00Z'), album('same', '2026-01-01T00:00:00Z')],
      [
        album('hot', '2026-01-03T00:00:00Z', 's2'),
        album('same', '2026-01-02T00:00:00Z', 's2'),
        album('same', '2026-01-04T00:00:00Z', 's1'),
      ],
    );
    expect(merged.map(item => `${item.serverId}:${item.id}`)).toEqual([
      's1:same',
      's2:hot',
      's2:same',
      's1:local',
    ]);
  });

  it('requests each selected library and keeps only recent valid dates', async () => {
    const now = Date.parse('2026-07-16T12:00:00Z');
    getAlbumListForServer.mockImplementation(async (serverId: string) => [
      album(`${serverId}-fresh`, '2026-07-16T11:00:00Z', serverId),
      album(`${serverId}-old`, '2026-07-12T11:00:00Z', serverId),
      album(`${serverId}-invalid`, 'not-a-date', serverId),
    ]);

    const result = await fetchHotNewReleases([
      { serverId: 's1', libraryId: 'l1' },
      { serverId: 's2', libraryId: 'l2' },
    ], now);

    expect(getAlbumListForServer).toHaveBeenCalledWith(
      's1', 'newest', 24, 0, { musicFolderId: 'l1' }, 8000,
    );
    expect(getAlbumListForServer).toHaveBeenCalledWith(
      's2', 'newest', 24, 0, { musicFolderId: 'l2' }, 8000,
    );
    expect(result.map(item => item.id).sort()).toEqual(['s1-fresh', 's2-fresh']);
  });
});
