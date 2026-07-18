import type { TFunction } from 'i18next';
import { describe, expect, it, vi } from 'vitest';
import { defaultSmartFilters } from '@/features/playlist/utils/playlistsSmart';
import { runPlaylistsSaveSmart } from '@/features/playlist/utils/runPlaylistsSaveSmart';

const ndUpdateSmartPlaylistMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/navidromeSmart', () => ({
  ndCreateSmartPlaylist: vi.fn(),
  ndUpdateSmartPlaylist: ndUpdateSmartPlaylistMock,
}));

vi.mock('@/features/playlist/store/playlistStore', () => ({
  usePlaylistStore: {
    getState: () => ({ playlists: [] }),
  },
}));

vi.mock('@/lib/dom/toast', () => ({ showToast: vi.fn() }));

function makeDeps() {
  return {
    isNavidromeServer: true,
    serverId: 'server-b',
    smartFilters: { ...defaultSmartFilters, name: 'Owned mix' },
    allGenres: ['Jazz'],
    editingSmartId: 'smart-1',
    playlists: [],
    fetchPlaylists: vi.fn(async () => undefined),
    t: ((key: string) => key) as TFunction,
    setPendingSmart: vi.fn(),
    setCreatingSmart: vi.fn(),
    setEditingSmartId: vi.fn(),
    setSmartFilters: vi.fn(),
    setGenreQuery: vi.fn(),
    setCreatingSmartBusy: vi.fn(),
    setEditingSmartServerId: vi.fn(),
  };
}

describe('runPlaylistsSaveSmart', () => {
  it('clears the edited owner after a successful save', async () => {
    ndUpdateSmartPlaylistMock.mockResolvedValue(undefined);
    const deps = makeDeps();

    await runPlaylistsSaveSmart(deps);

    expect(ndUpdateSmartPlaylistMock).toHaveBeenCalledWith(
      'smart-1', 'psy-smart-Owned mix', expect.any(Object), true, 'server-b',
    );
    expect(deps.setEditingSmartServerId).toHaveBeenCalledWith(null);
    expect(deps.setCreatingSmart).toHaveBeenCalledWith(false);
  });

  it('does not close a newer editor when an older save completes', async () => {
    let resolveSave!: () => void;
    ndUpdateSmartPlaylistMock.mockReturnValue(new Promise<void>(resolve => { resolveSave = resolve; }));
    const deps = makeDeps();
    let current = true;
    const save = runPlaylistsSaveSmart({ ...deps, isCurrent: () => current });

    current = false;
    resolveSave();
    await save;

    expect(deps.fetchPlaylists).not.toHaveBeenCalled();
    expect(deps.setCreatingSmart).not.toHaveBeenCalled();
    expect(deps.setEditingSmartServerId).not.toHaveBeenCalled();
    expect(deps.setCreatingSmartBusy).not.toHaveBeenCalledWith(false);
  });
});
