import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/store/authStore';
import { resetAuthStore } from '@/test/helpers/storeReset';
import { setServerReachability } from '@/lib/network/serverReachability';
import { useLibraryServerReachability } from './useLibraryServerReachability';

const switchActiveServerMock = vi.hoisted(() => vi.fn());
const bootstrapIndexedServerMock = vi.hoisted(() => vi.fn());

vi.mock('@/utils/server/switchActiveServer', () => ({
  switchActiveServer: switchActiveServerMock,
}));

vi.mock('@/lib/perf/perfFlags', () => ({
  usePerfProbeFlags: () => ({ disableBackgroundPolling: true }),
}));

vi.mock('@/lib/library/librarySession', () => ({
  bootstrapIndexedServer: bootstrapIndexedServerMock,
}));

beforeEach(() => {
  resetAuthStore();
  switchActiveServerMock.mockReset();
  bootstrapIndexedServerMock.mockReset().mockResolvedValue('bound');
  switchActiveServerMock.mockImplementation(async (server: { id: string }) => {
    useAuthStore.getState().setActiveServer(server.id);
    return true;
  });
  useAuthStore.setState({
    servers: [
      { id: 'a', name: 'A', url: 'https://a.test', username: 'u', password: 'p' },
      { id: 'b', name: 'B', url: 'https://b.test', username: 'u', password: 'p' },
      { id: 'c', name: 'C', url: 'https://c.test', username: 'u', password: 'p' },
    ],
    activeServerId: 'a',
    libraryBrowseServerIds: ['a', 'b'],
    libraryBrowseScopeVersion: 0,
    isLoggedIn: true,
  });
});

describe('useLibraryServerReachability', () => {
  it('switches active server when checkbox membership changes the priority head', async () => {
    renderHook(() => useLibraryServerReachability());

    act(() => useAuthStore.getState().setLibraryBrowseServerSelected('a', false));

    await waitFor(() => expect(switchActiveServerMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'b' }),
    ));
    expect(useAuthStore.getState().activeServerId).toBe('b');
  });

  it('realigns an independently switched active server on the next checkbox change', async () => {
    renderHook(() => useLibraryServerReachability());
    act(() => useAuthStore.getState().setActiveServer('b'));
    expect(switchActiveServerMock).not.toHaveBeenCalled();

    act(() => useAuthStore.getState().setLibraryBrowseServerSelected('c', true));

    await waitFor(() => expect(switchActiveServerMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a' }),
    ));
    expect(useAuthStore.getState().activeServerId).toBe('a');
  });

  it('switches active server when reordering changes the priority head', async () => {
    renderHook(() => useLibraryServerReachability());
    const { servers } = useAuthStore.getState();

    act(() => useAuthStore.getState().setServers([servers[1], servers[0], servers[2]]));

    await waitFor(() => expect(switchActiveServerMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'b' }),
    ));
    expect(useAuthStore.getState().libraryBrowseServerIds).toEqual(['b', 'a']);
    expect(useAuthStore.getState().activeServerId).toBe('b');
  });

  it('switches to the first selected server that is not confirmed unavailable', async () => {
    renderHook(() => useLibraryServerReachability());

    act(() => setServerReachability('a', 'unavailable'));

    await waitFor(() => expect(switchActiveServerMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'b' }),
    ));
    expect(useAuthStore.getState().activeServerId).toBe('b');
    expect(useAuthStore.getState().libraryBrowseServerIds).toEqual(['a', 'b']);
  });

  it('invalidates Library reads only when availability changes the effective scope', async () => {
    renderHook(() => useLibraryServerReachability());

    act(() => setServerReachability('c', 'unavailable'));
    expect(useAuthStore.getState().libraryBrowseScopeVersion).toBe(0);

    act(() => setServerReachability('b', 'unavailable'));
    await waitFor(() => expect(useAuthStore.getState().libraryBrowseScopeVersion).toBe(1));

    act(() => setServerReachability('b', 'available'));
    await waitFor(() => expect(useAuthStore.getState().libraryBrowseScopeVersion).toBe(2));
    expect(useAuthStore.getState().libraryBrowseServerIds).toEqual(['a', 'b']);
  });

  it('rebinds a recovered indexed server without requiring an active-server or list change', async () => {
    act(() => setServerReachability('b', 'unavailable'));
    renderHook(() => useLibraryServerReachability());

    act(() => setServerReachability('b', 'available'));

    await waitFor(() => expect(bootstrapIndexedServerMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'b' }),
    ));
    expect(useAuthStore.getState().activeServerId).toBe('a');
    expect(switchActiveServerMock).not.toHaveBeenCalled();
  });
});
