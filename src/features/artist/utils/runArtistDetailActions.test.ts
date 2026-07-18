import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TFunction } from 'i18next';
import type React from 'react';
import {
  runArtistImageUpload,
  runArtistShare,
} from '@/features/artist/utils/runArtistDetailActions';
import { uploadArtistImageForServer } from '@/lib/api/subsonicArtists';
import { copyEntityShareLink } from '@/lib/share/copyEntityShareLink';
import { invalidateCoverArt } from '@/cover';

vi.mock('@/lib/api/subsonicArtists', () => ({
  uploadArtistImageForServer: vi.fn(async () => undefined),
}));
vi.mock('@/lib/share/copyEntityShareLink', () => ({
  copyEntityShareLink: vi.fn(async () => true),
}));
vi.mock('@/cover', () => ({
  invalidateCoverArt: vi.fn(async () => undefined),
}));
vi.mock('@/lib/dom/toast', () => ({ showToast: vi.fn() }));

const t = ((key: string) => key) as TFunction;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('artist detail explicit-server actions', () => {
  it('shares through the artist owner instead of the active server', async () => {
    await runArtistShare({
      artist: { id: 'artist-1', name: 'Artist', serverId: 'srv-owner' },
      serverId: 'srv-detail',
      t,
    });

    expect(copyEntityShareLink).toHaveBeenCalledWith('artist', 'artist-1', {
      serverId: 'srv-owner',
    });
  });

  it('uploads and invalidates against the resolved detail server', async () => {
    const input = document.createElement('input');
    const file = new File(['image'], 'artist.jpg', { type: 'image/jpeg' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    const setUploading = vi.fn();
    const setCoverRevision = vi.fn();

    await runArtistImageUpload({
      e: { target: input } as React.ChangeEvent<HTMLInputElement>,
      artist: { id: 'artist-1', name: 'Artist', coverArt: 'cover-1' },
      serverId: 'srv-detail',
      t,
      setUploading,
      setCoverRevision,
    });

    expect(uploadArtistImageForServer).toHaveBeenCalledWith('srv-detail', 'artist-1', file);
    expect(invalidateCoverArt).toHaveBeenNthCalledWith(1, 'cover-1', 'srv-detail');
    expect(invalidateCoverArt).toHaveBeenNthCalledWith(2, 'artist-1', 'srv-detail');
    expect(setUploading).toHaveBeenNthCalledWith(1, true);
    expect(setUploading).toHaveBeenLastCalledWith(false);
    expect(setCoverRevision).toHaveBeenCalledOnce();
  });
});
