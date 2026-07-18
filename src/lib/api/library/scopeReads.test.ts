import { beforeEach, describe, expect, it } from 'vitest';
import { onInvoke } from '@/test/mocks/tauri';
import {
  libraryScopeAlbumDetail,
  libraryScopeArtistDetail,
  libraryScopeListAlbums,
  libraryScopeListArtists,
  libraryScopeListMainstageAlbums,
  libraryScopeMostPlayed,
  libraryScopeSearchTracks,
  libraryScopeStatistics,
  type LibraryScopePair,
} from './scopeReads';
import { useAuthStore } from '@/store/authStore';

const scopes: LibraryScopePair[] = [
  { serverId: 'profile-s1', libraryId: 'lib-a' },
  { serverId: 'profile-s1', libraryId: 'lib-b' },
];

beforeEach(() => {
  useAuthStore.setState({
    servers: [
      {
        id: 'profile-s1',
        name: 'S1',
        url: 'https://s1.example',
        username: 'u',
        password: 'p',
      },
      {
        id: 'profile-s2',
        name: 'S2',
        url: 'https://s2.example',
        username: 'u',
        password: 'p',
      },
    ],
    activeServerId: 'profile-s1',
  });
});

describe('libraryScopeListAlbums', () => {
  it('invokes library_scope_list_albums with index-keyed scopes', async () => {
    let captured: unknown;
    onInvoke('library_scope_list_albums', (args) => {
      captured = args;
      return [];
    });
    await libraryScopeListAlbums('profile-s1', { scopes, limit: 50 });
    expect(captured).toEqual({
      request: {
        scopes: [
          { serverId: 's1.example', libraryId: 'lib-a' },
          { serverId: 's1.example', libraryId: 'lib-b' },
        ],
        limit: 50,
      },
    });
  });
});

describe('libraryScopeListArtists', () => {
  it('invokes library_scope_list_artists with request.scopes', async () => {
    let captured: unknown;
    onInvoke('library_scope_list_artists', (args) => {
      captured = args;
      return [];
    });
    await libraryScopeListArtists('profile-s1', { scopes });
    expect(captured).toEqual({
      request: {
        scopes: [
          { serverId: 's1.example', libraryId: 'lib-a' },
          { serverId: 's1.example', libraryId: 'lib-b' },
        ],
      },
    });
  });
});

describe('libraryScopeStatistics', () => {
  it('maps every selected profile server to its index key', async () => {
    let captured: unknown;
    onInvoke('library_scope_statistics', (args) => {
      captured = args;
      return { artistCount: 0, albumCount: 0, songCount: 0, playtimeSec: 0, genres: [] };
    });

    await libraryScopeStatistics([
      { serverId: 'profile-s1', libraryIds: ['lib-a'] },
      { serverId: 'profile-s2', libraryIds: [] },
    ]);

    expect(captured).toEqual({
      request: {
        scopes: [
          { serverId: 's1.example', libraryIds: ['lib-a'] },
          { serverId: 's2.example', libraryIds: [] },
        ],
      },
    });
  });
});

describe('libraryScopeMostPlayed', () => {
  it('maps all selected profile scopes and returned album owners', async () => {
    let captured: unknown;
    onInvoke('library_scope_most_played', (args) => {
      captured = args;
      return {
        albums: [{
          serverId: 's2.example', libraryId: 'lib-b', id: 'album-b', name: 'B',
          artist: 'Artist B', artistId: 'artist-b', playCount: 12,
        }],
        artists: [{ serverId: 's2.example', id: 'artist-b', name: 'Artist B', playCount: 12 }],
        hasMore: false,
      };
    });

    const response = await libraryScopeMostPlayed({
      scopes: [
        { serverId: 'profile-s1', libraryIds: ['lib-a'] },
        { serverId: 'profile-s2', libraryIds: [] },
      ],
      limit: 50,
      offset: 0,
    });

    expect(captured).toEqual({
      request: {
        scopes: [
          { serverId: 's1.example', libraryIds: ['lib-a'] },
          { serverId: 's2.example', libraryIds: [] },
        ],
        limit: 50,
        offset: 0,
      },
    });
    expect(response.albums[0]?.serverId).toBe('profile-s2');
    expect(response.artists[0]?.serverId).toBe('profile-s2');
  });
});

