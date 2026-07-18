import React, { useEffect, useState } from 'react';
import { resolveAlbum, resolveArtist, resolveMediaServerId } from '@/features/offline';
import { AddToPlaylistSubmenu } from '@/features/contextMenu/components/AddToPlaylistSubmenu';

interface AlbumProps {
  albumId: string;
  serverId?: string;
  onDone: () => void;
  triggerId?: string;
}

export function AlbumToPlaylistSubmenu({ albumId, serverId: ownerServerId, onDone, triggerId }: AlbumProps) {
  const [resolvedIds, setResolvedIds] = useState<string[] | null>(null);
  const [resolvedServerId] = useState(() => resolveMediaServerId(ownerServerId) ?? undefined);

  useEffect(() => {
    const serverId = resolvedServerId;
    if (!serverId) {
      // React Compiler set-state-in-effect rule: state set from an async result resolved in this effect.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResolvedIds([]);
      return;
    }
    resolveAlbum(serverId, albumId).then((data) => {
      setResolvedIds(data ? data.songs.map((s) => s.id) : []);
    }).catch(() => setResolvedIds([]));
  }, [albumId, resolvedServerId]);

  if (resolvedIds === null) {
    return (
      <div className="context-submenu" style={{ display: 'flex', justifyContent: 'center', padding: '0.75rem' }}>
        <div className="spinner" style={{ width: 16, height: 16 }} />
      </div>
    );
  }
  if (resolvedIds.length === 0) return null;
  return <AddToPlaylistSubmenu songIds={resolvedIds} serverId={resolvedServerId} onDone={onDone} triggerId={triggerId} />;
}

interface ArtistProps {
  artistId: string;
  serverId?: string;
  onDone: () => void;
  triggerId?: string;
}

export function ArtistToPlaylistSubmenu({ artistId, serverId: ownerServerId, onDone, triggerId }: ArtistProps) {
  const [resolvedIds, setResolvedIds] = useState<string[] | null>(null);
  const [resolvedServerId] = useState(() => resolveMediaServerId(ownerServerId) ?? undefined);

  useEffect(() => {
    (async () => {
      const serverId = resolvedServerId;
      if (!serverId) {
        setResolvedIds([]);
        return;
      }
      const artistData = await resolveArtist(serverId, artistId);
      if (!artistData) {
        setResolvedIds([]);
        return;
      }
      const albumSongs = await Promise.all(
        artistData.albums.map(a => resolveAlbum(serverId, a.id).then(r => r?.songs ?? [])),
      );
      setResolvedIds(albumSongs.flat().map(s => s.id));
    })().catch(() => setResolvedIds([]));
  }, [artistId, resolvedServerId]);

  if (resolvedIds === null) {
    return (
      <div className="context-submenu" style={{ display: 'flex', justifyContent: 'center', padding: '0.75rem' }}>
        <div className="spinner" style={{ width: 16, height: 16 }} />
      </div>
    );
  }
  if (resolvedIds.length === 0) return null;
  return <AddToPlaylistSubmenu songIds={resolvedIds} serverId={resolvedServerId} onDone={onDone} triggerId={triggerId} />;
}
