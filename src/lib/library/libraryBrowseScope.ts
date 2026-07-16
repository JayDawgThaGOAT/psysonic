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

/** Ordered concrete source pairs used only by Library pages and search. */
export function deriveLibraryBrowseScope(state: LibraryBrowseScopeSource): LibraryBrowseScope {
  const selectedServers = new Set(state.libraryBrowseServerIds);
  const orderedServers = state.servers.filter(server => selectedServers.has(server.id));
  const pairs: LibraryBrowseScopePair[] = [];

  for (const server of orderedServers) {
    const folders = state.musicFoldersByServer[server.id] ?? [];
    const selection = state.libraryBrowseSelectionByServer[server.id] ?? [];
    const libraryIds = selection.length > 0
      ? selection
      : folders.map(folder => folder.id);
    for (const libraryId of libraryIds) {
      if (!libraryId) continue;
      pairs.push({ serverId: server.id, libraryId });
    }
  }

  return {
    anchorServerId: orderedServers[0]?.id ?? state.activeServerId,
    pairs,
    fingerprint: pairs.map(pair => `${pair.serverId}:${pair.libraryId}`).join('|'),
    multiServer: orderedServers.length > 1,
  };
}

export function getLibraryBrowseScope(): LibraryBrowseScope {
  return deriveLibraryBrowseScope(readLibraryBrowseScopeSource());
}
