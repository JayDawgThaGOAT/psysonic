import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { SubsonicArtist } from '@/lib/api/subsonicTypes';
import { useAuthStore } from '@/store/authStore';
import { makeAuthState, makeServer } from '@/test/helpers/factories';
import { resetAuthStore } from '@/test/helpers/storeReset';
import { ArtistCardAvatar, ArtistRowAvatar } from './ArtistAvatars';

const artistCoverArtImageMock = vi.hoisted(() => vi.fn());

vi.mock('@/cover/ArtistCoverArtImage', () => ({
  ArtistCoverArtImage: (props: unknown) => {
    artistCoverArtImageMock(props);
    return <div data-testid="artist-cover" />;
  },
}));

describe('artist browse avatars', () => {
  beforeEach(() => {
    resetAuthStore();
    artistCoverArtImageMock.mockClear();
  });

  it.each([
    ['card', ArtistCardAvatar],
    ['row', ArtistRowAvatar],
  ])('uses the artist owner server for the %s cover', (_name, Avatar) => {
    const activeServer = makeServer({ id: 'server-active' });
    const ownerServer = makeServer({ id: 'server-owner' });
    useAuthStore.setState(makeAuthState({
      servers: [activeServer, ownerServer],
      activeServerId: activeServer.id,
    }));
    const artist: SubsonicArtist = {
      id: 'artist-1',
      name: 'Artist One',
      coverArt: 'artist-cover-1',
      serverId: ownerServer.id,
    };

    render(<Avatar artist={artist} showImages />);

    expect(artistCoverArtImageMock.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      artistId: artist.id,
      coverArt: artist.coverArt,
      serverScope: expect.objectContaining({
        kind: 'server',
        serverId: ownerServer.id,
        url: ownerServer.url,
      }),
    }));
  });
});
