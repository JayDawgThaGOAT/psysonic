import type { InternetRadioStation } from '@/lib/api/subsonicTypes';
import { ownedEntityKey } from '@/lib/util/ownedEntityKey';

export function radioStationKey(station: Pick<InternetRadioStation, 'id' | 'serverId'>): string {
  return ownedEntityKey(station);
}

export function sameRadioStation(
  a: Pick<InternetRadioStation, 'id' | 'serverId'> | null | undefined,
  b: Pick<InternetRadioStation, 'id' | 'serverId'> | null | undefined,
): boolean {
  return Boolean(a && b && radioStationKey(a) === radioStationKey(b));
}

/** Convert only unambiguous persisted raw ids without dropping unavailable-owner keys. */
export function migrateRadioStationKeys(
  keys: readonly string[],
  stations: readonly InternetRadioStation[],
): string[] {
  const exactKeys = new Set(stations.map(radioStationKey));
  const stationsByRawId = new Map<string, InternetRadioStation[]>();
  for (const station of stations) {
    const matches = stationsByRawId.get(station.id) ?? [];
    matches.push(station);
    stationsByRawId.set(station.id, matches);
  }

  const migrated = keys.map(key => {
    if (exactKeys.has(key)) return key;
    const candidates = stationsByRawId.get(key);
    if (!candidates?.length) return key;
    return candidates.length === 1 ? radioStationKey(candidates[0]) : key;
  });
  return [...new Set(migrated)];
}
