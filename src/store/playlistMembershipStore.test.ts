import { beforeEach, describe, expect, it } from 'vitest';
import { usePlaylistMembershipStore } from '@/store/playlistMembershipStore';

describe('playlistMembershipStore', () => {
  beforeEach(() => {
    usePlaylistMembershipStore.setState({ songIdsByCacheKey: {}, revision: 0 });
  });

  it('stores and reads ids scoped to an explicit owner server', () => {
    usePlaylistMembershipStore.getState().setPlaylistSongIds('pl-1', ['a', 'b'], 'srv-1');
    expect(usePlaylistMembershipStore.getState().getPlaylistSongIds('pl-1', 'srv-1')).toEqual(['a', 'b']);
  });

  it('appends and removes by index', () => {
    const store = usePlaylistMembershipStore.getState();
    store.setPlaylistSongIds('pl-1', ['a', 'b', 'c'], 'srv-1');
    store.appendPlaylistSongIds('pl-1', ['d'], 'srv-1');
    store.removePlaylistSongIdsAtIndices('pl-1', [1], 'srv-1');
    expect(usePlaylistMembershipStore.getState().getPlaylistSongIds('pl-1', 'srv-1')).toEqual(['a', 'c', 'd']);
  });

  it('invalidate drops a single playlist; clearAll drops everything', () => {
    const store = usePlaylistMembershipStore.getState();
    store.setPlaylistSongIds('pl-1', ['a'], 'srv-1');
    store.setPlaylistSongIds('pl-2', ['b'], 'srv-1');
    store.invalidatePlaylistSongIds('pl-1', 'srv-1');
    expect(usePlaylistMembershipStore.getState().getPlaylistSongIds('pl-1', 'srv-1')).toBeUndefined();
    expect(usePlaylistMembershipStore.getState().getPlaylistSongIds('pl-2', 'srv-1')).toEqual(['b']);
    store.clearAllPlaylistSongIds();
    expect(usePlaylistMembershipStore.getState().getPlaylistSongIds('pl-2', 'srv-1')).toBeUndefined();
  });

  it('ignores ownerless cache writes', () => {
    usePlaylistMembershipStore.getState().setPlaylistSongIds('pl-1', ['a']);
    expect(usePlaylistMembershipStore.getState().songIdsByCacheKey).toEqual({});
  });
});
