import { beforeEach, describe, expect, it, vi } from 'vitest';

const libraryGetGenreAlbumCounts = vi.fn();

vi.mock('@/lib/api/library', () => ({
  libraryGetGenreAlbumCounts: (...args: unknown[]) => libraryGetGenreAlbumCounts(...args),
}));

import { fetchGenreAlbumCountsDeduped } from './albumBrowseGenreCountsCache';

describe('fetchGenreAlbumCountsDeduped', () => {
  beforeEach(() => {
    libraryGetGenreAlbumCounts.mockReset();
  });

  it('deduplicates only concurrent reads so later sync revisions can reload counts', async () => {
    libraryGetGenreAlbumCounts.mockResolvedValue([{ value: 'Rock', albumCount: 1, songCount: 2 }]);

    const first = fetchGenreAlbumCountsDeduped({ serverId: 'srv-a' });
    const concurrent = fetchGenreAlbumCountsDeduped({ serverId: 'srv-a' });
    expect(first).toBe(concurrent);
    await first;

    await fetchGenreAlbumCountsDeduped({ serverId: 'srv-a' });
    expect(libraryGetGenreAlbumCounts).toHaveBeenCalledTimes(2);
  });
});
