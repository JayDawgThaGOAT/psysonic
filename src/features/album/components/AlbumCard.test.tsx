import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import type { SubsonicAlbum } from '@/lib/api/subsonicTypes';

const startDrag = vi.hoisted(() => vi.fn());

vi.mock('@/lib/dnd/DragDropContext', () => ({
  useDragDrop: () => ({ startDrag, payload: null, isDragging: false }),
}));
vi.mock('@/cover/useLibraryCoverRef', () => ({
  useAlbumCoverRef: () => null,
}));

import AlbumCard from './AlbumCard';

describe('AlbumCard', () => {
  it('includes the album owner in its drag payload', () => {
    startDrag.mockClear();
    const album: SubsonicAlbum = {
      id: 'album-1',
      name: 'Owned Album',
      artist: 'Artist',
      artistId: 'artist-1',
      songCount: 1,
      duration: 100,
      serverId: 'srv-owner',
    };
    renderWithProviders(<AlbumCard album={album} disableArtwork />);

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Owned Album von Artist' }), {
      button: 0,
      clientX: 10,
      clientY: 10,
    });
    fireEvent.mouseMove(document, { clientX: 20, clientY: 10 });

    expect(startDrag).toHaveBeenCalledOnce();
    expect(JSON.parse(startDrag.mock.calls[0]![0].data)).toEqual({
      type: 'album',
      id: 'album-1',
      name: 'Owned Album',
      serverId: 'srv-owner',
    });
  });
});
