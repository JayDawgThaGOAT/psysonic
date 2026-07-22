import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';

const selectPlaybackAlternative = vi.hoisted(() => vi.fn());
vi.mock('@/features/playback/store/selectPlaybackAlternative', () => ({ selectPlaybackAlternative }));
vi.mock('@/features/playback/utils/playback/availablePlaybackAlternativeSources', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/playback/utils/playback/availablePlaybackAlternativeSources')>()),
  availablePlaybackAlternativeSources: (sources: Array<Record<string, unknown>>) => sources.map(source => ({
    ...source,
    local: true,
    serverLabel: 'Bedroom server',
  })),
}));

import PlaybackAlternativeModal from './PlaybackAlternativeModal';
import {
  _resetPlaybackAlternativeStoreForTest,
  usePlaybackAlternativeStore,
} from '@/features/playback/store/playbackAlternativeStore';

beforeEach(() => {
  _resetPlaybackAlternativeStoreForTest();
  selectPlaybackAlternative.mockReset();
  selectPlaybackAlternative.mockResolvedValue(true);
});

function openModal(): void {
  usePlaybackAlternativeStore.setState({
    failure: {
      key: '1:0:a.test:failed',
      generation: 1,
      queueIndex: 0,
      expectedRef: { serverId: 'a.test', trackId: 'failed' },
      track: {
        id: 'failed',
        title: 'Broken Song',
        artist: 'Artist',
        album: 'Album',
        albumId: 'album',
        duration: 180,
      },
      detail: 'decode error',
    },
    status: 'ready',
    sources: [{
      serverId: 'srv-b',
      id: 'replacement',
      libraryId: '',
      priority: 0,
      durationSec: 180,
      suffix: 'flac',
      bitRate: 1_000,
      sizeBytes: 30_000_000,
      starredAt: null,
      userRating: null,
    }],
    selectingKey: null,
    actionError: null,
  });
}

describe('PlaybackAlternativeModal', () => {
  it('announces the failed track and exposes a semantic source action', async () => {
    openModal();
    renderWithProviders(<PlaybackAlternativeModal />);

    const dialog = screen.getByRole('dialog', { name: /couldn’t play broken song/i });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Playback error: decode error')).toBeInTheDocument();
    const sourceButton = screen.getByRole('button', { name: /play from bedroom server/i });
    expect(sourceButton).toHaveTextContent('Downloaded · FLAC · 1000 kbps');

    await userEvent.click(sourceButton);
    expect(selectPlaybackAlternative).toHaveBeenCalledWith(expect.objectContaining({
      serverId: 'srv-b',
      id: 'replacement',
    }));
  });

  it('moves focus into the dialog, traps Tab, and closes on Escape', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    openModal();
    renderWithProviders(<PlaybackAlternativeModal />);

    const dialog = screen.getByRole('dialog');
    await waitFor(() => expect(dialog).toHaveFocus());
    const keepButton = screen.getByRole('button', { name: 'Keep current source' });
    keepButton.focus();
    await userEvent.keyboard('{Tab}');
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
    opener.remove();
  });
});
