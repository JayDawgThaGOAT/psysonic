import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibrarySyncIdlePayload } from '@/lib/api/library/dto';
import { useAuthStore } from '@/store/authStore';

const syncIdleHandlerRef = vi.hoisted(() => ({
  current: null as ((payload: LibrarySyncIdlePayload) => void) | null,
}));
vi.mock('@/lib/api/library/events', () => ({
  subscribeLibrarySyncIdle: vi.fn(async (handler: (payload: LibrarySyncIdlePayload) => void) => {
    syncIdleHandlerRef.current = handler;
    return () => {
      syncIdleHandlerRef.current = null;
    };
  }),
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
    syncIdleHandlerRef.current = null;
  });

  it('bumps revision after Rust publishes derived-ready sync idle', () => {
    expect(offlineLocalLibrarySyncRevision('srv-a')).toBe(0);
    syncIdleHandlerRef.current?.({
      serverId: 'a.test',
      libraryScope: 'default',
      kind: 'delta_sync',
      ok: true,
      error: null,
    });
    expect(offlineLocalLibrarySyncRevision('srv-a')).toBe(1);
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

  it('changes the scoped revision when a different selected server completes', () => {
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
    expect(libraryScopeSyncRevision(['srv-a', 'srv-b'])).toBe(1);

    syncIdleHandlerRef.current?.({
      serverId: 'b.test', libraryScope: '', kind: 'delta_sync', ok: true,
    });
    expect(libraryScopeSyncRevision(['srv-a', 'srv-b'])).toBe(2);
  });

  it('bumps revision for successful background sync-idle events', () => {
    expect(offlineLocalLibrarySyncRevision('srv-a')).toBe(0);
    syncIdleHandlerRef.current?.({
      serverId: 'a.test', libraryScope: '', kind: 'delta_sync', source: 'background', ok: true,
    });
    expect(offlineLocalLibrarySyncRevision('srv-a')).toBe(1);
    expect(librarySyncRevision()).toBe(1);
  });
});
