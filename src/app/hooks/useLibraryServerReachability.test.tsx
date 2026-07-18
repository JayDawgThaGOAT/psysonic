import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/store/authStore';
import { resetAuthStore } from '@/test/helpers/storeReset';
import { setServerReachability } from '@/lib/network/serverReachability';
import { useLibraryServerReachability } from './useLibraryServerReachability';

vi.mock('@/lib/perf/perfFlags', () => ({
  usePerfProbeFlags: () => ({ disableBackgroundPolling: true }),
}));

beforeEach(() => {
  resetAuthStore();
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
});
