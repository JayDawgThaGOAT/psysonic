import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import SongCard from '@/features/home/components/SongCard';
import type { SubsonicSong } from '@/lib/api/subsonicTypes';

const navigateToArtist = vi.fn();
const navigateToAlbum = vi.fn();
const useTrackCoverRef = vi.fn();
const startDrag = vi.fn();

// Mock navigation submodules directly so their barrels re-export the stubs
// while unrelated helpers used by SongCard stay real.
vi.mock('@/features/artist/hooks/useNavigateToArtist', () => ({
  useNavigateToArtist: () => navigateToArtist,
}));

vi.mock('@/features/album/hooks/useNavigateToAlbum', () => ({
  useNavigateToAlbum: () => navigateToAlbum,
}));

vi.mock('@/cover/useLibraryCoverRef', () => ({
  useTrackCoverRef: (...args: unknown[]) => useTrackCoverRef(...args),
}));

vi.mock('@/cover/serverScope', () => ({
  coverServerScopeForServerId: (serverId: string | undefined) => ({ kind: 'test', serverId }),
}));

vi.mock('@/lib/dnd/DragDropContext', () => ({
  useDragDrop: () => ({ startDrag, payload: null, isDragging: false }),
}));

function song(overrides: Partial<SubsonicSong>): SubsonicSong {
  return {
    id: 's1', title: 'Track', artist: 'A', album: 'Alb', albumId: 'al1', duration: 100,
    ...overrides,
  } as SubsonicSong;
}

describe('SongCard', () => {
  it('splits OpenSubsonic artists into individual links', async () => {
    navigateToArtist.mockClear();
    const user = userEvent.setup();
    renderWithProviders(
      <SongCard
        disableArtwork
        song={song({
          artist: 'Apocalyptica', artistId: 'a1',
          artists: [{ id: 'a1', name: 'Apocalyptica' }, { id: 'a2', name: 'Joe Duplantier' }],
        })}
      />,
    );
    expect(screen.getByText('Apocalyptica')).toHaveClass('track-artist-link');
    expect(screen.getByText('Joe Duplantier')).toHaveClass('track-artist-link');
    await user.click(screen.getByText('Joe Duplantier'));
    expect(navigateToArtist).toHaveBeenCalledWith('a2', { serverId: undefined });
  });

  it('scopes covers and detail navigation to the song owner', async () => {
    navigateToAlbum.mockClear();
    navigateToArtist.mockClear();
    useTrackCoverRef.mockClear();
    const user = userEvent.setup();
    const ownedSong = song({ artistId: 'a1', serverId: 'srv-2' });

    renderWithProviders(<SongCard disableArtwork song={ownedSong} />);

    expect(useTrackCoverRef).toHaveBeenCalledWith(
      ownedSong,
      { kind: 'test', serverId: 'srv-2' },
      { libraryResolve: false },
    );

    await user.click(screen.getByText('A'));
    expect(navigateToArtist).toHaveBeenCalledWith('a1', { serverId: 'srv-2' });

    await user.click(screen.getByRole('button', { name: /to album/i }));
    expect(navigateToAlbum).toHaveBeenCalledWith('al1', { search: 'server=srv-2' });
  });

  it('starts a canonical song drag with the owner-preserving track payload', () => {
    startDrag.mockClear();
    const ownedSong = song({ serverId: 'srv-2', coverArt: 'cover-1' });
    renderWithProviders(<SongCard disableArtwork song={ownedSong} />);

    fireEvent.mouseDown(screen.getByRole('button', { name: /Track/ }), {
      button: 0,
      clientX: 10,
      clientY: 10,
    });
    fireEvent.mouseMove(document, { clientX: 20, clientY: 10 });

    expect(startDrag).toHaveBeenCalledOnce();
    const payload = JSON.parse(startDrag.mock.calls[0]![0].data);
    expect(payload).toEqual({
      type: 'song',
      track: expect.objectContaining({
        id: 's1',
        albumId: 'al1',
        coverArt: 'cover-1',
        serverId: 'srv-2',
      }),
    });
  });
});
