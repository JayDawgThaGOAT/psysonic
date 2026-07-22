import { describe, expect, it } from 'vitest';
import {
  clearBecauseYouLikeCache,
  readBecauseYouLikeCache,
  writeBecauseYouLikeCache,
} from '@/features/home/store/becauseYouLikeCache';

describe('becauseYouLikeCache', () => {
  it('matches the complete scope identity', () => {
    clearBecauseYouLikeCache();
    writeBecauseYouLikeCache({
      scopeKey: 'srv-1\u0001srv-2',
      scopeVersion: 1,
      anchor: { id: 'a1', name: 'Artist', serverId: 'srv-2' },
      recs: [{
        id: 'alb-1',
        name: 'Album',
        artist: 'Artist',
        artistId: 'a1',
        songCount: 1,
        duration: 1,
        serverId: 'srv-2',
      }],
    });
    expect(readBecauseYouLikeCache('srv-1\u0001srv-2', 1)?.recs).toHaveLength(1);
    expect(readBecauseYouLikeCache('srv-1', 1)).toBeNull();
    expect(readBecauseYouLikeCache('srv-1\u0001srv-2', 2)).toBeNull();
  });
});
