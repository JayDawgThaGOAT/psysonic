import { commands } from '@/generated/bindings';
import type { InternetRadioStation } from '@/lib/api/subsonicTypes';
import { forgetDiskSrcForServer } from './diskSrcCache';
import { invalidateCoverArt } from './imageCache';
import { radioCoverRef } from './ref';
import { coverIndexKeyFromRef } from './storageKeys';

/** Radio cover edits are rare; clear the owner bucket because native cache has no per-entity delete command. */
export async function invalidateRadioCoverArtCache(
  station: Pick<InternetRadioStation, 'id' | 'serverId'>,
): Promise<void> {
  const ref = radioCoverRef(station);
  const serverIndexKey = coverIndexKeyFromRef(ref);
  forgetDiskSrcForServer(serverIndexKey);
  await invalidateCoverArt(ref.cacheEntityId, station.serverId);
  const result = await commands.coverCacheClearServer(serverIndexKey);
  if (result.status === 'error') throw new Error(result.error);
}
