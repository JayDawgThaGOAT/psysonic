import { beforeEach, describe, expect, it } from 'vitest';
import { onInvoke } from '@/test/mocks/tauri';
import { resetAuthStore } from '@/test/helpers/storeReset';
import { useAuthStore } from '@/store/authStore';
import { useLibraryIndexStore } from '@/store/libraryIndexStore';
import { runLocalAlbumBrowse } from './albumBrowseLocal';
import type { AlbumBrowseQuery } from './albumBrowseTypes';

const query: AlbumBrowseQuery = {
  sort: 'alphabeticalByName',
  genres: [],
  losslessOnly: false,
  starredOnly: false,
  compFilter: 'all',
};

beforeEach(() => {
  resetAuthStore();
  useLibraryIndexStore.setState({ masterEnabled: true });
  useAuthStore.setState({
    activeServerId: 'a',
    servers: [
      { id: 'a', name: 'A', url: 'https://a.test', username: 'u', password: 'p' },
      { id: 'b', name: 'B', url: 'https://b.test', username: 'u', password: 'p' },
    ],
    libraryBrowseServerIds: ['a', 'b'],
    musicFoldersByServer: {
      a: [{ id: 'lib-a', name: 'A' }],
      b: [{ id: 'lib-b', name: 'B' }],
    },
    libraryBrowseSelectionByServer: {},
  });
});

describe('runLocalAlbumBrowse multi-server readiness', () => {
  it('declines local browse rather than omitting an unready selected server', async () => {
    onInvoke('library_get_status', args => {
      const serverId = (args as { serverId: string }).serverId;
      return { serverId, libraryScope: '', syncPhase: serverId === 'b.test' ? 'initial_sync' : 'ready' };
    });
    let browseInvoked = false;
    onInvoke('library_advanced_search', () => {
      browseInvoked = true;
      return { artists: [], albums: [], tracks: [], totals: { artists: 0, albums: 0, tracks: 0 }, source: 'local' };
    });

    await expect(runLocalAlbumBrowse('a', query, 0, 20)).resolves.toBeNull();
    expect(browseInvoked).toBe(false);
  });

  it('passes every ready selected scope with canonical server keys', async () => {
    onInvoke('library_get_status', args => ({
      serverId: (args as { serverId: string }).serverId,
      libraryScope: '',
      syncPhase: 'ready',
    }));
    let captured: unknown;
    onInvoke('library_advanced_search', args => {
      captured = args;
      return { artists: [], albums: [], tracks: [], totals: { artists: 0, albums: 0, tracks: 0 }, source: 'local' };
    });

    await expect(runLocalAlbumBrowse('a', query, 0, 20)).resolves.toEqual({ albums: [], hasMore: false });
    expect(captured).toMatchObject({
      request: {
        serverId: 'a.test',
        libraryScopes: [
          { serverId: 'a.test', libraryId: null },
          { serverId: 'b.test', libraryId: null },
        ],
      },
    });
  });
});
