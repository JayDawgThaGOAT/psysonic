import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '@/store/authStore';
import { resetAuthStore } from '@/test/helpers/storeReset';
import {
  deriveEffectiveLibraryBrowseServerIds,
  deriveLibraryBrowseScope,
  getLibraryBrowseScope,
} from './libraryBrowseScope';

beforeEach(resetAuthStore);

describe('getLibraryBrowseScope', () => {
  it('builds concrete pairs in server and folder priority order', () => {
    useAuthStore.setState({
      servers: [
        { id: 'a', name: 'A', url: 'https://a.test', username: 'u', password: 'p' },
        { id: 'b', name: 'B', url: 'https://b.test', username: 'u', password: 'p' },
      ],
      activeServerId: 'b',
      libraryBrowseServerIds: ['a', 'b'],
      musicFoldersByServer: {
        a: [{ id: 'a1', name: 'A1' }, { id: 'a2', name: 'A2' }],
        b: [{ id: 'b1', name: 'B1' }],
      },
      libraryBrowseSelectionByServer: { a: ['a2', 'a1'], b: [] },
    });

    expect(getLibraryBrowseScope()).toEqual({
      anchorServerId: 'a',
      pairs: [
        { serverId: 'a', libraryId: 'a2' },
        { serverId: 'a', libraryId: 'a1' },
        { serverId: 'b', libraryId: 'b1' },
      ],
      fingerprint: JSON.stringify([['a', ['a2', 'a1']], ['b', ['b1']]]),
      multiServer: true,
    });
  });

  it('keeps the persisted server priority independent of the active connection', () => {
    const scope = deriveLibraryBrowseScope({
      servers: [{ id: 'primary' }, { id: 'active' }],
      activeServerId: 'active',
      libraryBrowseServerIds: ['primary', 'active'],
      musicFoldersByServer: {},
      libraryBrowseSelectionByServer: {},
    });

    expect(scope.anchorServerId).toBe('primary');
    expect(scope.multiServer).toBe(true);
    expect(scope.fingerprint).toBe(JSON.stringify([['primary', []], ['active', []]]));
  });

  it('excludes confirmed unavailable servers without changing persisted membership', () => {
    const state = {
      servers: [{ id: 'primary' }, { id: 'secondary' }],
      activeServerId: 'primary',
      libraryBrowseServerIds: ['primary', 'secondary'],
      musicFoldersByServer: {
        primary: [{ id: 'primary-music' }],
        secondary: [{ id: 'secondary-music' }],
      },
      libraryBrowseSelectionByServer: {},
    };

    expect(deriveEffectiveLibraryBrowseServerIds(state, new Set(['primary'])))
      .toEqual(['secondary']);
    expect(deriveLibraryBrowseScope(state, new Set(['primary']))).toEqual({
      anchorServerId: 'secondary',
      pairs: [{ serverId: 'secondary', libraryId: 'secondary-music' }],
      fingerprint: JSON.stringify([['secondary', ['secondary-music']]]),
      multiServer: false,
    });
    expect(state.libraryBrowseServerIds).toEqual(['primary', 'secondary']);
  });

  it('returns an empty effective scope when every selected server is unavailable', () => {
    const scope = deriveLibraryBrowseScope({
      servers: [{ id: 'a' }, { id: 'b' }],
      activeServerId: 'a',
      libraryBrowseServerIds: ['a', 'b'],
      musicFoldersByServer: { a: [{ id: 'a1' }], b: [{ id: 'b1' }] },
      libraryBrowseSelectionByServer: {},
    }, new Set(['a', 'b']));

    expect(scope).toEqual({
      anchorServerId: null,
      pairs: [],
      fingerprint: '',
      multiServer: false,
    });
  });

  it('falls back defensively when persisted membership has no valid server', () => {
    const scope = deriveLibraryBrowseScope({
      servers: [{ id: 'first' }, { id: 'active' }],
      activeServerId: 'active',
      libraryBrowseServerIds: ['missing'],
      musicFoldersByServer: { active: [{ id: 'music' }] },
      libraryBrowseSelectionByServer: {},
    });

    expect(scope).toEqual({
      anchorServerId: 'active',
      pairs: [],
      fingerprint: '',
      multiServer: false,
    });
  });
});
