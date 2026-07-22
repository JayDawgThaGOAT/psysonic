/**
 * Loudness-gain cache behavior: stable values gate engine bind, analysis ids
 * normalize across `stream:` forms, and equal raw ids remain isolated by owner.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { authState } = vi.hoisted(() => ({
  authState: {
    normalizationEngine: 'off' as 'off' | 'replaygain' | 'loudness',
    replayGainEnabled: false,
  },
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: { getState: () => authState },
}));

import { analysisTrackRef } from '@/features/playback/store/analysisTrackRef';
import {
  _resetLoudnessGainCacheForTest,
  clearLoudnessCacheState,
  forgetLoudnessGain,
  getCachedLoudnessGain,
  hasStableLoudness,
  isReplayGainActive,
  loudnessGainDbForEngineBind,
  markLoudnessStable,
  setCachedLoudnessGain,
} from '@/features/playback/store/loudnessGainCache';

const ref = (trackId: string, serverId = 'server-a') => analysisTrackRef(trackId, serverId);

beforeEach(() => {
  authState.normalizationEngine = 'off';
  authState.replayGainEnabled = false;
});

afterEach(() => {
  _resetLoudnessGainCacheForTest();
});

describe('cache identity', () => {
  it('round-trips a value through the cache', () => {
    setCachedLoudnessGain(ref('t1'), -7.2);
    expect(getCachedLoudnessGain(ref('t1'))).toBe(-7.2);
  });

  it('normalizes bare and stream-prefixed forms', () => {
    setCachedLoudnessGain(ref('stream:t1'), -6);
    expect(getCachedLoudnessGain(ref('t1'))).toBe(-6);
  });

  it('isolates equal raw ids from different servers', () => {
    markLoudnessStable(ref('same', 'server-a'), -5);
    markLoudnessStable(ref('same', 'server-b'), -8);
    expect(getCachedLoudnessGain(ref('same', 'server-a'))).toBe(-5);
    expect(getCachedLoudnessGain(ref('same', 'server-b'))).toBe(-8);
  });

  it('returns undefined for missing entries', () => {
    expect(getCachedLoudnessGain(ref('missing'))).toBeUndefined();
  });

  it('does not cache analysis under an unknown profile UUID', () => {
    const unknownOwner = ref('t1', '9ee02895-4d12-4faa-9a9f-3fae22b64d18');
    markLoudnessStable(unknownOwner, -5);
    expect(getCachedLoudnessGain(unknownOwner)).toBeUndefined();
    expect(hasStableLoudness(unknownOwner)).toBe(false);
  });
});

describe('stable loudness state', () => {
  it('flags as stable only after markLoudnessStable', () => {
    setCachedLoudnessGain(ref('t1'), -7);
    expect(hasStableLoudness(ref('t1'))).toBe(false);
    markLoudnessStable(ref('t1'), -7);
    expect(hasStableLoudness(ref('t1'))).toBe(true);
  });

  it('markLoudnessStable writes the cached value atomically', () => {
    markLoudnessStable(ref('t1'), -5);
    expect(getCachedLoudnessGain(ref('t1'))).toBe(-5);
    expect(hasStableLoudness(ref('t1'))).toBe(true);
  });

  it('forget clears only the specified owner-qualified entry', () => {
    markLoudnessStable(ref('t1', 'server-a'), -5);
    markLoudnessStable(ref('t1', 'server-b'), -6);
    forgetLoudnessGain(ref('t1', 'server-a'));
    expect(getCachedLoudnessGain(ref('t1', 'server-a'))).toBeUndefined();
    expect(hasStableLoudness(ref('t1', 'server-a'))).toBe(false);
    expect(getCachedLoudnessGain(ref('t1', 'server-b'))).toBe(-6);
  });

  it('clear removes the normalized entry without touching another owner', () => {
    markLoudnessStable(ref('stream:t1', 'server-a'), -5);
    markLoudnessStable(ref('t1', 'server-b'), -6);
    clearLoudnessCacheState(ref('t1', 'server-a'));
    expect(getCachedLoudnessGain(ref('stream:t1', 'server-a'))).toBeUndefined();
    expect(getCachedLoudnessGain(ref('t1', 'server-b'))).toBe(-6);
  });
});

describe('loudnessGainDbForEngineBind', () => {
  it('returns null without a stable flag', () => {
    setCachedLoudnessGain(ref('t1'), -5);
    expect(loudnessGainDbForEngineBind(ref('t1'))).toBeNull();
  });

  it('returns the cached value once the entry is stable', () => {
    markLoudnessStable(ref('t1'), -5);
    expect(loudnessGainDbForEngineBind(ref('t1'))).toBe(-5);
  });

  it('returns null when the cached value is non-finite', () => {
    markLoudnessStable(ref('t1'), Number.NaN);
    expect(loudnessGainDbForEngineBind(ref('t1'))).toBeNull();
  });

  it('returns null for null or an empty track id', () => {
    expect(loudnessGainDbForEngineBind(null)).toBeNull();
    expect(loudnessGainDbForEngineBind(ref(''))).toBeNull();
  });
});

describe('isReplayGainActive', () => {
  it('is false when normalization engine is off', () => {
    authState.normalizationEngine = 'off';
    authState.replayGainEnabled = true;
    expect(isReplayGainActive()).toBe(false);
  });

  it('is false when replaygain is disabled', () => {
    authState.normalizationEngine = 'replaygain';
    authState.replayGainEnabled = false;
    expect(isReplayGainActive()).toBe(false);
  });

  it('is true only when replaygain is selected and enabled', () => {
    authState.normalizationEngine = 'replaygain';
    authState.replayGainEnabled = true;
    expect(isReplayGainActive()).toBe(true);
  });

  it('is false for the loudness engine', () => {
    authState.normalizationEngine = 'loudness';
    authState.replayGainEnabled = true;
    expect(isReplayGainActive()).toBe(false);
  });
});

describe('_resetLoudnessGainCacheForTest', () => {
  it('wipes both maps', () => {
    markLoudnessStable(ref('t1'), -5);
    markLoudnessStable(ref('t2'), -6);
    _resetLoudnessGainCacheForTest();
    expect(getCachedLoudnessGain(ref('t1'))).toBeUndefined();
    expect(getCachedLoudnessGain(ref('t2'))).toBeUndefined();
    expect(hasStableLoudness(ref('t1'))).toBe(false);
  });
});
