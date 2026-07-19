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

  it('migrates a legacy raw id to the preferred owner and preserves unavailable keys', () => {
    expect(migrateRadioStationKeys(
      ['shared', 'srv-c:missing'],
      stations,
      'srv-b',
    )).toEqual(['srv-b:shared', 'srv-c:missing']);
  });

  it('does not assign a raw id to another owner while the preferred owner is absent', () => {
    expect(migrateRadioStationKeys(
      ['shared'],
      [stations[0]],
      'srv-b',
    )).toEqual(['shared']);
  });
});
