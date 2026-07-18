export interface LibraryBrowseScopePair {
  serverId: string;
  libraryId: string;
}

export interface LibraryBrowseScopeSource {
  servers: Array<{ id: string }>;
  activeServerId: string | null;
  libraryBrowseServerIds: string[];
  musicFoldersByServer: Record<string, Array<{ id: string }>>;
  libraryBrowseSelectionByServer: Record<string, string[]>;
}

let readLibraryBrowseScopeSource: () => LibraryBrowseScopeSource = () => ({
  servers: [],
  activeServerId: null,
  libraryBrowseServerIds: [],
  musicFoldersByServer: {},
  libraryBrowseSelectionByServer: {},
});

/** Store-layer injection keeps `src/lib` independent of Zustand. */
export function setLibraryBrowseScopeSource(source: () => LibraryBrowseScopeSource): void {
  readLibraryBrowseScopeSource = source;
}

export interface LibraryBrowseScope {
  anchorServerId: string | null;
  pairs: LibraryBrowseScopePair[];
  fingerprint: string;
  multiServer: boolean;
}

type LibraryBrowseServerOrderSource = Pick<
  LibraryBrowseScopeSource,
  'servers' | 'activeServerId' | 'libraryBrowseServerIds'
>;

export function deriveOrderedLibraryBrowseServerIds(
  state: LibraryBrowseServerOrderSource,
): string[] {
  const selectedServers = new Set(state.libraryBrowseServerIds);
  return state.servers
    .filter(server => selectedServers.has(server.id))
    .map(server => server.id);
}

export function deriveLibraryBrowseServerIdsWithFallback(
  state: LibraryBrowseServerOrderSource,
): string[] {
  const orderedServerIds = deriveOrderedLibraryBrowseServerIds(state);
  if (orderedServerIds.length > 0 || state.servers.length === 0) return orderedServerIds;

  const fallback = state.servers.find(server => server.id === state.activeServerId) ?? state.servers[0];
  return fallback ? [fallback.id] : [];
}

/** Ordered concrete source pairs used only by Library pages and search. */
export function deriveLibraryBrowseScope(state: LibraryBrowseScopeSource): LibraryBrowseScope {
  const orderedServerIds = deriveOrderedLibraryBrowseServerIds(state);
  const pairs: LibraryBrowseScopePair[] = [];
  const fingerprintEntries: Array<[string, string[]]> = [];

  for (const serverId of orderedServerIds) {
    const folders = state.musicFoldersByServer[serverId] ?? [];
    const selection = state.libraryBrowseSelectionByServer[serverId] ?? [];
    const libraryIds = selection.length > 0
      ? selection
      : folders.map(folder => folder.id);
    fingerprintEntries.push([serverId, libraryIds]);
    for (const libraryId of libraryIds) {
      if (!libraryId) continue;
      pairs.push({ serverId, libraryId });
    }
  }

  return {
    anchorServerId: orderedServerIds[0]
      ?? deriveLibraryBrowseServerIdsWithFallback(state)[0]
      ?? null,
    pairs,
    fingerprint: fingerprintEntries.length > 0 ? JSON.stringify(fingerprintEntries) : '',
    multiServer: orderedServerIds.length > 1,
  };
}

export function getLibraryBrowseScope(): LibraryBrowseScope {
  return deriveLibraryBrowseScope(readLibraryBrowseScopeSource());
}
