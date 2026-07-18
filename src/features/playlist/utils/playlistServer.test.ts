import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/store/authStore';
import { resetAuthStore } from '@/test/helpers/storeReset';
import {
  playlistDetailPath,
  runLatestPlaylistServerIntent,
} from './playlistServer';

describe('playlist server ownership', () => {
  beforeEach(() => {
    resetAuthStore();
    useAuthStore.setState({
      servers: [
        { id: 'a', name: 'A', url: 'https://a.test', username: 'u', password: 'p' },
        { id: 'b', name: 'B', url: 'https://b.test', username: 'u', password: 'p' },
      ],
      activeServerId: 'a',
    });
  });

  it('includes the owner in detail links', () => {
    expect(playlistDetailPath({
      id: 'same', serverId: 'b', name: 'Remote', songCount: 0, duration: 0, created: '', changed: '',
    })).toBe('/playlists/same?server=b');
  });

  it('drops an older navigation intent when a newer click wins', async () => {
    const firstAction = vi.fn();
    const secondAction = vi.fn();
    const remote = {
      id: 'remote', serverId: 'b', name: 'Remote', songCount: 0, duration: 0, created: '', changed: '',
    };
    const local = {
      id: 'local', serverId: 'a', name: 'Local', songCount: 0, duration: 0, created: '', changed: '',
    };

    const first = runLatestPlaylistServerIntent(remote, firstAction);
    await runLatestPlaylistServerIntent(local, secondAction);
    await first;

    expect(secondAction).toHaveBeenCalledOnce();
    expect(firstAction).not.toHaveBeenCalled();
    expect(useAuthStore.getState().activeServerId).toBe('a');
  });

  it('routes an owner-qualified playlist without switching the active server', async () => {
    const action = vi.fn();

    await runLatestPlaylistServerIntent({
      id: 'remote', serverId: 'b', name: 'Remote', songCount: 0, duration: 0, created: '', changed: '',
    }, action);

    expect(action).toHaveBeenCalledOnce();
    expect(useAuthStore.getState().activeServerId).toBe('a');
  });
});
