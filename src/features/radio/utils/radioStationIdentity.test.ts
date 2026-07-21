import { describe, expect, it } from 'vitest';
import {
  migrateRadioStationKeys,
  radioStationKey,
  sameRadioStation,
} from './radioStationIdentity';

const stations = [
  { id: 'shared', serverId: 'srv-a', name: 'A', streamUrl: 'https://a.test/live' },
  { id: 'shared', serverId: 'srv-b', name: 'B', streamUrl: 'https://b.test/live' },
];

describe('radioStationIdentity', () => {
  it('keeps duplicate raw ids distinct by owner', () => {
    expect(radioStationKey(stations[0])).toBe('srv-a:shared');
    expect(radioStationKey(stations[1])).toBe('srv-b:shared');
    expect(sameRadioStation(stations[0], stations[1])).toBe(false);
  });

  it('does not bind an ambiguous legacy raw id to the active owner', () => {
    expect(migrateRadioStationKeys(
      ['shared', 'srv-c:missing'],
      stations,
    )).toEqual(['shared', 'srv-c:missing']);
  });

  it('migrates an unambiguous raw id and preserves unavailable keys', () => {
    expect(migrateRadioStationKeys(
      ['shared', 'missing'],
      [stations[0]],
    )).toEqual(['srv-a:shared', 'missing']);
  });
});