describe('libraryScopeListMainstageAlbums', () => {
  it('maps scope and response server ids without changing album order', async () => {
    let captured: unknown;
    onInvoke('library_scope_list_mainstage_albums', (args) => {
      captured = args;
      return {
        albums: [
          { serverId: 's1.example', id: 'new-2', name: 'Second', syncedAt: 0, rawJson: {} },
          { serverId: 's1.example', id: 'new-1', name: 'First', syncedAt: 0, rawJson: {} },
        ],
        hasMore: true,
      };
    });

    const response = await libraryScopeListMainstageAlbums('profile-s1', {
      scopes,
      feed: 'newReleases',
      limit: 12,
      offset: 24,
    });

    expect(captured).toEqual({
      request: {
        scopes: [
          { serverId: 's1.example', libraryId: 'lib-a' },
          { serverId: 's1.example', libraryId: 'lib-b' },
        ],
        feed: 'newReleases',
        limit: 12,
        offset: 24,
      },
    });
    expect(response.hasMore).toBe(true);
    expect(response.albums.map(album => [album.serverId, album.id])).toEqual([
      ['profile-s1', 'new-2'],
      ['profile-s1', 'new-1'],
    ]);
  });
});

describe('libraryScopeSearchTracks', () => {
  it('invokes library_scope_search_tracks with query and scopes', async () => {
    let captured: unknown;
    onInvoke('library_scope_search_tracks', (args) => {
      captured = args;
      return [];
    });
    await libraryScopeSearchTracks('profile-s1', { scopes, query: 'foo', limit: 20 });
    expect(captured).toEqual({
      request: {
        scopes: [
          { serverId: 's1.example', libraryId: 'lib-a' },
          { serverId: 's1.example', libraryId: 'lib-b' },
        ],
        query: 'foo',
        limit: 20,
      },
    });
  });
});

describe('libraryScopeAlbumDetail', () => {
  it('invokes library_scope_album_detail with mapped anchor server id', async () => {
    let captured: unknown;
    onInvoke('library_scope_album_detail', (args) => {
      captured = args;
      return {
        album: {
          serverId: 's1.example',
          id: 'al-1',
          name: 'A',
          syncedAt: 0,
          rawJson: {},
        },
        tracks: [],
      };
    });
    await libraryScopeAlbumDetail('profile-s1', {
      scopes,
      albumId: 'al-1',
      serverId: 'profile-s1',
    });
    expect(captured).toEqual({
      request: {
        scopes: [
          { serverId: 's1.example', libraryId: 'lib-a' },
          { serverId: 's1.example', libraryId: 'lib-b' },
        ],
        albumId: 'al-1',
        serverId: 's1.example',
      },
    });
  });
});

describe('libraryScopeArtistDetail', () => {
  it('invokes library_scope_artist_detail with mapped anchor server id', async () => {
    let captured: unknown;
    onInvoke('library_scope_artist_detail', (args) => {
      captured = args;
      return {
        artist: {
          serverId: 's1.example',
          id: 'ar-1',
          name: 'Artist',
          syncedAt: 0,
          rawJson: {},
        },
        albums: [],
        tracks: [],
        topTracksServerId: 's2.example',
        topTracksFingerprint: 'tracks-v1',
      };
    });
    const response = await libraryScopeArtistDetail('profile-s1', {
      scopes,
      artistId: 'ar-1',
      serverId: 'profile-s1',
      topTracksLimit: 5,
    });
    expect(captured).toEqual({
      request: {
        scopes: [
          { serverId: 's1.example', libraryId: 'lib-a' },
          { serverId: 's1.example', libraryId: 'lib-b' },
        ],
        artistId: 'ar-1',
        serverId: 's1.example',
        topTracksLimit: 5,
      },
    });
    expect(response.topTracksServerId).toBe('profile-s2');
    expect(response.topTracksFingerprint).toBe('tracks-v1');
  });
});
