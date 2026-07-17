import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getMusicDirectoryForServer, getMusicIndexesForServer } from '@/lib/api/subsonicLibrary';
import type { SubsonicDirectoryEntry } from '@/lib/api/subsonicTypes';
import type { Track } from '@/lib/media/trackTypes';
import type { Column, NavPos } from '@/features/folderBrowser/utils/folderBrowserHelpers';

let persistedPlayingPathIds: string[] = [];

interface Args {
  columns: Column[];
  currentTrack: Track | null;
  isPlaying: boolean;
  setColumns: React.Dispatch<React.SetStateAction<Column[]>>;
  setKeyboardPos: React.Dispatch<React.SetStateAction<NavPos | null>>;
}

interface Result {
  playingPathIds: string[];
  setPlayingPathIds: React.Dispatch<React.SetStateAction<string[]>>;
  isSelectedPathForCurrentTrack: boolean;
}

export function useFolderBrowserNowPlayingPath({
  columns, currentTrack, isPlaying, setColumns, setKeyboardPos,
}: Args): Result {
  const [playingPathIds, setPlayingPathIds] = useState<string[]>(persistedPlayingPathIds);
  const [playingPathServerId, setPlayingPathServerId] = useState<string | null>(null);
  const autoResolvedTrackRef = useRef<string | null>(null);
  const prevTrackIdRef = useRef<string | null>(null);
  const lastHotkeyRevealTsRef = useRef<number | null>(null);
  const location = useLocation();

  const trackIdentity = currentTrack ? `${currentTrack.serverId ?? ''}\u0000${currentTrack.id}` : null;

  useEffect(() => {
    if (!currentTrack?.id) {
      // React Compiler set-state-in-effect rule: local state synced with store/prop inputs when the effect’s dependencies change.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPlayingPathIds([]);
      setPlayingPathServerId(null);
      return;
    }
    setPlayingPathIds(prev => (prev[prev.length - 1] === currentTrack.id ? prev : []));
    setPlayingPathServerId(prev => prev === currentTrack.serverId ? prev : null);
  }, [currentTrack?.id, currentTrack?.serverId]);

  useEffect(() => {
    if (!isPlaying || !currentTrack?.id) return;
    const selectedChain = columns
      .map(c => c.selectedId)
      .filter((id): id is string => !!id);
    if (selectedChain.length === 0) return;

    const lastSelectedId = selectedChain[selectedChain.length - 1];
    const leafColumn = [...columns].reverse().find(c => c.selectedId);
    const leafItem = leafColumn?.items.find(it => it.id === lastSelectedId);
    if (!leafColumn || !leafItem || leafItem.isDir || leafItem.id !== currentTrack.id || leafColumn.serverId !== currentTrack.serverId) return;

    // React Compiler set-state-in-effect rule: local state synced with store/prop inputs when the effect’s dependencies change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlayingPathIds(prev => {
      if (
        prev.length === selectedChain.length &&
        prev.every((id, idx) => id === selectedChain[idx])
      ) {
        return prev;
      }
      return selectedChain;
    });
    setPlayingPathServerId(leafColumn.serverId ?? null);
  }, [columns, currentTrack?.id, currentTrack?.serverId, isPlaying]);

  useEffect(() => {
    persistedPlayingPathIds = playingPathIds;
  }, [playingPathIds]);

  const resolveColumnsForTrack = useCallback(async (
    track: Track,
    roots: SubsonicDirectoryEntry[],
  ): Promise<Column[] | null> => {
    for (const root of roots) {
      if (!root.serverId || (track.serverId && root.serverId !== track.serverId)) continue;
      let indexes: SubsonicDirectoryEntry[];
      try {
        indexes = (await getMusicIndexesForServer(root.serverId, root.sourceId ?? root.id))
          .map(entry => ({ ...entry, serverId: root.serverId }));
      } catch {
        continue;
      }

      const artistEntry =
        indexes.find(it => it.isDir && !!track.artistId && it.id === track.artistId) ??
        indexes.find(it => it.isDir && it.title === track.artist);
      if (!artistEntry) continue;

      let artistChildren: SubsonicDirectoryEntry[];
      try {
        artistChildren = (await getMusicDirectoryForServer(root.serverId, artistEntry.id)).child
          .map(entry => ({ ...entry, serverId: root.serverId }));
      } catch {
        continue;
      }

      const albumEntry = artistChildren.find(it =>
        it.isDir &&
        (
          (!!track.albumId && (it.albumId === track.albumId || it.id === track.albumId)) ||
          (!!track.album && (it.album === track.album || it.title === track.album))
        ),
      );
      if (!albumEntry) continue;

      let albumChildren: SubsonicDirectoryEntry[];
      try {
        albumChildren = (await getMusicDirectoryForServer(root.serverId, albumEntry.id)).child
          .map(entry => ({ ...entry, serverId: root.serverId }));
      } catch {
        continue;
      }
      const songEntry = albumChildren.find(it => !it.isDir && it.id === track.id);
      if (!songEntry) continue;

      return [
        { id: 'root', name: '', items: roots, selectedId: root.id, loading: false, error: false, kind: 'roots' },
        { id: root.id, name: root.title, items: indexes, selectedId: artistEntry.id, loading: false, error: false, kind: 'indexes', serverId: root.serverId },
        { id: artistEntry.id, name: artistEntry.title, items: artistChildren, selectedId: albumEntry.id, loading: false, error: false, kind: 'directory', serverId: root.serverId },
        { id: albumEntry.id, name: albumEntry.title, items: albumChildren, selectedId: songEntry.id, loading: false, error: false, kind: 'directory', serverId: root.serverId },
      ];
    }
    return null;
  }, []);

  useEffect(() => {
    if (!currentTrack?.id) {
      autoResolvedTrackRef.current = null;
      return;
    }

    const hotkeyRevealTs = (location.state as { folderBrowserRevealTs?: number } | null)?.folderBrowserRevealTs ?? null;
    const hotkeyRevealRequested = hotkeyRevealTs !== null && hotkeyRevealTs !== lastHotkeyRevealTsRef.current;
    const forceReveal = hotkeyRevealRequested;
    if (autoResolvedTrackRef.current === trackIdentity && !forceReveal) return;

    const rootCol = columns[0];
    if (!rootCol || rootCol.loading || rootCol.error || rootCol.items.length === 0) return;

    const selectedLeafId =
      [...columns].reverse().find(c => c.selectedId)?.selectedId ?? null;
    const wasOnPreviousTrackPath = !!prevTrackIdRef.current && selectedLeafId === prevTrackIdRef.current;
    const selectedLeafColumn = [...columns].reverse().find(c => c.selectedId);
    if (selectedLeafId === currentTrack.id && selectedLeafColumn?.serverId === currentTrack.serverId) {
      autoResolvedTrackRef.current = trackIdentity;
      if (hotkeyRevealRequested) {
        lastHotkeyRevealTsRef.current = hotkeyRevealTs;
      }
      return;
    }
    if (!forceReveal && !wasOnPreviousTrackPath) return;

    let cancelled = false;
    resolveColumnsForTrack(currentTrack, rootCol.items).then((resolved) => {
      if (cancelled || !resolved) return;
      setColumns(resolved);
      const path = resolved.map(c => c.selectedId).filter((id): id is string => !!id);
      setPlayingPathIds(path);
      setPlayingPathServerId(currentTrack.serverId ?? null);
      const leafColIndex = resolved.length - 1;
      const leafRowIndex = resolved[leafColIndex].items.findIndex(it => it.id === currentTrack.id);
      if (leafRowIndex >= 0) setKeyboardPos({ colIndex: leafColIndex, rowIndex: leafRowIndex });
      autoResolvedTrackRef.current = trackIdentity;
      if (hotkeyRevealRequested) {
        lastHotkeyRevealTsRef.current = hotkeyRevealTs;
      }
    });

    return () => { cancelled = true; };
  }, [columns, currentTrack, trackIdentity, resolveColumnsForTrack, location.state, setColumns, setKeyboardPos]);

  useEffect(() => {
    prevTrackIdRef.current = currentTrack?.id ?? null;
  }, [currentTrack?.id]);

  const isSelectedPathForCurrentTrack =
    isPlaying && !!currentTrack && playingPathServerId === currentTrack.serverId && playingPathIds[playingPathIds.length - 1] === currentTrack.id;

  return {
    playingPathIds,
    setPlayingPathIds,
    isSelectedPathForCurrentTrack,
  };
}
