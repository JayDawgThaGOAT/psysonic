import { beforeEach, describe, expect, it, vi } from 'vitest';

const libraryScopeComposerDetailMock = vi.fn();

vi.mock('@/lib/api/library/scopeReads', () => ({
  libraryScopeComposerDetail: (...args: unknown[]) => libraryScopeComposerDetailMock(...args),
}));

import { tryLoadComposerDetailMultiScope } from './loadComposerDetailMultiScope';

describe('tryLoadComposerDetailMultiScope', () => {
  beforeEach(() => {
    libraryScopeComposerDetailMock.mockReset();
  });

  it('maps local composer and album DTOs while preserving owners', async () => {
    libraryScopeComposerDetailMock.mockResolvedValue({
      composer: {
        serverId: 'srv-b', id: 'co-1', name: 'Composer', albumCount: 1, syncedAt: 1, rawJson: {},
      },
      albums: [{
        serverId: 'srv-b', id: 'al-1', name: 'Work', artist: 'Performer', artistId: 'ar-1',
        songCount: 3, durationSec: 600, syncedAt: 1, rawJson: {},
      }],
    });
    const scopes = [{ serverId: 'srv-a', libraryId: 'lib-a' }];

    const result = await tryLoadComposerDetailMultiScope(scopes, 'srv-b', 'co-1');

    expect(libraryScopeComposerDetailMock).toHaveBeenCalledWith('srv-b', {
      scopes,
      composerId: 'co-1',
      serverId: 'srv-b',
    });
    expect(result?.composer).toEqual(expect.objectContaining({ id: 'co-1', serverId: 'srv-b' }));
    expect(result?.albums[0]).toEqual(expect.objectContaining({ id: 'al-1', serverId: 'srv-b' }));
  });

  it('returns null when the local read fails', async () => {
    libraryScopeComposerDetailMock.mockRejectedValue(new Error('missing projection'));
    await expect(tryLoadComposerDetailMultiScope([], 'srv-b', 'co-1')).resolves.toBeNull();
  });
});
