import { describe, expect, it } from 'vitest';
import {
  mergeSeenNewReleaseIdsCap,
  newReleasesSeenStorageKey,
} from '@/features/sidebar/utils/sidebarHelpers';

describe('newReleasesSeenStorageKey', () => {
  it('uses an empty-scope segment when no selected libraries exist', () => {
    expect(newReleasesSeenStorageKey('')).toBe(
      'psy_new_releases_unread_seen_v2:empty',
    );
  });

  it('keeps selected server and library pairs in the scope key', () => {
    expect(newReleasesSeenStorageKey('srv-a:a2|srv-b:b1')).toBe(
      'psy_new_releases_unread_seen_v2:srv-a:a2|srv-b:b1',
    );
  });
});

describe('mergeSeenNewReleaseIdsCap', () => {
  it('counts a repeated globally unique album id once', () => {
    expect(mergeSeenNewReleaseIdsCap(['older'], ['new', 'new', 'older'], 10)).toEqual([
      'new', 'older',
    ]);
  });
});
