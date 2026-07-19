import { afterEach, describe, expect, it } from 'vitest';
import {
  _resetWaveformRefreshGenForTest,
  bumpWaveformRefreshGen,
  getWaveformRefreshGen,
} from '@/features/playback/store/waveformRefreshGen';
import { analysisTrackRef } from '@/features/playback/store/analysisTrackRef';

const ref = (trackId: string, serverId = 'server-a') => analysisTrackRef(trackId, serverId);

afterEach(() => {
  _resetWaveformRefreshGenForTest();
});

describe('waveformRefreshGen', () => {
  it('returns 0 for an unknown track', () => {
    expect(getWaveformRefreshGen(ref('missing'))).toBe(0);
  });

  it('increments the per-track generation on each bump', () => {
    bumpWaveformRefreshGen(ref('t1'));
    expect(getWaveformRefreshGen(ref('t1'))).toBe(1);
    bumpWaveformRefreshGen(ref('t1'));
    expect(getWaveformRefreshGen(ref('t1'))).toBe(2);
  });

  it('keeps tracks independent', () => {
    bumpWaveformRefreshGen(ref('same', 'server-a'));
    bumpWaveformRefreshGen(ref('same', 'server-a'));
    bumpWaveformRefreshGen(ref('same', 'server-b'));
    expect(getWaveformRefreshGen(ref('same', 'server-a'))).toBe(2);
    expect(getWaveformRefreshGen(ref('same', 'server-b'))).toBe(1);
  });

  it('is a no-op for an empty trackId', () => {
    bumpWaveformRefreshGen(ref(''));
    expect(getWaveformRefreshGen(ref(''))).toBe(0);
  });

  it('captures the stale-result guard pattern: a snapshot is invalidated by a later bump', () => {
    bumpWaveformRefreshGen(ref('t1'));
    const snapshot = getWaveformRefreshGen(ref('stream:t1'));
    expect(snapshot).toBe(1);
    bumpWaveformRefreshGen(ref('stream:t1'));
    expect(getWaveformRefreshGen(ref('t1'))).not.toBe(snapshot);
  });
});
