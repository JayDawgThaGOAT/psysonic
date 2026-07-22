import { libraryGetStatus } from '@/lib/api/library';
import { librarySelectionForServer } from '@/lib/api/subsonicClient';
import { useAuthStore } from '@/store/authStore';

/** Libraries above this size are preferred; several large ones are picked at random. */
export const LUCKY_MIX_LARGE_LIBRARY_TRACK_THRESHOLD = 1000;

export interface LuckyMixLibraryCandidate {
  serverId: string;
  libraryId: string;
}

interface LuckyMixCandidateSource {
  servers: Array<{ id: string }>;
  libraryBrowseServerIds: string[];
  musicFoldersByServer: Record<string, Array<{ id: string }>>;
  libraryBrowseSelectionByServer: Record<string, string[]>;
  audiomuseByServer: Record<string, boolean>;
}

/** Concrete selected library pairs on servers that can build AudioMuse mixes. */
export function luckyMixLibraryCandidates(source: LuckyMixCandidateSource): LuckyMixLibraryCandidate[] {
  const selectedServers = new Set(source.libraryBrowseServerIds);
  const candidates: LuckyMixLibraryCandidate[] = [];
  for (const server of source.servers) {
    if (!selectedServers.has(server.id) || !source.audiomuseByServer[server.id]) continue;
    const folders = source.musicFoldersByServer[server.id] ?? [];
    const selected = source.libraryBrowseSelectionByServer[server.id] ?? [];
    const libraryIds = selected.length > 0 ? selected : folders.map(folder => folder.id);
    for (const libraryId of libraryIds) {
      if (libraryId) candidates.push({ serverId: server.id, libraryId });
    }
  }
  return candidates;
}

/** True when the user selected several libraries but not the full server set. */
export function isPartialMultiLibrarySelection(serverId: string): boolean {
  const selection = librarySelectionForServer(serverId);
  if (selection.length <= 1) return false;
  const folderCount = useAuthStore.getState().musicFolders.length;
  if (folderCount <= 1) return false;
  return selection.length < folderCount;
}

export async function pickLuckyMixTargetLibrary(
  serverId: string,
  candidates: string[],
): Promise<string> {
  if (candidates.length === 0) {
    throw new Error('lucky-mix: no library candidates');
  }
  if (candidates.length === 1) return candidates[0];

  const counts = await Promise.all(
    candidates.map(async libraryId => {
      try {
        const status = await libraryGetStatus(serverId, libraryId);
        return { libraryId, count: Math.max(0, status.localTrackCount ?? 0) };
      } catch {
        return { libraryId, count: 0 };
      }
    }),
  );

  const large = counts.filter(c => c.count > LUCKY_MIX_LARGE_LIBRARY_TRACK_THRESHOLD);
  if (large.length > 1) {
    return large[Math.floor(Math.random() * large.length)]!.libraryId;
  }
  if (large.length === 1) {
    return large[0]!.libraryId;
  }

  const maxCount = Math.max(...counts.map(c => c.count));
  const tier = counts.filter(c => c.count === maxCount);
  return tier[Math.floor(Math.random() * tier.length)]!.libraryId;
}

/** Choose across selected `(server, library)` pairs using the same large-library policy. */
export async function pickLuckyMixTarget(
  candidates: LuckyMixLibraryCandidate[],
): Promise<LuckyMixLibraryCandidate> {
  if (candidates.length === 0) throw new Error('lucky-mix: no library candidates');
  if (candidates.length === 1) return candidates[0]!;

  const counts = await Promise.all(candidates.map(async candidate => {
    try {
      const status = await libraryGetStatus(candidate.serverId, candidate.libraryId);
      return { ...candidate, count: Math.max(0, status.localTrackCount ?? 0) };
    } catch {
      return { ...candidate, count: 0 };
    }
  }));
  const large = counts.filter(candidate => candidate.count > LUCKY_MIX_LARGE_LIBRARY_TRACK_THRESHOLD);
  const tier = large.length > 0
    ? large
    : counts.filter(candidate => candidate.count === Math.max(...counts.map(item => item.count)));
  const picked = tier[Math.floor(Math.random() * tier.length)]!;
  return { serverId: picked.serverId, libraryId: picked.libraryId };
}
