import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/store/authStore';
import {
  isPartialMultiLibrarySelection,
  luckyMixLibraryCandidates,
  pickLuckyMixTarget,
  pickLuckyMixTargetLibrary,
  LUCKY_MIX_LARGE_LIBRARY_TRACK_THRESHOLD,
} from '@/features/randomMix/utils/luckyMixLibraryPick';

const libraryGetStatusMock = vi.fn();

vi.mock('@/lib/api/library', () => ({
  libraryGetStatus: (...args: unknown[]) => libraryGetStatusMock(...args),
}));

describe('isPartialMultiLibrarySelection', () => {
  beforeEach(() => {
    useAuthStore.setState({
      activeServerId: 'srv-1',
      musicFolders: [
        { id: '1', name: 'A' },
        { id: '2', name: 'B' },
        { id: '3', name: 'C' },
      ],
      musicLibrarySelectionByServer: {},
      musicLibraryFilterByServer: {},
    });
  });

  it('is false for all libraries, one library, or full explicit selection', () => {
    expect(isPartialMultiLibrarySelection('srv-1')).toBe(false);

    useAuthStore.setState({
      musicLibrarySelectionByServer: { 'srv-1': ['1'] },
      musicLibraryFilterByServer: { 'srv-1': '1' },
    });
    expect(isPartialMultiLibrarySelection('srv-1')).toBe(false);

    useAuthStore.setState({
      musicLibrarySelectionByServer: { 'srv-1': ['1', '2', '3'] },
      musicLibraryFilterByServer: { 'srv-1': '1' },
    });
    expect(isPartialMultiLibrarySelection('srv-1')).toBe(false);
  });

  it('is true when several but not all libraries are selected', () => {
    useAuthStore.setState({
      musicLibrarySelectionByServer: { 'srv-1': ['1', '2'] },
      musicLibraryFilterByServer: { 'srv-1': '1' },
    });
    expect(isPartialMultiLibrarySelection('srv-1')).toBe(true);
  });
});

describe('pickLuckyMixTargetLibrary', () => {
  beforeEach(() => {
    libraryGetStatusMock.mockReset();
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });

  it('returns the sole candidate without status reads', async () => {
    await expect(pickLuckyMixTargetLibrary('srv-1', ['9'])).resolves.toBe('9');
    expect(libraryGetStatusMock).not.toHaveBeenCalled();
  });

  it('randomly picks among libraries above the large threshold', async () => {
    libraryGetStatusMock.mockImplementation(async (_serverId: string, libraryId: string) => ({
      localTrackCount:
        libraryId === 'small'
          ? 50
          : LUCKY_MIX_LARGE_LIBRARY_TRACK_THRESHOLD + 1,
    }));

    await expect(
      pickLuckyMixTargetLibrary('srv-1', ['small', 'big-a', 'big-b']),
    ).resolves.toBe('big-a');
  });

  it('randomly picks among large libraries even when track counts differ', async () => {
    libraryGetStatusMock.mockImplementation(async (_serverId: string, libraryId: string) => ({
      localTrackCount: libraryId === 'big-a' ? 5000 : 2000,
    }));

    vi.spyOn(Math, 'random').mockReturnValue(0);
    await expect(pickLuckyMixTargetLibrary('srv-1', ['big-a', 'big-b'])).resolves.toBe('big-a');

    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    await expect(pickLuckyMixTargetLibrary('srv-1', ['big-a', 'big-b'])).resolves.toBe('big-b');
  });

  it('picks the sole large library when only one exceeds the threshold', async () => {
    libraryGetStatusMock.mockImplementation(async (_serverId: string, libraryId: string) => ({
      localTrackCount: libraryId === 'big' ? 1500 : 50,
    }));

    await expect(pickLuckyMixTargetLibrary('srv-1', ['small', 'big'])).resolves.toBe('big');
  });

  it('falls back to the largest library when none exceed the threshold', async () => {
    libraryGetStatusMock.mockImplementation(async (_serverId: string, libraryId: string) => ({
      localTrackCount: libraryId === 'mid' ? 400 : 120,
    }));

    await expect(
      pickLuckyMixTargetLibrary('srv-1', ['tiny', 'mid']),
    ).resolves.toBe('mid');
  });
});

describe('multi-server Lucky Mix candidates', () => {
  const source = {
    servers: [{ id: 'audio-a' }, { id: 'plain-b' }, { id: 'audio-c' }],
    libraryBrowseServerIds: ['audio-a', 'plain-b', 'audio-c'],
    musicFoldersByServer: {
      'audio-a': [{ id: 'a1' }, { id: 'a2' }],
      'plain-b': [{ id: 'b1' }],
      'audio-c': [{ id: 'c1' }],
    },
    libraryBrowseSelectionByServer: {
      'audio-a': ['a2'],
      'plain-b': ['b1'],
      'audio-c': [],
    },
    audiomuseByServer: { 'audio-a': true, 'plain-b': false, 'audio-c': true },
  };

  it('uses selected libraries from AudioMuse-capable servers only', () => {
    expect(luckyMixLibraryCandidates(source)).toEqual([
      { serverId: 'audio-a', libraryId: 'a2' },
      { serverId: 'audio-c', libraryId: 'c1' },
    ]);
  });

  it('randomly picks among large libraries across server owners', async () => {
    libraryGetStatusMock.mockImplementation(async (serverId: string, libraryId: string) => ({
      localTrackCount: serverId === 'audio-a' && libraryId === 'a2' ? 5000 : 2000,
    }));
    vi.spyOn(Math, 'random').mockReturnValue(0.99);

    await expect(pickLuckyMixTarget(luckyMixLibraryCandidates(source))).resolves.toEqual({
      serverId: 'audio-c', libraryId: 'c1',
    });
  });
});
