import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  clearServer: vi.fn(),
  forgetServer: vi.fn(),
  invalidateLegacy: vi.fn(),
}));

vi.mock('@/generated/bindings', () => ({
  commands: { coverCacheClearServer: hoisted.clearServer },
}));
vi.mock('./diskSrcCache', () => ({ forgetDiskSrcForServer: hoisted.forgetServer }));
vi.mock('./imageCache', () => ({ invalidateCoverArt: hoisted.invalidateLegacy }));
vi.mock('./ref', () => ({
  radioCoverRef: () => ({
    cacheKind: 'album',
    cacheEntityId: 'ra-shared',
    fetchCoverArtId: 'ra-shared',
    serverScope: { kind: 'server', serverId: 'srv-b', url: '', username: '', password: '' },
  }),
}));
vi.mock('./storageKeys', () => ({ coverIndexKeyFromRef: () => 'b.test' }));

import { invalidateRadioCoverArtCache } from './radioCoverInvalidation';

describe('invalidateRadioCoverArtCache', () => {
  beforeEach(() => {
    hoisted.clearServer.mockReset().mockResolvedValue({ status: 'ok', data: null });
    hoisted.forgetServer.mockReset();
    hoisted.invalidateLegacy.mockReset().mockResolvedValue(undefined);
  });

  it('drops memory, legacy, and native cover entries for the station owner', async () => {
    await invalidateRadioCoverArtCache({ id: 'shared', serverId: 'srv-b' });

    expect(hoisted.forgetServer).toHaveBeenCalledWith('b.test');
    expect(hoisted.invalidateLegacy).toHaveBeenCalledWith('ra-shared', 'srv-b');
    expect(hoisted.clearServer).toHaveBeenCalledWith('b.test');
  });
});
