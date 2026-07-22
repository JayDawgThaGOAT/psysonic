import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetAuthStore } from '@/test/helpers/storeReset';
import { useAuthStore } from '@/store/authStore';
import { useLibraryIndexStore } from '@/store/libraryIndexStore';
import type { LibrarySyncIdlePayload, LibrarySyncProgressPayload, SyncStateDto } from '@/lib/api/library';
import {
  resetServerReachabilitySnapshot,
  setServerReachability,
} from '@/lib/network/serverReachability';
import * as serverReachability from '@/lib/network/serverReachability';

const mocks = vi.hoisted(() => ({
  libraryGetStatus: vi.fn(),
  bootstrapAllIndexedServers: vi.fn(),
  bootstrapIndexedServer: vi.fn(),
  progressHandler: null as ((payload: LibrarySyncProgressPayload) => void) | null,
  idleHandler: null as ((payload: LibrarySyncIdlePayload) => void) | null,
}));

vi.mock('@/lib/api/library', () => ({
  libraryGetStatus: (...args: unknown[]) => mocks.libraryGetStatus(...args),
  librarySyncCancel: vi.fn(async () => undefined),
  subscribeLibrarySyncProgress: vi.fn(async (handler: (payload: LibrarySyncProgressPayload) => void) => {
    mocks.progressHandler = handler;
    return () => {
      if (mocks.progressHandler === handler) mocks.progressHandler = null;
    };
  }),
  subscribeLibrarySyncIdle: vi.fn(async (handler: (payload: LibrarySyncIdlePayload) => void) => {
    mocks.idleHandler = handler;
    return () => {
      if (mocks.idleHandler === handler) mocks.idleHandler = null;
    };
  }),
}));

vi.mock('@/lib/library/librarySession', () => ({
  bootstrapAllIndexedServers: (...args: unknown[]) => mocks.bootstrapAllIndexedServers(...args),
  bootstrapIndexedServer: (...args: unknown[]) => mocks.bootstrapIndexedServer(...args),
}));

vi.mock('@/lib/library/librarySyncQueue', () => ({
  clearPendingLibrarySync: vi.fn(() => 0),
  enqueueLibrarySync: vi.fn(async () => undefined),
}));

vi.mock('@/lib/dom/toast', () => ({ showToast: vi.fn() }));

import { useLibraryIndexSync } from './useLibraryIndexSync';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => { resolve = res; });
  return { promise, resolve };
}

function readyStatus(serverId: string): SyncStateDto {
  return {
    serverId,
    libraryScope: '',
    syncPhase: 'ready',
    capabilityFlags: 0,
    libraryTier: 'unknown',
  };
}

function buildingStatus(serverId: string): SyncStateDto {
  return {
    serverId,
    libraryScope: '',
    syncPhase: 'initial_sync',
    capabilityFlags: 0,
    libraryTier: 'unknown',
    localTrackCount: 0,
    serverTrackCount: 100,
  };
}

function seedServers() {
  useAuthStore.setState({
    activeServerId: 'a',
    servers: [
      { id: 'a', name: 'A', url: 'https://a.test', username: 'u', password: 'p' },
      { id: 'b', name: 'B', url: 'https://b.test', username: 'u', password: 'p' },
    ],
  });
}

