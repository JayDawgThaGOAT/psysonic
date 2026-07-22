import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '@/store/authStore';
import { orbitActionServerMatches, orbitServerMatches } from '@/features/orbit/utils/orbitServerScope';

beforeEach(() => {
  useAuthStore.setState({
    servers: [
      {
        id: 'srv-owner',
        url: 'https://music.example.test',
        name: 'Owner',
        username: 'owner',
        password: 'secret',
      },
    ],
  });
});

describe('orbitServerMatches', () => {
  it('matches a profile id to its durable queue key', () => {
    expect(orbitServerMatches('srv-owner', 'music.example.test')).toBe(true);
  });

  it('rejects ownerless and different-server tracks', () => {
    expect(orbitServerMatches('srv-owner', undefined)).toBe(false);
    expect(orbitServerMatches('srv-owner', 'other.example.test')).toBe(false);
  });

  it('accepts ownerless legacy actions only while the session owner is active', () => {
    expect(orbitActionServerMatches('srv-owner', undefined, 'srv-owner')).toBe(true);
    expect(orbitActionServerMatches('srv-owner', undefined, 'other.example.test')).toBe(false);
  });
});
