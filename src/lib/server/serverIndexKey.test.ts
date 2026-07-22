import { beforeEach, describe, expect, it, vi } from 'vitest';

const servers = vi.hoisted(() => [] as Array<{ id: string; url: string }>);

vi.mock('@/store/authStore', () => ({
  useAuthStore: {
    getState: () => ({ servers }),
  },
}));

import { resolveStorageServerIndexKey } from '@/lib/server/serverIndexKey';

const PROFILE_ID = '7d9f7c36-1c55-4a6f-ae24-87ab823f5b61';

beforeEach(() => {
  servers.splice(0, servers.length);
});

describe('resolveStorageServerIndexKey', () => {
  it('resolves a known profile UUID through its primary URL', () => {
    servers.push({ id: PROFILE_ID, url: 'https://music.example.test/subsonic/' });
    expect(resolveStorageServerIndexKey(PROFILE_ID)).toBe('music.example.test/subsonic');
  });

  it('rejects an unknown profile UUID instead of using it as a storage key', () => {
    expect(resolveStorageServerIndexKey('9ee02895-4d12-4faa-9a9f-3fae22b64d18')).toBeNull();
  });

  it('normalizes a primary URL into the existing address-derived key', () => {
    expect(resolveStorageServerIndexKey('https://music.example.test/subsonic/'))
      .toBe('music.example.test/subsonic');
  });

  it('keeps an existing URL-derived index key stable', () => {
    expect(resolveStorageServerIndexKey('music.example.test/subsonic'))
      .toBe('music.example.test/subsonic');
  });

  it('rejects empty input', () => {
    expect(resolveStorageServerIndexKey('   ')).toBeNull();
  });
});
