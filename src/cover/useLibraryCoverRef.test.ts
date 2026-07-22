import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAlbumCoverRef, useArtistCoverRef, useTrackCoverRef } from './useLibraryCoverRef';
import type { CoverServerScope } from './types';

describe('useTrackCoverRef', () => {
  it('preserves an explicit server scope in the synchronous browse-card path', () => {
    const serverScope: CoverServerScope = {
      kind: 'server',
      serverId: 'srv-owner',
      url: 'https://owner.test',
      username: 'owner',
      password: 'secret',
    };

    const { result } = renderHook(() => useTrackCoverRef(
      {
        id: 'song-1',
        albumId: 'album-1',
        coverArt: 'cover-1',
        discNumber: 1,
      },
      serverScope,
      { libraryResolve: false },
    ));

    expect(result.current?.serverScope).toBe(serverScope);
  });
});

describe('useAlbumCoverRef', () => {
  it('preserves an explicit owner scope for album detail covers', () => {
    const serverScope: CoverServerScope = {
      kind: 'server',
      serverId: 'srv-owner',
      url: 'https://owner.test',
      username: 'owner',
      password: 'secret',
    };

    const { result } = renderHook(() => useAlbumCoverRef(
      'album-1',
      'album-cover-1',
      serverScope,
      { libraryResolve: false },
    ));

    expect(result.current?.serverScope).toBe(serverScope);
  });
});

describe('useArtistCoverRef', () => {
  it('preserves an explicit owner scope for artist detail covers', () => {
    const serverScope: CoverServerScope = {
      kind: 'server',
      serverId: 'srv-owner',
      url: 'https://owner.test',
      username: 'owner',
      password: 'secret',
    };

    const { result } = renderHook(() => useArtistCoverRef(
      'artist-1',
      'artist-cover-1',
      serverScope,
      { libraryResolve: false },
    ));

    expect(result.current?.serverScope).toBe(serverScope);
  });
});
