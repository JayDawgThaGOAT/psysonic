import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Track } from '@/lib/media/trackTypes';

const mocks = vi.hoisted(() => ({
  getSimilarForServer: vi.fn(),
  getTopForServer: vi.fn(),
  enqueueRadio: vi.fn(),
  resume: vi.fn(),
  setRadioArtistId: vi.fn(),
  buildDownloadUrlForServer: vi.fn(),
  downloadZip: vi.fn(),
  zipStart: vi.fn(),
  zipComplete: vi.fn(),
  zipFail: vi.fn(),
  state: {
    currentTrack: null as Track | null,
    isPlaying: false,
    queueItems: [],
    queueIndex: 0,
  },
}));

vi.mock('@/lib/api/subsonicArtists', () => ({
  fetchSimilarTracksRoutedForServer: vi.fn(),
  getSimilarSongs2ForServer: mocks.getSimilarForServer,
  getTopSongsForServer: mocks.getTopForServer,
}));
vi.mock('@/features/playback/store/playerStore', () => ({
  usePlayerStore: {
    getState: () => ({
      ...mocks.state,
      enqueueRadio: mocks.enqueueRadio,
      resume: mocks.resume,
      setRadioArtistId: mocks.setRadioArtistId,
    }),
  },
}));
vi.mock('@tauri-apps/api/path', () => ({ join: vi.fn(async (...parts: string[]) => parts.join('/')) }));
vi.mock('@/lib/api/subsonicStreamUrl', () => ({
  buildDownloadUrlForServer: mocks.buildDownloadUrlForServer,
}));
vi.mock('@/lib/api/downloadZip', () => ({ downloadZip: mocks.downloadZip }));
vi.mock('@/features/offline', () => ({
  useDownloadModalStore: { getState: () => ({ requestFolder: vi.fn() }) },
  useZipDownloadStore: {
    getState: () => ({
      start: mocks.zipStart,
      complete: mocks.zipComplete,
      fail: mocks.zipFail,
    }),
  },
}));

import { downloadAlbum, startRadio } from './contextMenuActions';
import { useAuthStore } from '@/store/authStore';

const SEED: Track = {
  id: 'shared',
  serverId: 'srv-owner',
  title: 'Seed',
  artist: 'Artist',
  artistId: 'artist-1',
  album: 'Album',
  albumId: 'album-1',
  duration: 120,
};

describe('context-menu radio ownership', () => {
  beforeEach(() => {
    mocks.getSimilarForServer.mockReset().mockResolvedValue([]);
    mocks.getTopForServer.mockReset().mockResolvedValue([]);
    mocks.enqueueRadio.mockReset();
    mocks.resume.mockReset();
    mocks.setRadioArtistId.mockReset();
    mocks.buildDownloadUrlForServer.mockReset().mockReturnValue('https://owner.test/download');
    mocks.downloadZip.mockReset().mockResolvedValue(undefined);
    mocks.zipStart.mockReset();
    mocks.zipComplete.mockReset();
    mocks.zipFail.mockReset();
    mocks.state.currentTrack = null;
    mocks.state.isPlaying = false;
    mocks.state.queueItems = [];
    mocks.state.queueIndex = 0;
    useAuthStore.setState({ downloadFolder: '/downloads' });
  });

  it('loads seed radio candidates from the seed owner', async () => {
    mocks.getSimilarForServer.mockResolvedValue([{ id: 'similar', title: 'Similar', serverId: 'srv-owner' }]);
    const playTrack = vi.fn();

    await startRadio('artist-1', 'Artist', playTrack, SEED);

    expect(playTrack).toHaveBeenCalledWith(SEED, [SEED]);
    expect(mocks.getSimilarForServer).toHaveBeenCalledWith('srv-owner', 'artist-1');
    expect(mocks.getTopForServer).toHaveBeenCalledWith('srv-owner', 'Artist');
    expect(mocks.enqueueRadio).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 'similar', serverId: 'srv-owner', radioAdded: true })],
      'artist-1',
      'srv-owner',
    );
  });

  it('ignores an older artist-radio request that resolves after a newer owner', async () => {
    let resolveFirstTop: ((songs: Array<{ id: string; title: string; serverId: string }>) => void) | undefined;
    mocks.getTopForServer
      .mockImplementationOnce(() => new Promise(resolve => { resolveFirstTop = resolve; }))
      .mockResolvedValueOnce([{ id: 'new', title: 'New', serverId: 'srv-b' }]);
    const playTrack = vi.fn();

    const first = startRadio('artist-a', 'Artist A', playTrack, undefined, 'srv-a');
    await startRadio('artist-b', 'Artist B', playTrack, undefined, 'srv-b');
    resolveFirstTop?.([{ id: 'old', title: 'Old', serverId: 'srv-a' }]);
    await first;

    expect(playTrack).toHaveBeenCalledTimes(1);
    expect(playTrack).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'new', serverId: 'srv-b' }),
      [expect.objectContaining({ id: 'new', serverId: 'srv-b' })],
    );
    expect(mocks.setRadioArtistId).toHaveBeenCalledWith('artist-b', 'srv-b');
  });

  it('builds album downloads with the album owner', async () => {
    await downloadAlbum('Owner Album', 'shared', 'srv-owner');

    expect(mocks.buildDownloadUrlForServer).toHaveBeenCalledWith('srv-owner', 'shared');
    expect(mocks.downloadZip).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://owner.test/download',
    }));
    expect(mocks.zipComplete).toHaveBeenCalledOnce();
  });
});
