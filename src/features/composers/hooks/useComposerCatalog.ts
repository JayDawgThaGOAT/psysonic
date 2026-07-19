import { useEffect, useState } from 'react';
import type { SubsonicArtist } from '@/lib/api/subsonicTypes';
import {
  filterArtistsWithRoleAlbumCredits,
  loadLocalComposerCatalog,
  loadNetworkComposerCatalog,
} from '@/lib/library/composerBrowse';
import { getLibraryBrowseScope } from '@/lib/library/libraryBrowseScope';
import { useAuthStore } from '@/store/authStore';
import { useLibraryIndexStore } from '@/store/libraryIndexStore';
import { useLibraryScopeSyncRevision } from '@/store/offlineLocalLibrarySyncRevision';

export type ComposerCatalogError = 'unsupported' | 'transient' | null;

export function useComposerCatalog() {
  const musicLibraryFilterVersion = useAuthStore(s => s.musicLibraryFilterVersion);
  const libraryBrowseScopeVersion = useAuthStore(s => s.libraryBrowseScopeVersion);
  const activeServerId = useAuthStore(s => s.activeServerId ?? '');
  const browseScope = getLibraryBrowseScope();
  const serverId = browseScope.anchorServerId ?? activeServerId;
  const scopeKey = browseScope.fingerprint || serverId;
  const indexEnabled = useLibraryIndexStore(s => s.isIndexEnabled(serverId));
  const librarySyncRevision = useLibraryScopeSyncRevision(browseScope.serverIds);
  const [composers, setComposers] = useState<SubsonicArtist[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<ComposerCatalogError>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // React Compiler set-state-in-effect rule: reset while a new async catalog request starts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setLoadError(null);
    const scope = getLibraryBrowseScope();
    const load = indexEnabled && scope.pairs.length > 0 && serverId
      ? loadLocalComposerCatalog(serverId, scope.pairs)
      : (() => {
          const ownerIds = scope.serverIds.length > 0
            ? scope.serverIds
            : (serverId ? [serverId] : []);
          return Promise.allSettled(ownerIds.map(ownerId => loadNetworkComposerCatalog(
            ownerId,
            scope.pairs
              .filter(pair => pair.serverId === ownerId)
              .flatMap(pair => pair.libraryId === null ? [] : [pair.libraryId]),
          ))).then(results => {
            const rows = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
            if (rows.length === 0) {
              const failure = results.find(result => result.status === 'rejected');
              if (failure?.status === 'rejected') throw failure.reason;
            }
            return rows;
          });
        })();
    load
      .then(data => {
        if (cancelled) return;
        setComposers(filterArtistsWithRoleAlbumCredits(data));
        setLoading(false);
      })
      .catch(error => {
        if (cancelled) return;
        console.warn('[psysonic] composers list failed:', error);
        const looksUnsupported = /\b(400|404|422|501)\b/.test(String(error));
        setLoadError(looksUnsupported ? 'unsupported' : 'transient');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [
    musicLibraryFilterVersion,
    libraryBrowseScopeVersion,
    librarySyncRevision,
    scopeKey,
    serverId,
    indexEnabled,
    reloadTick,
  ]);

  return {
    composers,
    loading,
    loadError,
    reload: () => setReloadTick(tick => tick + 1),
    serverId,
    scopeKey,
  };
}
