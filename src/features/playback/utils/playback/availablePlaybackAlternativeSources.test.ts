import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  hasLocalPlaybackUrl: vi.fn(),
  isServerReachable: vi.fn(),
}));

vi.mock('@/store/localPlaybackResolve', () => ({
  hasLocalPlaybackUrl: mocks.hasLocalPlaybackUrl,
}));
vi.mock('@/lib/network/subsonicNetworkGuard', () => ({
  isSubsonicServerReachable: mocks.isServerReachable,
}));

import { availablePlaybackAlternativeSources } from './availablePlaybackAlternativeSources';
import { resetAuthStore } from '@/test/helpers/storeReset';
import { makeServer } from '@/test/helpers/factories';
import { useAuthStore } from '@/store/authStore';

const source = (serverId: string, id: string) => ({
  serverId,
  id,
  libraryId: '',
  priority: 0,
  durationSec: 180,
  suffix: 'flac',
  bitRate: 1_000,
  sizeBytes: 30_000_000,
  starredAt: null,
  userRating: null,
});

beforeEach(() => {
  resetAuthStore();
  Object.values(mocks).forEach(mock => mock.mockReset());
});

describe('availablePlaybackAlternativeSources', () => {
  it('keeps reachable or local copies and labels their server profiles', () => {
    const serverB = makeServer({ id: 'srv-b', name: 'Beta', url: 'https://b.test' });
    const serverC = makeServer({ id: 'srv-c', name: 'Gamma', url: 'https://c.test' });
    useAuthStore.setState({ servers: [serverB, serverC], activeServerId: serverB.id });
    mocks.hasLocalPlaybackUrl.mockImplementation((id: string) => id === 'local-copy');
    mocks.isServerReachable.mockImplementation((serverId: string) => serverId !== serverC.id);

    const available = availablePlaybackAlternativeSources([
      source(serverB.id, 'remote-copy'),
      source(serverC.id, 'unreachable-copy'),
      source(serverC.id, 'local-copy'),
    ]);

    expect(available).toEqual([
      expect.objectContaining({ id: 'remote-copy', local: false, serverLabel: 'Beta' }),
      expect.objectContaining({ id: 'local-copy', local: true, serverLabel: 'Gamma' }),
    ]);
  });
});
