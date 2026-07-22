/**
 * Preload identity, URL and switch-time mutables coordinate the gapless preloader. Most of the surface
 * is straight get/set — the interesting bit is `clearPreloadingIds` (atomic
 * clear of both) and `markGaplessSwitch` (timestamp side effect).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _resetGaplessPreloadStateForTest,
  clearPreloadingIds,
  getBytePreloadingId,
  getBytePreloadingUrl,
  getGaplessPreloadingId,
  getLastGaplessSwitchTime,
  markGaplessSwitch,
  setBytePreloadingId,
  setBytePreloadingRequest,
  setGaplessPreloadingId,
} from '@/features/playback/store/gaplessPreloadState';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-12T12:00:00Z'));
});

afterEach(() => {
  _resetGaplessPreloadStateForTest();
  vi.useRealTimers();
});

describe('initial state', () => {
  it('is null / 0 for unread accessors', () => {
    expect(getGaplessPreloadingId()).toBeNull();
    expect(getBytePreloadingId()).toBeNull();
    expect(getBytePreloadingUrl()).toBeNull();
    expect(getLastGaplessSwitchTime()).toBe(0);
  });
});

describe('preloading-id accessors', () => {
  it('round-trips through the gapless guard', () => {
    setGaplessPreloadingId('t1');
    expect(getGaplessPreloadingId()).toBe('t1');
  });

  it('round-trips through the byte guard', () => {
    setBytePreloadingId('t2');
    expect(getBytePreloadingId()).toBe('t2');
  });

  it('keeps the requested URL beside the server-qualified byte identity', () => {
    setBytePreloadingRequest('["srv","t2"]', 'https://srv/stream?id=t2');
    expect(getBytePreloadingId()).toBe('["srv","t2"]');
    expect(getBytePreloadingUrl()).toBe('https://srv/stream?id=t2');
    setBytePreloadingId(null);
    expect(getBytePreloadingUrl()).toBeNull();
  });

  it('keeps the two guards independent', () => {
    setGaplessPreloadingId('a');
    setBytePreloadingId('b');
    expect(getGaplessPreloadingId()).toBe('a');
    expect(getBytePreloadingId()).toBe('b');
  });

  it('accepts null to clear a guard', () => {
    setGaplessPreloadingId('a');
    setGaplessPreloadingId(null);
    expect(getGaplessPreloadingId()).toBeNull();
  });
});

describe('clearPreloadingIds', () => {
  it('clears both guards atomically', () => {
    setGaplessPreloadingId('a');
    setBytePreloadingId('b');
    clearPreloadingIds();
    expect(getGaplessPreloadingId()).toBeNull();
    expect(getBytePreloadingId()).toBeNull();
    expect(getBytePreloadingUrl()).toBeNull();
  });

  it('does not touch the gapless-switch timestamp', () => {
    markGaplessSwitch();
    const before = getLastGaplessSwitchTime();
    clearPreloadingIds();
    expect(getLastGaplessSwitchTime()).toBe(before);
  });
});

describe('markGaplessSwitch', () => {
  it('stamps Date.now()', () => {
    markGaplessSwitch();
    expect(getLastGaplessSwitchTime()).toBe(Date.now());
  });

  it('overwrites on a later call', () => {
    markGaplessSwitch();
    const first = getLastGaplessSwitchTime();
    vi.advanceTimersByTime(700);
    markGaplessSwitch();
    expect(getLastGaplessSwitchTime()).toBeGreaterThan(first);
  });
});
