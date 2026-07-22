import React from 'react';
import { queueSongStar, queueSongRating } from '@/features/playback/store/pendingStarSync';
import type { SubsonicSong } from '@/lib/api/subsonicTypes';
import { usePlayerStore } from '@/features/playback/store/playerStore';
import { ownedEntityKey } from '@/lib/util/ownedEntityKey';

export interface PlaylistStarRatingDeps {
  ratings: Record<string, number>;
  setRatings: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  starredSongs: Set<string>;
  setStarredSongs: React.Dispatch<React.SetStateAction<Set<string>>>;
  serverId?: string;
}

export interface PlaylistStarRatingActions {
  handleRate: (songId: string, rating: number) => void;
  handleToggleStar: (song: SubsonicSong, e: React.MouseEvent) => void;
}

export function usePlaylistStarRating(deps: PlaylistStarRatingDeps): PlaylistStarRatingActions {
  const { setRatings, starredSongs, setStarredSongs, serverId } = deps;
  const starredOverrides = usePlayerStore(s => s.starredOverrides);

  const handleRate = (songId: string, rating: number) => {
    setRatings(prev => ({ ...prev, [songId]: rating }));
    // F4: optimistic override + retried server sync via the central helper.
    queueSongRating(songId, rating, serverId, { scopedOverride: Boolean(serverId) });
  };

  const handleToggleStar = (song: SubsonicSong, e: React.MouseEvent) => {
    e.stopPropagation();
    const overrideKey = serverId ? ownedEntityKey({ id: song.id, serverId }) : song.id;
    const isStarred = overrideKey in starredOverrides ? starredOverrides[overrideKey] : starredSongs.has(song.id);
    setStarredSongs(prev => {
      const next = new Set(prev);
      if (isStarred) next.delete(song.id);
      else next.add(song.id);
      return next;
    });
    // F4: optimistic override + retried server sync via the central helper (no rollback).
    queueSongStar(song.id, !isStarred, song.serverId ?? serverId, { scopedOverride: Boolean(song.serverId ?? serverId) });
  };

  return { handleRate, handleToggleStar };
}
