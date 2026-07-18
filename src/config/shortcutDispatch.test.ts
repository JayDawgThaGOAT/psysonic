import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const player = {
    volume: 0.5,
    currentTrack: null as { id: string; serverId?: string } | null,
    setVolume: vi.fn((v: number) => {
      player.volume = v;
    }),
  };
  return { player, queueSongRating: vi.fn() };
});

vi.mock('@/features/playback/store/playerStore', () => ({
  usePlayerStore: { getState: () => hoisted.player },
}));
vi.mock('@/features/playback/store/pendingStarSync', () => ({
  queueSongRating: hoisted.queueSongRating,
}));

import { executeCliPlayerCommand } from '@/config/shortcutDispatch';

const navigate = vi.fn();

beforeEach(() => {
  hoisted.player.volume = 0.5;
  hoisted.player.currentTrack = null;
  hoisted.player.setVolume.mockClear();
  hoisted.queueSongRating.mockClear();
  navigate.mockClear();
});

describe('executeCliPlayerCommand volume-relative', () => {
  it('raises volume by delta percent and clamps at 1', () => {
    executeCliPlayerCommand({
      payload: { command: 'volume-relative', deltaPercent: 10 },
      navigate,
    });
    expect(hoisted.player.setVolume).toHaveBeenCalledWith(0.6);
  });

  it('lowers volume by delta percent and clamps at 0', () => {
    hoisted.player.volume = 0.03;
    executeCliPlayerCommand({
      payload: { command: 'volume-relative', deltaPercent: -10 },
      navigate,
    });
    expect(hoisted.player.setVolume).toHaveBeenCalledWith(0);
  });
});

describe('executeCliPlayerCommand set-volume', () => {
  it('sets absolute percent', () => {
    executeCliPlayerCommand({
      payload: { command: 'set-volume', percent: 40 },
      navigate,
    });
    expect(hoisted.player.setVolume).toHaveBeenCalledWith(0.4);
  });
});

describe('executeCliPlayerCommand set-rating-current', () => {
  it('routes the rating to the current track owner', () => {
    hoisted.player.currentTrack = { id: 'shared', serverId: 'srv-b' };

    executeCliPlayerCommand({
      payload: { command: 'set-rating-current', stars: 4 },
      navigate,
    });

    expect(hoisted.queueSongRating).toHaveBeenCalledWith('shared', 4, 'srv-b');
  });
});
