import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibrarySyncIdlePayload } from '@/lib/api/library/dto';
import { useAuthStore } from '@/store/authStore';

const syncIdleHandlerRef = vi.hoisted(() => ({
  current: null as ((payload: LibrarySyncIdlePayload) => void) | null,
}));
const rebuildClusterMock = vi.hoisted(() =>
  vi.fn<(indexKey: string) => Promise<boolean>>(async () => true),
);

vi.mock('@/lib/api/library/events', () => ({
  subscribeLibrarySyncIdle: vi.fn(async (handler: (payload: LibrarySyncIdlePayload) => void) => {
    syncIdleHandlerRef.current = handler;
    return () => {
      syncIdleHandlerRef.current = null;
    };
  }),
}));

vi.mock('@/lib/library/clusterRebuildOnSync', () => ({
  rebuildClusterForIndexKey: (indexKey: string) => rebuildClusterMock(indexKey),
}));

import {
  librarySyncRevision,
  libraryScopeSyncRevision,
  offlineLocalLibrarySyncRevision,
  resetOfflineLocalLibrarySyncRevisionForTests,
} from '@/store/offlineLocalLibrarySyncRevision';

describe('offlineLocalLibrarySyncRevision', () => {
  beforeEach(() => {
    useAuthStore.setState({
      activeServerId: 'srv-a',
      servers: [{ id: 'srv-a', name: 'A', url: 'https://a.test', username: 'u', password: 'p' }],
    });
    resetOfflineLocalLibrarySyncRevisionForTests();
    rebuildClusterMock.mockReset();
    rebuildClusterMock.mockResolvedValue(true);
    syncIdleHandlerRef.current = null;
  });

  it('bumps revision after derived keys are ready for index key and profile id', async () => {
    expect(offlineLocalLibrarySyncRevision('srv-a')).toBe(0);
    syncIdleHandlerRef.current?.({
      serverId: 'a.test',
      libraryScope: 'default',
      kind: 'delta_sync',
      ok: true,
      error: null,
    });
    expect(offlineLocalLibrarySyncRevision('srv-a')).toBe(0);
    await vi.waitFor(() => expect(offlineLocalLibrarySyncRevision('srv-a')).toBe(1));
    expect(offlineLocalLibrarySyncRevision('a.test')).toBe(1);
    expect(librarySyncRevision()).toBe(1);
    expect(libraryScopeSyncRevision(['srv-a'])).toBe(1);
    expect(libraryScopeSyncRevision(['unrelated'])).toBe(0);
  });

  it('ignores failed sync-idle payloads', () => {
    syncIdleHandlerRef.current?.({
      serverId: 'a.test',
      libraryScope: 'default',
      kind: 'delta_sync',
      ok: false,
      error: 'fail',
    });
    expect(offlineLocalLibrarySyncRevision('srv-a')).toBe(0);
    expect(librarySyncRevision()).toBe(0);
  });

  it('changes the scoped revision when a different selected server completes', async () => {
    useAuthStore.setState({
      servers: [
        { id: 'srv-a', name: 'A', url: 'https://a.test', username: 'u', password: 'p' },
        { id: 'srv-b', name: 'B', url: 'https://b.test', username: 'u', password: 'p' },
      ],
    });
    expect(libraryScopeSyncRevision(['srv-a', 'srv-b'])).toBe(0);
    syncIdleHandlerRef.current?.({
      serverId: 'a.test', libraryScope: '', kind: 'delta_sync', ok: true,
    });
    await vi.waitFor(() => expect(libraryScopeSyncRevision(['srv-a', 'srv-b'])).toBe(1));

    syncIdleHandlerRef.current?.({
      serverId: 'b.test', libraryScope: '', kind: 'delta_sync', ok: true,
    });
    await vi.waitFor(() => expect(libraryScopeSyncRevision(['srv-a', 'srv-b'])).toBe(2));
  });

  it('bumps revision for successful background sync-idle events', async () => {
    expect(offlineLocalLibrarySyncRevision('srv-a')).toBe(0);
    syncIdleHandlerRef.current?.({
      serverId: 'a.test', libraryScope: '', kind: 'delta_sync', source: 'background', ok: true,
    });
    await vi.waitFor(() => expect(offlineLocalLibrarySyncRevision('srv-a')).toBe(1));
    expect(librarySyncRevision()).toBe(1);
  });

  it('does not publish the revision while cluster maintenance is pending', async () => {
    let release!: () => void;
    rebuildClusterMock.mockImplementationOnce(() => new Promise(resolve => {
      release = () => resolve(true);
    }));
    expect(offlineLocalLibrarySyncRevision('srv-a')).toBe(0);
    syncIdleHandlerRef.current?.({
      serverId: 'a.test', libraryScope: '', kind: 'delta_sync', ok: true,
    });
    await Promise.resolve();
    expect(offlineLocalLibrarySyncRevision('srv-a')).toBe(0);
    release();
    await vi.waitFor(() => expect(offlineLocalLibrarySyncRevision('srv-a')).toBe(1));
  });

  it('does not publish the revision when cluster maintenance fails', async () => {
    rebuildClusterMock.mockResolvedValueOnce(false);
    expect(offlineLocalLibrarySyncRevision('srv-a')).toBe(0);
    syncIdleHandlerRef.current?.({
      serverId: 'a.test', libraryScope: '', kind: 'delta_sync', ok: true,
    });
    await vi.waitFor(() => expect(rebuildClusterMock).toHaveBeenCalledOnce());
    await Promise.resolve();
    expect(offlineLocalLibrarySyncRevision('srv-a')).toBe(0);
    expect(librarySyncRevision()).toBe(0);
  });
});
