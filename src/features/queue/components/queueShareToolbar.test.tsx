import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, waitFor, within } from '@testing-library/react';
import QueuePanel from '@/features/queue/components/QueuePanel';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { usePlayerStore } from '@/features/playback/store/playerStore';
import { useAuthStore } from '@/store/authStore';
import { resetAllStores } from '@/test/helpers/storeReset';
import { makeTrack, seedQueue } from '@/test/helpers/factories';
import { onInvoke, registerDefaultCoverInvokeHandlers } from '@/test/mocks/tauri';
import { decodeSharePayloadFromText } from '@/lib/share/shareLink';

const copyTextToClipboardMock = vi.fn(async (_text: string) => true);

vi.mock('@/lib/server/serverMagicString', () => ({
  copyTextToClipboard: (text: string) => copyTextToClipboardMock(text),
}));

vi.mock('@/features/orbit/utils/orbitBulkGuard', () => ({
  orbitBulkGuard: vi.fn(async () => true),
}));

vi.mock('@/lib/api/subsonic', () => ({
  savePlayQueue: vi.fn(async () => undefined),
  getPlayQueue: vi.fn(async () => ({ songs: [], current: undefined, position: 0 })),
  buildStreamUrl: vi.fn((id: string) => `https://mock/stream/${id}`),
  buildCoverArtUrl: vi.fn((id: string) => `https://mock/cover/${id}`),
  getSong: vi.fn(async () => null),
}));

function seedPublicShareQueue(pageUrl: string) {
  const track = {
    ...makeTrack({ id: 'ndshare:AbCdEfGhIj:0', serverId: 'navidrome-public-share' }),
    directStreamUrl: 'https://music.test/share/s/jwt-token',
  };
  usePlayerStore.setState({
    queueServerId: 'navidrome-public-share',
    navidromePublicSharePageUrl: pageUrl,
    queueItems: [{
      serverId: 'navidrome-public-share',
      trackId: 'ndshare:AbCdEfGhIj:0',
      directStreamUrl: track.directStreamUrl,
    }],
    queueIndex: 0,
    currentTrack: track,
  });
}

describe('QueuePanel share toolbar', () => {
  beforeEach(() => {
    resetAllStores();
    copyTextToClipboardMock.mockClear();
    const id = useAuthStore.getState().addServer({
      name: 'T', url: 'https://x.test', username: 'u', password: 'p',
    });
    useAuthStore.getState().setActiveServer(id);
    registerDefaultCoverInvokeHandlers();
    onInvoke('audio_play', () => undefined);
    onInvoke('audio_pause', () => undefined);
    onInvoke('audio_stop', () => undefined);
    onInvoke('audio_seek', () => undefined);
    onInvoke('audio_get_state', () => ({ playing: false }));
    onInvoke('audio_update_replay_gain', () => undefined);
    onInvoke('discord_update_presence', () => undefined);
    onInvoke('library_get_recent_play_sessions', () => []);
  });

  it('hides Save Playlist in the playlist menu for a Navidrome public share queue', () => {
    seedPublicShareQueue('https://music.test/share/AbCdEfGhIj');
    const { getByLabelText, container } = renderWithProviders(<QueuePanel />);
    fireEvent.click(getByLabelText('Playlist'));
    const menu = container.querySelector('.queue-menu');
    expect(menu?.textContent).not.toContain('Save Playlist');
    expect(menu?.textContent).toContain('Load Playlist');
  });

  it('copies the original Navidrome share page URL from the share button', async () => {
    const pageUrl = 'https://music.test/share/AbCdEfGhIj';
    seedPublicShareQueue(pageUrl);
    const { getByLabelText } = renderWithProviders(<QueuePanel />);
    fireEvent.click(getByLabelText('Copy Navidrome share link'));
    expect(copyTextToClipboardMock).toHaveBeenCalledWith(pageUrl);
  });

  it('shares a single represented server without prompting, even when another server is active', async () => {
    const secondServerId = useAuthStore.getState().addServer({
      name: 'Second', url: 'https://second.test', username: 'u2', password: 'p2',
    });
    const track = makeTrack({ id: 'second-track', serverId: secondServerId });
    seedQueue([track], { currentTrack: track, serverId: secondServerId });

    const { getByLabelText, queryByRole } = renderWithProviders(<QueuePanel />);
    fireEvent.click(getByLabelText('Copy queue share link'));

    await waitFor(() => expect(copyTextToClipboardMock).toHaveBeenCalledOnce());
    expect(queryByRole('dialog')).not.toBeInTheDocument();
    expect(decodeSharePayloadFromText(copyTextToClipboardMock.mock.calls[0]![0])).toEqual({
      srv: 'https://second.test',
      k: 'queue',
      ids: ['second-track'],
    });
  });

  it('prompts for a server when the queue is mixed and shares only that server\'s tracks', async () => {
    const activeServerId = useAuthStore.getState().activeServerId!;
    const secondServerId = useAuthStore.getState().addServer({
      name: 'Second', url: 'https://second.test', username: 'u2', password: 'p2',
    });
    const activeTrack = makeTrack({ id: 'active-track', serverId: activeServerId });
    const secondTrack = makeTrack({ id: 'second-track', serverId: secondServerId });
    seedQueue([activeTrack, secondTrack], { currentTrack: activeTrack, serverId: activeServerId });

    const { getByLabelText, getByRole, queryByRole } = renderWithProviders(<QueuePanel />);
    fireEvent.click(getByLabelText('Copy queue share link'));

    const dialog = getByRole('dialog');
    expect(copyTextToClipboardMock).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Second' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy queue share link' }));

    await waitFor(() => expect(copyTextToClipboardMock).toHaveBeenCalledOnce());
    expect(queryByRole('dialog')).not.toBeInTheDocument();
    expect(decodeSharePayloadFromText(copyTextToClipboardMock.mock.calls[0]![0])).toEqual({
      srv: 'https://second.test',
      k: 'queue',
      ids: ['second-track'],
    });
  });
});
