import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAuthStore } from '@/store/authStore';

const getSimilarArtists = vi.hoisted(() => vi.fn());

vi.mock('@/music-network', () => ({
  getMusicNetworkRuntime: () => ({ getSimilarArtists }),
}));
vi.mock('@/lib/api/subsonicSearch');

import { search, searchForServer } from '@/lib/api/subsonicSearch';
import { useArtistSimilarArtists } from '@/features/artist/hooks/useArtistSimilarArtists';

describe('useArtistSimilarArtists', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      activeServerId: 'srv-a',
      enrichmentPrimaryId: 'lastfm',
      audiomuseNavidromeByServer: {},
    });
    getSimilarArtists.mockResolvedValue(['Other Artist']);
    vi.mocked(searchForServer).mockResolvedValue({
      artists: [{ id: 'other-1', name: 'Other Artist', serverId: 'srv-b' }],
      albums: [],
      songs: [],
    });
  });

  it('resolves network similar artists through the detail owner server', async () => {
    const { result } = renderHook(() => useArtistSimilarArtists(
      { id: 'artist-1', name: 'Artist', serverId: 'srv-b' },
      null,
      false,
      'srv-b',
    ));

    await waitFor(() => expect(result.current.similarArtists).toEqual([
      { id: 'other-1', name: 'Other Artist', serverId: 'srv-b' },
    ]));
    expect(searchForServer).toHaveBeenCalledWith('srv-b', 'Other Artist', {
      artistCount: 3,
      albumCount: 0,
      songCount: 0,
    });
    expect(search).not.toHaveBeenCalled();
  });
});
