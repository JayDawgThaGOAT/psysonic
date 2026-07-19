import { beforeEach, describe, expect, it, vi } from 'vitest';
import { onInvoke } from '@/test/mocks/tauri';
import { makeAuthState, makeServer } from '@/test/helpers/factories';
import { resetAuthStore } from '@/test/helpers/storeReset';
import { useAuthStore } from '@/store/authStore';
import { serverIndexKeyForProfile } from '@/lib/server/serverIndexKey';
import { useDeviceSyncStore, type DeviceSyncSource } from '@/features/deviceSync/store/deviceSyncStore';
import { runDeviceSyncSummaryPrompt, type SyncDelta } from './runDeviceSyncExecution';

describe('runDeviceSyncSummaryPrompt ownership', () => {
  beforeEach(() => {
    resetAuthStore();
    useDeviceSyncStore.setState({
      targetDir: null,
      sources: [],
      checkedIds: [],
      pendingDeletion: [],
      deviceFilePaths: [],
      scanning: false,
    });
  });

  it('uses the captured source owner even when another server is active', async () => {
    const owner = makeServer({ id: 'owner', url: 'https://owner.test', username: 'alice', password: 'secret' });
    const active = makeServer({ id: 'active', url: 'https://active.test' });
    const serverIndexKey = serverIndexKeyForProfile(owner);
    const source: DeviceSyncSource = {
      type: 'album', id: 'album-1', name: 'Album', serverIndexKey,
    };
    useAuthStore.setState(makeAuthState({ servers: [owner, active], activeServerId: active.id }));
    useDeviceSyncStore.setState({ targetDir: '/device', sources: [source], pendingDeletion: [] });

    onInvoke('calculate_sync_payload', args => {
      const payload = args as {
        sources: DeviceSyncSource[];
        auth: { serverId: string; serverIndexKey: string; baseUrl: string; u: string };
      };
      expect(payload.sources).toEqual([source]);
      expect(payload.auth).toMatchObject({
        serverId: owner.id,
        serverIndexKey,
        baseUrl: 'https://owner.test/rest',
        u: 'alice',
      });
      return { addBytes: 0, addCount: 0, delBytes: 0, delCount: 0, availableBytes: 1, tracks: [] };
    });

    const setSyncDelta = vi.fn<(delta: SyncDelta) => void>();
    await runDeviceSyncSummaryPrompt({
      targetDir: '/device',
      sources: [source],
      pendingDeletion: [],
      t: ((key: string) => key) as never,
      setPreSyncLoading: vi.fn(),
      setPreSyncOpen: vi.fn(),
      setSyncDelta,
    });

    expect(setSyncDelta).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.objectContaining({ serverIndexKey, targetDir: '/device', sources: [source] }),
    }));
  });

  it('discards a preview that resolves after the target changes', async () => {
    const owner = makeServer({ id: 'owner', url: 'https://owner.test' });
    const serverIndexKey = serverIndexKeyForProfile(owner);
    const source: DeviceSyncSource = {
      type: 'playlist', id: 'playlist-1', name: 'Playlist', serverIndexKey,
    };
    useAuthStore.setState(makeAuthState({ servers: [owner], activeServerId: owner.id }));
    useDeviceSyncStore.setState({ targetDir: '/old', sources: [source], pendingDeletion: [] });

    let resolvePayload!: (value: object) => void;
    onInvoke('calculate_sync_payload', () => new Promise(resolve => { resolvePayload = resolve; }));
    const setSyncDelta = vi.fn<(delta: SyncDelta) => void>();
    const setPreSyncOpen = vi.fn<(open: boolean) => void>();
    const pending = runDeviceSyncSummaryPrompt({
      targetDir: '/old',
      sources: [source],
      pendingDeletion: [],
      t: ((key: string) => key) as never,
      setPreSyncLoading: vi.fn(),
      setPreSyncOpen,
      setSyncDelta,
    });

    useDeviceSyncStore.setState({ targetDir: '/new' });
    resolvePayload({ addBytes: 0, addCount: 0, delBytes: 0, delCount: 0, availableBytes: 1, tracks: [] });
    await pending;

    expect(setSyncDelta).not.toHaveBeenCalled();
    expect(setPreSyncOpen).toHaveBeenLastCalledWith(false);
  });
});