describe('useLibraryIndexSync concurrency', () => {
  beforeEach(() => {
    vi.useRealTimers();
    resetAuthStore();
    resetServerReachabilitySnapshot();
    useLibraryIndexStore.setState({ masterEnabled: true });
    mocks.libraryGetStatus.mockReset();
    mocks.bootstrapAllIndexedServers.mockReset();
    mocks.bootstrapIndexedServer.mockReset();
    mocks.progressHandler = null;
    mocks.idleHandler = null;
    seedServers();
  });

  it('single-flights status polling and batches the map update after every server settles', async () => {
    const a = deferred<SyncStateDto>();
    const b = deferred<SyncStateDto>();
    mocks.bootstrapAllIndexedServers.mockResolvedValue({ 'a.test': 'bound', 'b.test': 'bound' });
    mocks.libraryGetStatus.mockImplementation((serverId: string) => (
      serverId === 'a.test' ? a.promise : b.promise
    ));

    const { result, unmount } = renderHook(() => useLibraryIndexSync());
    await waitFor(() => expect(mocks.libraryGetStatus).toHaveBeenCalledTimes(2));

    await act(async () => { a.resolve(readyStatus('a.test')); });
    expect(result.current.statusByServer['a.test']).toBeNull();
    expect(result.current.statusByServer['b.test']).toBeNull();
    expect(mocks.libraryGetStatus).toHaveBeenCalledTimes(2);

    await act(async () => { b.resolve(readyStatus('b.test')); });
    await waitFor(() => expect(result.current.statusByServer['b.test']?.syncPhase).toBe('ready'));
    expect(result.current.statusByServer['a.test']?.syncPhase).toBe('ready');
    unmount();
  });

  it('discards status settlements from an obsolete server generation', async () => {
    const oldA = deferred<SyncStateDto>();
    const oldB = deferred<SyncStateDto>();
    mocks.bootstrapAllIndexedServers.mockImplementation(async () => Object.fromEntries(
      useAuthStore.getState().servers.map(server => [new URL(server.url).host, 'bound']),
    ));
    mocks.libraryGetStatus.mockImplementation((serverId: string) => {
      if (serverId === 'a.test') return oldA.promise;
      if (serverId === 'b.test') return oldB.promise;
      return Promise.resolve(readyStatus(serverId));
    });

    const { result, unmount } = renderHook(() => useLibraryIndexSync());
    await waitFor(() => expect(mocks.libraryGetStatus).toHaveBeenCalledTimes(2));
    act(() => {
      useAuthStore.setState({
        activeServerId: 'c',
        servers: [{ id: 'c', name: 'C', url: 'https://c.test', username: 'u', password: 'p' }],
      });
    });
    await waitFor(() => expect(result.current.statusByServer['c.test']?.syncPhase).toBe('ready'));

    await act(async () => {
      oldA.resolve(readyStatus('a.test'));
      oldB.resolve(readyStatus('b.test'));
    });
    expect(result.current.statusByServer['a.test']).toBeUndefined();
    expect(result.current.statusByServer['b.test']).toBeUndefined();
    unmount();
  });

  it('retries offline servers concurrently, applies settlements independently, and does not overlap retries', async () => {
    vi.useFakeTimers();
    const retryA = deferred<'bound'>();
    const retryB = deferred<'bound'>();
    mocks.bootstrapAllIndexedServers.mockResolvedValue({ 'a.test': 'offline', 'b.test': 'offline' });
    mocks.libraryGetStatus.mockImplementation(async (serverId: string) => readyStatus(serverId));
    mocks.bootstrapIndexedServer.mockImplementation((server: { id: string }) => (
      server.id === 'a' ? retryA.promise : retryB.promise
    ));

    const { result, unmount } = renderHook(() => useLibraryIndexSync());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.connectionByServer).toMatchObject({
      'a.test': 'offline',
      'b.test': 'offline',
    });

    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(mocks.bootstrapIndexedServer).toHaveBeenCalledTimes(2);
    await act(async () => { retryA.resolve('bound'); });
    expect(result.current.connectionByServer['a.test']).toBe('online');
    expect(result.current.connectionByServer['b.test']).toBe('offline');

    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(mocks.bootstrapIndexedServer).toHaveBeenCalledTimes(2);
    await act(async () => { retryB.resolve('bound'); });
    expect(result.current.connectionByServer['b.test']).toBe('online');
    unmount();
    vi.useRealTimers();
  });

  it('updates connection controls immediately from the shared reachability channel', async () => {
    mocks.bootstrapAllIndexedServers.mockResolvedValue({ 'a.test': 'offline', 'b.test': 'bound' });
    mocks.libraryGetStatus.mockImplementation(async (serverId: string) => readyStatus(serverId));

    const { result, unmount } = renderHook(() => useLibraryIndexSync());
    await waitFor(() => expect(result.current.connectionByServer).toEqual({
      'a.test': 'offline',
      'b.test': 'online',
    }));

    act(() => setServerReachability('a', 'available'));
    expect(result.current.connectionByServer['a.test']).toBe('online');
    unmount();
  });

  it('clears bootstrapping when the server generation invalidates an obsolete bootstrap', async () => {
    const obsolete = deferred<Record<string, 'bound'>>();
    mocks.bootstrapAllIndexedServers
      .mockReturnValueOnce(obsolete.promise)
      .mockResolvedValueOnce({ 'c.test': 'bound' });
    mocks.libraryGetStatus.mockImplementation(async (serverId: string) => readyStatus(serverId));

    const { result, unmount } = renderHook(() => useLibraryIndexSync());
    await waitFor(() => expect(result.current.bootstrapping).toBe(true));
    act(() => {
      useAuthStore.setState({
        activeServerId: 'c',
        servers: [{ id: 'c', name: 'C', url: 'https://c.test', username: 'u', password: 'p' }],
      });
    });

    await waitFor(() => expect(result.current.statusByServer['c.test']?.syncPhase).toBe('ready'));
    expect(result.current.bootstrapping).toBe(false);
    await act(async () => { obsolete.resolve({ 'a.test': 'bound' }); });
    expect(result.current.bootstrapping).toBe(false);
    unmount();
  });

  it('clears stale busy state when a busy server is removed or remapped', async () => {
    mocks.bootstrapAllIndexedServers.mockResolvedValue({ 'a.test': 'bound', 'b.test': 'bound' });
    mocks.libraryGetStatus.mockImplementation(async (serverId: string) => readyStatus(serverId));
    const { result, unmount } = renderHook(() => useLibraryIndexSync());
    await waitFor(() => expect(mocks.progressHandler).not.toBeNull());

    act(() => mocks.progressHandler?.({
      serverId: 'a.test', libraryScope: '', kind: 'phase_changed', phase: 'syncing',
    } as LibrarySyncProgressPayload));
    expect(result.current.busyServerId).toBe('a.test');

    act(() => useAuthStore.setState({
      activeServerId: 'b',
      servers: [{ id: 'b', name: 'B', url: 'https://b.test', username: 'u', password: 'p' }],
    }));
    await waitFor(() => expect(result.current.busyServerId).toBeNull());
    await waitFor(() => expect(result.current.statusByServer['b.test']).toBeTruthy());

    act(() => mocks.progressHandler?.({
      serverId: 'b.test', libraryScope: '', kind: 'phase_changed', phase: 'syncing',
    } as LibrarySyncProgressPayload));
    await waitFor(() => expect(result.current.busyServerId).toBe('b.test'));
    act(() => useAuthStore.setState({
      servers: [{ id: 'b', name: 'B', url: 'https://c.test', username: 'u', password: 'p' }],
    }));
    await waitFor(() => expect(result.current.busyServerId).toBeNull());
    unmount();
  });

  it('prunes ingest counters when a server leaves the indexed set', async () => {
    mocks.bootstrapAllIndexedServers.mockImplementation(async () => Object.fromEntries(
      useAuthStore.getState().servers.map(server => [new URL(server.url).host, 'bound']),
    ));
    mocks.libraryGetStatus.mockImplementation(async (serverId: string) => buildingStatus(serverId));
    const { result, unmount } = renderHook(() => useLibraryIndexSync());
    await waitFor(() => expect(mocks.progressHandler).not.toBeNull());
    act(() => mocks.progressHandler?.({
      serverId: 'a.test', libraryScope: '', kind: 'ingest_page', ingestedTotal: 9,
    } as LibrarySyncProgressPayload));
    expect(result.current.progressByServer['a.test']).toContain('9');

    act(() => useAuthStore.setState({
      activeServerId: 'b',
      servers: [{ id: 'b', name: 'B', url: 'https://b.test', username: 'u', password: 'p' }],
    }));
    await waitFor(() => expect(result.current.progressByServer['a.test']).toBeUndefined());
    act(() => useAuthStore.setState({
      activeServerId: 'a',
      servers: [
        { id: 'a', name: 'A', url: 'https://a.test', username: 'u', password: 'p' },
        { id: 'b', name: 'B', url: 'https://b.test', username: 'u', password: 'p' },
      ],
    }));
    await waitFor(() => expect(result.current.progressByServer['a.test']).toContain('0'));
    act(() => mocks.progressHandler?.({
      serverId: 'a.test', libraryScope: '', kind: 'ingest_page', ingestedTotal: 1,
    } as LibrarySyncProgressPayload));
    await waitFor(() => expect(result.current.progressByServer['a.test']).toContain('1'));
    expect(result.current.progressByServer['a.test']).not.toContain('9');
    unmount();
  });

  it('publishes bootstrap results against the active server at settlement time', async () => {
    const bootstrap = deferred<Record<string, 'bound'>>();
    mocks.bootstrapAllIndexedServers.mockReturnValue(bootstrap.promise);
    mocks.libraryGetStatus.mockImplementation(async (serverId: string) => readyStatus(serverId));
    const publish = vi.spyOn(serverReachability, 'publishServerConnectionStatus');
    const { unmount } = renderHook(() => useLibraryIndexSync());
    await waitFor(() => expect(mocks.bootstrapAllIndexedServers).toHaveBeenCalledOnce());

    act(() => useAuthStore.setState({ activeServerId: 'b' }));
    await act(async () => {
      bootstrap.resolve({ 'a.test': 'bound', 'b.test': 'bound' });
    });
    await waitFor(() => expect(publish).toHaveBeenCalledWith('b', 'online', true));
    expect(publish).toHaveBeenCalledWith('a', 'online', false);
    publish.mockRestore();
    unmount();
  });
});
