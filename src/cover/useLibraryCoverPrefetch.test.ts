import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoverArtRef } from './types';

const coverPrefetchRegister = vi.hoisted(() => vi.fn((_refs: CoverArtRef[]) => vi.fn()));
const resolveAlbumCoverRefsFromLibrary = vi.hoisted(() => vi.fn());
const resolveArtistCoverRefsFromLibrary = vi.hoisted(() => vi.fn());
const resolveTrackCoverRefsFromLibrary = vi.hoisted(() => vi.fn());

vi.mock('./prefetchRegistry', () => ({ coverPrefetchRegister }));
vi.mock('./resolveEntryLibrary', () => ({
  resolveAlbumCoverRefsFromLibrary,
  resolveArtistCoverRefsFromLibrary,
  resolveTrackCoverRefsFromLibrary,
}));

import { useLibraryCoverPrefetch } from './useLibraryCoverPrefetch';

describe('useLibraryCoverPrefetch', () => {
  beforeEach(() => {
    coverPrefetchRegister.mockClear();
    resolveAlbumCoverRefsFromLibrary.mockReset();
    resolveArtistCoverRefsFromLibrary.mockReset();
    resolveTrackCoverRefsFromLibrary.mockReset();
  });

  it('applies one global limit to direct refs across mixed owners without library resolves', async () => {
    const refs = Array.from({ length: 18 }, (_, index): CoverArtRef => ({
      cacheKind: 'album',
      cacheEntityId: `album-${index}`,
      fetchCoverArtId: `cover-${index}`,
      serverScope: {
        kind: 'server',
        serverId: index % 2 === 0 ? 'srv-a' : 'srv-b',
        url: `https://srv-${index % 2}.test`,
        username: 'user',
        password: 'secret',
      },
    }));

    renderHook(() => useLibraryCoverPrefetch([
      { refs, limit: 16, priority: 'middle' },
    ], [refs]));

    await waitFor(() => expect(coverPrefetchRegister).toHaveBeenCalledTimes(1));
    expect(coverPrefetchRegister.mock.calls[0]?.[0]).toHaveLength(16);
    expect(coverPrefetchRegister.mock.calls[0]?.[0]).toEqual(refs.slice(0, 16));
    expect(resolveAlbumCoverRefsFromLibrary).not.toHaveBeenCalled();
    expect(resolveArtistCoverRefsFromLibrary).not.toHaveBeenCalled();
    expect(resolveTrackCoverRefsFromLibrary).not.toHaveBeenCalled();
  });

  it('retains library resolution for ordinary album buckets', async () => {
    const resolved: CoverArtRef = {
      cacheKind: 'album',
      cacheEntityId: 'album-1',
      fetchCoverArtId: 'resolved-cover',
      serverScope: { kind: 'active' },
    };
    resolveAlbumCoverRefsFromLibrary.mockResolvedValue([resolved]);

    renderHook(() => useLibraryCoverPrefetch([
      { albums: [{ id: 'album-1', coverArt: 'fallback-cover' }], priority: 'high' },
    ], []));

    await waitFor(() => expect(coverPrefetchRegister).toHaveBeenCalledTimes(1));
    expect(resolveAlbumCoverRefsFromLibrary).toHaveBeenCalledWith(
      [{ id: 'album-1', coverArt: 'fallback-cover' }],
      { kind: 'active' },
    );
    expect(coverPrefetchRegister.mock.calls[0]?.[0]).toEqual([resolved]);
  });

  it('registers direct refs without waiting for another bucket library resolve', async () => {
    let finishAlbumResolve: ((refs: CoverArtRef[]) => void) | undefined;
    resolveAlbumCoverRefsFromLibrary.mockImplementation(() => new Promise(resolve => {
      finishAlbumResolve = resolve;
    }));
    const direct: CoverArtRef = {
      cacheKind: 'album',
      cacheEntityId: 'discover',
      fetchCoverArtId: 'discover-cover',
      serverScope: { kind: 'active' },
    };

    renderHook(() => useLibraryCoverPrefetch([
      { albums: [{ id: 'slow-album' }], priority: 'low' },
      { refs: [direct], priority: 'middle' },
    ], []));

    await waitFor(() => expect(coverPrefetchRegister).toHaveBeenCalledTimes(1));
    expect(coverPrefetchRegister.mock.calls[0]?.[0]).toEqual([direct]);
    finishAlbumResolve?.([]);
  });
});
