import { beforeEach, describe, expect, it, vi } from 'vitest';

const coverCachePeekBatch = vi.hoisted(() => vi.fn(async (_refs: unknown[]) => ({})));
const resolveAlbumCoverRefFromLibrary = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/coverCache', () => ({ coverCachePeekBatch }));
vi.mock('./diskSrcLookup', () => ({
  getDiskSrcForGrid: () => 'disk://hit',
  rememberGridDiskSrc: vi.fn(() => true),
}));
vi.mock('./ensureQueue', () => ({
  coverEnsureQueued: vi.fn(),
  ensureArtistBackdropQueued: vi.fn(),
}));
vi.mock('./serverScope', () => ({
  coverServerScopeForServerId: (serverId?: string) => serverId
    ? {
        kind: 'server',
        serverId,
        url: `https://${serverId}.test`,
        username: serverId,
        password: 'secret',
      }
    : { kind: 'active' },
}));
vi.mock('./resolveEntryLibrary', () => ({
  resolveAlbumCoverRefFromLibrary,
}));

import { warmHomeMainstageCovers } from './warmDiskPeek';

describe('warmHomeMainstageCovers', () => {
  beforeEach(() => {
    coverCachePeekBatch.mockClear();
    resolveAlbumCoverRefFromLibrary.mockClear();
  });

  it('builds owner-scoped album and song refs and uses song coverArt as the fetch fallback', async () => {
    await warmHomeMainstageCovers({
      heroAlbums: [{
        id: 'album-1',
        name: 'Album',
        artist: 'Artist',
        artistId: 'artist-1',
        songCount: 1,
        duration: 100,
        coverArt: 'album-cover',
        serverId: 'srv-owner',
      }],
      recent: [],
      random: [],
      mostPlayed: [],
      recentlyPlayed: [],
      starred: [],
      discoverSongs: [{
        albumId: 'album-2',
        coverArt: 'song-cover',
        serverId: 'srv-owner',
      }],
    });

    const refs = coverCachePeekBatch.mock.calls[0]?.[0] ?? [];
    expect(refs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cacheEntityId: 'album-1',
        fetchCoverArtId: 'album-cover',
        serverScope: expect.objectContaining({ kind: 'server', serverId: 'srv-owner' }),
      }),
      expect.objectContaining({
        cacheEntityId: 'album-2',
        fetchCoverArtId: 'song-cover',
        serverScope: expect.objectContaining({ kind: 'server', serverId: 'srv-owner' }),
      }),
    ]));
    expect(resolveAlbumCoverRefFromLibrary).not.toHaveBeenCalled();
  });
});
