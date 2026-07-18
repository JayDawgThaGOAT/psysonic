import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePlaylistSuggestions } from '@/features/playlist/hooks/usePlaylistSuggestions';
import type { SubsonicSong } from '@/lib/api/subsonicTypes';

const getRandomSongsForServerMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/subsonicLibrary', () => ({
  getRandomSongs: vi.fn(),
  getRandomSongsForServer: getRandomSongsForServerMock,
}));

afterEach(() => {
  vi.useRealTimers();
});

describe('usePlaylistSuggestions', () => {
  it('drops an in-flight result when the playlist owner changes', async () => {
    vi.useFakeTimers();
    let resolveOld!: (songs: SubsonicSong[]) => void;
    getRandomSongsForServerMock.mockReturnValue(
      new Promise<SubsonicSong[]>(resolve => { resolveOld = resolve; }),
    );
    const songs = [{ id: 'seed', title: 'Seed', genre: 'Jazz', serverId: 'server-a' }] as SubsonicSong[];
    const { result, rerender } = renderHook(
      ({ playlistId, serverId }) => usePlaylistSuggestions(songs, playlistId, serverId),
      { initialProps: { playlistId: 'playlist-a', serverId: 'server-a' } },
    );

    await act(async () => {
      vi.advanceTimersByTime(0);
      await Promise.resolve();
    });
    expect(getRandomSongsForServerMock).toHaveBeenCalledWith('server-a', 25, 'Jazz');

    rerender({ playlistId: 'playlist-b', serverId: 'server-b' });
    await act(async () => {
      resolveOld([{ id: 'old-result', title: 'Old', serverId: 'server-a' } as SubsonicSong]);
      await Promise.resolve();
    });

    expect(result.current.suggestions).toEqual([]);
  });
});
