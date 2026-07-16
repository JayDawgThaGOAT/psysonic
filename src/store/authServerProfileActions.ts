import type { AuthState } from './authStoreTypes';
import { generateId } from './authStoreHelpers';
import { getQueueServerId, clearQueueServerForPlayback } from './playbackEngineBridge';
import { resolveServerIdForIndexKey } from '@/lib/server/serverLookup';

type SetState = (
  partial: Partial<AuthState> | ((state: AuthState) => Partial<AuthState>),
) => void;

function selectedServerIdsInOrder(
  servers: AuthState['servers'],
  selectedIds: readonly string[],
  fallbackId: string | null,
): string[] {
  const selected = new Set(selectedIds);
  const ordered = servers.filter(server => selected.has(server.id)).map(server => server.id);
  if (ordered.length > 0 || servers.length === 0) return ordered;
  const fallback = servers.find(server => server.id === fallbackId) ?? servers[0];
  return fallback ? [fallback.id] : [];
}

/**
 * Server profile + connection lifecycle. `removeServer` is the
 * non-trivial one: when the active server is the one being removed it
 * also drops every per-server map entry tied to that id and switches
 * the active id to the next available server (or null) so the rest of
 * the app doesn't end up reading stale state.
 */
export function createServerProfileActions(set: SetState): Pick<
  AuthState,
  | 'addServer'
  | 'updateServer'
  | 'removeServer'
  | 'setServers'
  | 'setActiveServer'
  | 'setLoggedIn'
  | 'setConnecting'
  | 'setConnectionError'
  | 'logout'
> {
  return {
    addServer: (profile) => {
      const id = generateId();
      set(s => ({
        servers: [...s.servers, { ...profile, id }],
        ...(s.servers.length === 0 ? { libraryBrowseServerIds: [id] } : {}),
      }));
      return id;
    },

    updateServer: (id, data) => {
      set(s => ({
        servers: s.servers.map(srv => srv.id === id ? { ...srv, ...data } : srv),
      }));
    },

    removeServer: (id) => {
      // queueServerId is the canonical index key (B1); resolve the
      // canonical id back to a server UUID before comparing so a profile
      // delete still clears the matching queue binding.
      const queueSid = getQueueServerId();
      if (queueSid && resolveServerIdForIndexKey(queueSid) === id) {
        clearQueueServerForPlayback();
      }
      set(s => {
        const newServers = s.servers.filter(srv => srv.id !== id);
        const switchedAway = s.activeServerId === id;
        const { [id]: _r, ...entityRatingRest } = s.entityRatingSupportByServer;
        const { [id]: _a, ...audiomuseRest } = s.audiomuseNavidromeByServer;
        const { [id]: _idn, ...identityRest } = s.subsonicServerIdentityByServer;
        const { [id]: _iss, ...issueRest } = s.audiomuseNavidromeIssueByServer;
        const { [id]: _pr, ...probeRest } = s.instantMixProbeByServer;
        const { [id]: _ppl, ...pluginProbeRest } = s.audiomusePluginProbeByServer;
        const { [id]: _ex, ...extRest } = s.openSubsonicExtensionsByServer;
        const { [id]: _folders, ...foldersRest } = s.musicFoldersByServer;
        const { [id]: _browseSelection, ...browseSelectionRest } = s.libraryBrowseSelectionByServer;
        const activeServerId = switchedAway ? (newServers[0]?.id ?? null) : s.activeServerId;
        return {
          servers: newServers,
          activeServerId,
          isLoggedIn: switchedAway ? false : s.isLoggedIn,
          libraryBrowseServerIds: selectedServerIdsInOrder(
            newServers,
            s.libraryBrowseServerIds.filter(serverId => serverId !== id),
            activeServerId,
          ),
          musicFolders: switchedAway && activeServerId
            ? (foldersRest[activeServerId] ?? [])
            : s.musicFolders,
          musicFoldersByServer: foldersRest,
          libraryBrowseSelectionByServer: browseSelectionRest,
          libraryBrowseScopeVersion: s.libraryBrowseScopeVersion + 1,
          entityRatingSupportByServer: entityRatingRest,
          audiomuseNavidromeByServer: audiomuseRest,
          subsonicServerIdentityByServer: identityRest,
          audiomuseNavidromeIssueByServer: issueRest,
          instantMixProbeByServer: probeRest,
          audiomusePluginProbeByServer: pluginProbeRest,
          openSubsonicExtensionsByServer: extRest,
        };
      });
    },

    setServers: (servers) => set(s => ({
      servers,
      libraryBrowseServerIds: selectedServerIdsInOrder(
        servers,
        s.libraryBrowseServerIds,
        s.activeServerId,
      ),
      libraryBrowseScopeVersion: s.libraryBrowseScopeVersion + 1,
    })),
    setActiveServer: (id) => set(s => ({
      activeServerId: id,
      musicFolders: s.musicFoldersByServer[id] ?? [],
      ...(s.libraryBrowseServerIds.length <= 1
        ? {
            libraryBrowseServerIds: [id],
            libraryBrowseScopeVersion: s.libraryBrowseScopeVersion + 1,
          }
        : {}),
    })),
    setLoggedIn: (v) => set({ isLoggedIn: v }),
    setConnecting: (v) => set({ isConnecting: v }),
    setConnectionError: (e) => set({ connectionError: e }),
    logout: () => set({ isLoggedIn: false, musicFolders: [] }),
  };
}
