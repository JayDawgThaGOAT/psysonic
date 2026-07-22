import { resolveAlbumCoverEntry } from '@/cover/resolveEntry';
import { useAuthStore } from '@/store/authStore';
import { wakeCoverBackfillForMissingMetadata } from '@/cover/wakeCoverBackfillForMissingMetadata';

/**
 * When a visible track row lacks index metadata needed for a cover ref, nudge
 * the native library cover backfill (aggressive strategy only). Throttled so
 * virtualized lists do not spam wakes.
 */
export function wakeCoverBackfillForMissingTrack(
  song: { albumId?: string | null; coverArt?: string | null; serverId?: string | null },
): void {
  const albumId = song.albumId?.trim();
  if (albumId && resolveAlbumCoverEntry(albumId, song.coverArt)?.fetchCoverArtId) return;

  const serverId = song.serverId?.trim() || useAuthStore.getState().activeServerId;
  if (!serverId) return;
  wakeCoverBackfillForMissingMetadata(serverId);
}
