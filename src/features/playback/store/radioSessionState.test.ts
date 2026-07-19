import { afterEach, describe, expect, it } from 'vitest';
import {
  _resetRadioSessionStateForTest,
  addRadioSessionSeen,
  clearRadioSessionSeenIds,
  deleteRadioSessionSeen,
  getCurrentRadioArtistId,
  getCurrentRadioServerId,
  hasRadioSessionSeen,
  isRadioFetching,
  setCurrentRadioArtistId,
  setRadioFetching,
} from '@/features/playback/store/radioSessionState';

afterEach(() => {
  _resetRadioSessionStateForTest();
});

describe('radioFetching', () => {
  it('starts false + round-trips through set/get', () => {
    expect(isRadioFetching()).toBe(false);
    setRadioFetching(true);
    expect(isRadioFetching()).toBe(true);
    setRadioFetching(false);
    expect(isRadioFetching()).toBe(false);
  });
});

describe('current radio seed', () => {
  it('round-trips artist and owner together', () => {
    expect(getCurrentRadioArtistId()).toBeNull();
    expect(getCurrentRadioServerId()).toBeNull();
    setCurrentRadioArtistId('artist-1', 'server-a');
    expect(getCurrentRadioArtistId()).toBe('artist-1');
    expect(getCurrentRadioServerId()).toBe('server-a');
    setCurrentRadioArtistId(null);
    expect(getCurrentRadioArtistId()).toBeNull();
    expect(getCurrentRadioServerId()).toBeNull();
  });
});

describe('radioSessionSeenIds', () => {
  it('starts empty', () => {
    expect(hasRadioSessionSeen('any')).toBe(false);
  });

  it('add + has round-trip', () => {
    addRadioSessionSeen('t1');
    expect(hasRadioSessionSeen('t1')).toBe(true);
    expect(hasRadioSessionSeen('t2')).toBe(false);
  });

  it('delete removes individual ids without affecting others', () => {
    addRadioSessionSeen('t1');
    addRadioSessionSeen('t2');
    deleteRadioSessionSeen('t1');
    expect(hasRadioSessionSeen('t1')).toBe(false);
    expect(hasRadioSessionSeen('t2')).toBe(true);
  });

  it('clearRadioSessionSeenIds wipes the set', () => {
    addRadioSessionSeen('t1');
    addRadioSessionSeen('t2');
    clearRadioSessionSeenIds();
    expect(hasRadioSessionSeen('t1')).toBe(false);
    expect(hasRadioSessionSeen('t2')).toBe(false);
  });
});

describe('_resetRadioSessionStateForTest', () => {
  it('resets all session state', () => {
    setRadioFetching(true);
    setCurrentRadioArtistId('artist-1', 'server-a');
    addRadioSessionSeen('t1');
    _resetRadioSessionStateForTest();
    expect(isRadioFetching()).toBe(false);
    expect(getCurrentRadioArtistId()).toBeNull();
    expect(getCurrentRadioServerId()).toBeNull();
    expect(hasRadioSessionSeen('t1')).toBe(false);
  });
});
