import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newReleasesSeenStorageKey } from '@/features/sidebar/utils/sidebarHelpers';

const loadLocalNewReleasesMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/library/newReleasesLocal', () => ({
  loadLocalNewReleases: loadLocalNewReleasesMock,
}));

import { useSidebarNewReleasesUnread } from '@/features/sidebar/hooks/useSidebarNewReleasesUnread';

const DEBOUNCE_MS = 400;

function releases(...ids: string[]) {
  return {
    albums: ids.map(id => ({ id })),
    hasMore: false,
    genreCounts: [],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => { resolve = res; });
  return { promise, resolve };
}

describe('useSidebarNewReleasesUnread', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    loadLocalNewReleasesMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('ignores an in-flight result as soon as a new scope is scheduled', async () => {
    localStorage.setItem(newReleasesSeenStorageKey('old'), JSON.stringify(['old-seen']));
    localStorage.setItem(newReleasesSeenStorageKey('new'), JSON.stringify(['new-seen']));
    const oldRequest = deferred<ReturnType<typeof releases>>();
    loadLocalNewReleasesMock
      .mockReturnValueOnce(oldRequest.promise)
      .mockResolvedValueOnce(releases('new-seen'));

    const view = renderHook(
      ({ anchorServerId, scopeFingerprint }) => useSidebarNewReleasesUnread({
        anchorServerId,
        scopes: [{ serverId: anchorServerId, libraryId: `lib-${anchorServerId}` }],
        scopeFingerprint,
        isLoggedIn: true,
        pathname: '/',
      }),
      { initialProps: { anchorServerId: 'old', scopeFingerprint: 'old' } },
    );

    await act(async () => { await vi.advanceTimersByTimeAsync(DEBOUNCE_MS); });
    expect(loadLocalNewReleasesMock).toHaveBeenCalledTimes(1);

    view.rerender({ anchorServerId: 'new', scopeFingerprint: 'new' });
    await act(async () => {
      oldRequest.resolve(releases('old-seen', 'old-unread'));
      await oldRequest.promise;
    });
    expect(view.result.current).toBe(0);

    await act(async () => { await vi.advanceTimersByTimeAsync(DEBOUNCE_MS); });
    expect(loadLocalNewReleasesMock).toHaveBeenCalledTimes(2);
    expect(loadLocalNewReleasesMock.mock.calls[1]?.[5]).toBe(false);
    expect(view.result.current).toBe(0);
  });

  it('does not carry a cancelled mark-as-seen intent after leaving the page', async () => {
    const storageKey = newReleasesSeenStorageKey('scope');
    localStorage.setItem(storageKey, JSON.stringify(['seen']));
    loadLocalNewReleasesMock.mockResolvedValue(releases('seen', 'unread'));

    const view = renderHook(
      ({ pathname }) => useSidebarNewReleasesUnread({
        anchorServerId: 'server',
        scopes: [{ serverId: 'server', libraryId: 'library' }],
        scopeFingerprint: 'scope',
        isLoggedIn: true,
        pathname,
      }),
      { initialProps: { pathname: '/new-releases' } },
    );

    await act(async () => { await vi.advanceTimersByTimeAsync(DEBOUNCE_MS); });
    expect(view.result.current).toBe(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(5_000 - DEBOUNCE_MS); });
    view.rerender({ pathname: '/' });
    await act(async () => { await vi.advanceTimersByTimeAsync(DEBOUNCE_MS); });

    expect(view.result.current).toBe(1);
    expect(JSON.parse(localStorage.getItem(storageKey) ?? '[]')).toEqual(['seen']);
  });
});
