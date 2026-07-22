import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/subsonicClient', () => ({
  api: vi.fn(),
  apiForServer: vi.fn(),
  libraryFilterParams: () => ({}),
  libraryFilterParamsForServer: () => ({}),
  librarySelectionForServer: () => [],
}));

vi.mock('@/lib/api/subsonicLibrary', () => ({
  filterSongsToActiveLibrary: async (songs: unknown[]) => songs,
  filterSongsToServerLibrary: async (songs: unknown[]) => songs,
  similarSongsRequestCount: (count: number) => count,
}));

import { apiForServer } from '@/lib/api/subsonicClient';
import { fetchSimilarTracksRouted } from '@/lib/api/subsonicArtists';
import { useAuthStore } from '@/store/authStore';

const SID = 'srv-router';
const apiForServerMock = vi.mocked(apiForServer);

function seedServer(identity: Record<string, unknown>, probes: Record<string, unknown>) {
  useAuthStore.setState({
    activeServerId: SID,
    subsonicServerIdentityByServer: { [SID]: identity as never },
    audiomusePluginProbeByServer: {},
    instantMixProbeByServer: {},
    audiomuseNavidromeByServer: {},
    ...probes,
  } as never);
}

const SONIC_RESPONSE = { sonicMatch: [{ entry: { id: 'sonic-1', title: 'Sonic' } }] };
const SIMILAR_RESPONSE = { similarSongs: { song: [{ id: 'legacy-1', title: 'Legacy' }] } };

describe('fetchSimilarTracksRouted', () => {
  beforeEach(() => {
    apiForServerMock.mockReset();
  });

  it('prefers sonicSimilarity on Navidrome 0.62 with plugin', async () => {
    seedServer({ type: 'navidrome', serverVersion: '0.62.0', openSubsonic: true }, {
      audiomusePluginProbeByServer: { [SID]: 'present' },
    });
    apiForServerMock.mockImplementation(async (_serverId: string, endpoint: string) =>
      (endpoint === 'getSonicSimilarTracks.view' ? SONIC_RESPONSE : SIMILAR_RESPONSE) as never);

    const result = await fetchSimilarTracksRouted('seed', 10);
    expect(result.map(s => s.id)).toEqual(['sonic-1']);
    expect(apiForServerMock).toHaveBeenCalledWith(SID, 'getSonicSimilarTracks.view', expect.anything());
    expect(apiForServerMock).not.toHaveBeenCalledWith(SID, 'getSimilarSongs.view', expect.anything());
  });

  it('falls back to legacy when sonic returns empty', async () => {
    seedServer({ type: 'navidrome', serverVersion: '0.62.0', openSubsonic: true }, {
      audiomusePluginProbeByServer: { [SID]: 'present' },
    });
    apiForServerMock.mockImplementation(async (_serverId: string, endpoint: string) =>
      (endpoint === 'getSonicSimilarTracks.view' ? { sonicMatch: [] } : SIMILAR_RESPONSE) as never);

    const result = await fetchSimilarTracksRouted('seed', 10);
    expect(result.map(s => s.id)).toEqual(['legacy-1']);
    expect(apiForServerMock).toHaveBeenCalledWith(SID, 'getSonicSimilarTracks.view', expect.anything());
    expect(apiForServerMock).toHaveBeenCalledWith(SID, 'getSimilarSongs.view', expect.anything());
  });

  it('uses legacy only on Navidrome 0.62 without plugin', async () => {
    seedServer({ type: 'navidrome', serverVersion: '0.62.0', openSubsonic: true }, {
      audiomusePluginProbeByServer: { [SID]: 'absent' },
    });
    apiForServerMock.mockImplementation(async () => SIMILAR_RESPONSE as never);

    const result = await fetchSimilarTracksRouted('seed', 10);
    expect(result.map(s => s.id)).toEqual(['legacy-1']);
    expect(apiForServerMock).not.toHaveBeenCalledWith(SID, 'getSonicSimilarTracks.view', expect.anything());
    expect(apiForServerMock).toHaveBeenCalledWith(SID, 'getSimilarSongs.view', expect.anything());
  });
});
