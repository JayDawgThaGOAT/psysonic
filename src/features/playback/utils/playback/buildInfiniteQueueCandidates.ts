import {
  getSimilarSongs2ForServer,
  getTopSongsForServer,
} from '@/lib/api/subsonicArtists';
import { getRandomSongsForServer } from '@/lib/api/subsonicLibrary';
import type { Track } from '@/lib/media/trackTypes';
import {
  enrichSongsForMixRatingFilter,
  getMixMinRatingsConfigFromAuth,
  passesMixMinRatings,
} from '@/features/playback/utils/mixRatingFilter';
import { shuffleArray } from '@/lib/util/shuffleArray';
import { songToTrack } from '@/lib/media/songToTrack';
import { queueTrackIdentityKey } from '@/features/playback/utils/playback/queueIdentity';
/**
 * Infinite queue source strategy (Instant Mix-like):
 * 1) Prefer artist-driven candidates (Top + Similar) around the current track.
 * 2) Fallback to random songs when artist-driven fetches are empty.
 */
export async function buildInfiniteQueueCandidates(
  seedTrack: Track | null,
  serverId: string,
  existingIdentities: Set<string>,
  count = 5,
): Promise<Track[]> {
  if (!serverId) return [];
  const RANDOM_TOPUP_BATCH_SIZE = Math.max(10, count * 2);
  const RANDOM_TOPUP_MAX_BATCHES = 8;
  const artistId = seedTrack?.artistId?.trim() || null;
  const artistName = seedTrack?.artist?.trim() || null;

  const [similar, top] = await Promise.all([
    artistId ? getSimilarSongs2ForServer(serverId, artistId).catch(() => []) : Promise.resolve([]),
    artistName ? getTopSongsForServer(serverId, artistName).catch(() => []) : Promise.resolve([]),
  ]);

  const seedId = seedTrack?.id ?? null;
  const mixCfg = getMixMinRatingsConfigFromAuth();
  const mixedSources = [...top, ...similar];
  const filteredMixedSongs = mixCfg.enabled
    ? (await enrichSongsForMixRatingFilter(mixedSources, mixCfg, serverId)).filter(s => passesMixMinRatings(s, mixCfg))
    : mixedSources;
  const out: Track[] = shuffleArray(
    filteredMixedSongs
      .map(song => ({ ...songToTrack(song), serverId }))
      .filter(t => (
        t.id !== seedId
        && !existingIdentities.has(queueTrackIdentityKey(t.id, serverId))
      )),
  )
    .slice(0, count)
    .map(t => ({ ...t, autoAdded: true as const }));

  const seenIdentities = new Set<string>([
    ...existingIdentities,
    ...out.map(t => queueTrackIdentityKey(t.id, serverId)),
  ]);
  for (let b = 0; out.length < count && b < RANDOM_TOPUP_MAX_BATCHES; b++) {
    const random = await getRandomSongsForServer(
      serverId,
      RANDOM_TOPUP_BATCH_SIZE,
      seedTrack?.genre,
    ).catch(() => []);
    if (!random.length) break;
    const filteredRandomSongs = mixCfg.enabled
      ? (await enrichSongsForMixRatingFilter(random, mixCfg, serverId)).filter(s => passesMixMinRatings(s, mixCfg))
      : random;
    for (const rawTrack of shuffleArray(filteredRandomSongs.map(songToTrack))) {
      const track = { ...rawTrack, serverId };
      const identity = queueTrackIdentityKey(track.id, serverId);
      if (track.id === seedId || seenIdentities.has(identity)) continue;
      out.push({ ...track, autoAdded: true as const });
      seenIdentities.add(identity);
      if (out.length >= count) break;
    }
  }

  return out.slice(0, count);
}
