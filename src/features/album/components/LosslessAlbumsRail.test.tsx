import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';

const { localMock, networkMock, authState } = vi.hoisted(() => ({
  localMock: vi.fn(),
  networkMock: vi.fn(),
  authState: { activeServerId: 'active' as string | null },
}));

vi.mock('@/lib/library/browseTextSearch', () => ({ runLocalLosslessAlbums: localMock }));
vi.mock('@/lib/api/navidromeBrowse', () => ({ ndListLosslessAlbumsPageForServer: networkMock }));
vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (state: typeof authState) => unknown) => selector(authState),
}));
vi.mock('@/store/libraryIndexStore', () => ({
  useLibraryIndexStore: (selector: (state: { masterEnabled: boolean }) => unknown) => selector({ masterEnabled: true }),
}));
vi.mock('@/features/album/components/AlbumRow', () => ({
  default: ({ albums }: { albums: Array<{ id: string; serverId?: string }> }) => (
    <div data-testid="albums">{albums.map(album => `${album.serverId}:${album.id}`).join('|')}</div>
  ),
}));

import LosslessAlbumsRail from '@/features/album/components/LosslessAlbumsRail';

const album = (serverId: string, id: string) => ({
  serverId,
  id,
  name: id,
  artist: 'Artist',
  artistId: 'artist',
  songCount: 1,
  duration: 1,
});

describe('LosslessAlbumsRail multi-server scope', () => {
  beforeEach(() => {
    localMock.mockReset();
    networkMock.mockReset();
  });

  it('uses equal quotas, local-first fallback, failure isolation, and stable round-robin order', async () => {
    localMock.mockImplementation(async (serverId: string, limit: number) => {
      if (serverId === 'srv-a') {
        return { albums: Array.from({ length: limit }, (_, index) => album(serverId, `a${index + 1}`)), hasMore: false };
      }
      return null;
    });
    networkMock.mockImplementation(async (serverId: string, req: { targetNewAlbums: number }) => {
      if (serverId === 'srv-c') throw new Error('offline');
      return {
        entries: Array.from({ length: req.targetNewAlbums }, (_, index) => ({
          album: album(serverId, `b${index + 1}`), bitDepth: 24, sampleRate: 96000,
        })),
        done: false,
        nextSongOffset: 100,
      };
    });

    renderWithProviders(<LosslessAlbumsRail serverIds={['srv-a', 'srv-b', 'srv-c']} scopeVersion={4} />);

    await waitFor(() => expect(screen.getByTestId('albums')).toHaveTextContent(
      'srv-a:a1|srv-b:b1|srv-a:a2|srv-b:b2|srv-a:a3|srv-b:b3|srv-a:a4|srv-b:b4|srv-a:a5|srv-b:b5|srv-a:a6|srv-b:b6|srv-a:a7|srv-b:b7',
    ));
    expect(localMock).toHaveBeenNthCalledWith(1, 'srv-a', 7, 0);
    expect(localMock).toHaveBeenNthCalledWith(2, 'srv-b', 7, 0);
    expect(localMock).toHaveBeenNthCalledWith(3, 'srv-c', 6, 0);
    expect(networkMock).not.toHaveBeenCalledWith('srv-a', expect.anything());
    expect(networkMock).toHaveBeenCalledWith('srv-b', {
      targetNewAlbums: 7,
      songsPerPage: 100,
      maxPagesPerCall: 1,
    });
    expect(networkMock).toHaveBeenCalledWith('srv-c', {
      targetNewAlbums: 6,
      songsPerPage: 100,
      maxPagesPerCall: 1,
    });
  });

  it('preserves active-server behavior when the scope props are omitted', async () => {
    localMock.mockResolvedValue({ albums: [album('active', 'local')], hasMore: false });

    renderWithProviders(<LosslessAlbumsRail />);

    await waitFor(() => expect(screen.getByTestId('albums')).toHaveTextContent('active:local'));
    expect(localMock).toHaveBeenCalledWith('active', 20, 0);
    expect(networkMock).not.toHaveBeenCalled();
  });
});
