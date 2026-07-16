import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTrackCoverRef } from './useLibraryCoverRef';
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
