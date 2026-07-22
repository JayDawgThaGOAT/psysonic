import { beforeEach, describe, expect, it, vi } from 'vitest';

const listArtistsMock = vi.fn();
const listAlbumsMock = vi.fn();

vi.mock('@/lib/api/library/scopeReads', () => ({
  libraryScopeListComposers: vi.fn(),
}));
vi.mock('@/lib/library/advancedSearchLocal', () => ({
  artistToArtist: vi.fn(value => value),
}));
vi.mock('@/lib/api/navidromeBrowse', () => ({
  ndListArtistsByRoleForServer: (...args: unknown[]) => listArtistsMock(...args),
  ndListAlbumsByArtistRoleForServer: (...args: unknown[]) => listAlbumsMock(...args),
}));

import {
  loadNetworkComposerAlbums,
  loadNetworkComposerCatalog,
} from './composerBrowse';

describe('composer network fallback', () => {
  beforeEach(() => {
    listArtistsMock.mockReset();
    listAlbumsMock.mockReset();
  });

  it('keeps successful library catalog slices when another library fails', async () => {
    listArtistsMock
      .mockRejectedValueOnce(new Error('library offline'))
      .mockResolvedValueOnce([
        { id: 'composer-1', name: 'Composer', serverId: 'srv', albumCount: 2 },
      ]);

    await expect(loadNetworkComposerCatalog('srv', ['lib-a', 'lib-b'])).resolves.toEqual([
      { id: 'composer-1', name: 'Composer', serverId: 'srv', albumCount: 2 },
    ]);
  });

  it('keeps successful library album slices when another library fails', async () => {
    listAlbumsMock
      .mockResolvedValueOnce([{ id: 'album-1', name: 'Album', serverId: 'srv' }])
      .mockRejectedValueOnce(new Error('library offline'));

    await expect(loadNetworkComposerAlbums('srv', 'composer-1', ['lib-a', 'lib-b'])).resolves.toEqual([
      { id: 'album-1', name: 'Album', serverId: 'srv' },
    ]);
  });
});
