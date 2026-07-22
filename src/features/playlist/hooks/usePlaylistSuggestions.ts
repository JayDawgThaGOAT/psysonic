import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import { getRandomSongs, getRandomSongsForServer } from '@/lib/api/subsonicLibrary';
import type { SubsonicSong } from '@/lib/api/subsonicTypes';

export interface PlaylistSuggestionsResult {
  suggestions: SubsonicSong[];
  setSuggestions: React.Dispatch<React.SetStateAction<SubsonicSong[]>>;
  loadingSuggestions: boolean;
  loadSuggestions: (currentSongs: SubsonicSong[]) => Promise<void>;
}

export function usePlaylistSuggestions(
  songs: SubsonicSong[],
  playlistId: string | undefined,
  serverId?: string,
): PlaylistSuggestionsResult {
  const [suggestions, setSuggestions] = useState<SubsonicSong[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const requestGeneration = useRef(0);

  const loadSuggestions = useCallback(async (currentSongs: SubsonicSong[]) => {
    if (!currentSongs.length) return;
    const generation = ++requestGeneration.current;
    // Count genres across playlist songs, pick the most common one
    const genreCounts: Record<string, number> = {};
    for (const s of currentSongs) {
      if (s.genre) genreCounts[s.genre] = (genreCounts[s.genre] ?? 0) + 1;
    }
    const genres = Object.entries(genreCounts).sort((a, b) => b[1] - a[1]);
    // Fall back to no genre filter if none of the songs have genre tags
    const genre = genres.length > 0 ? genres[Math.floor(Math.random() * Math.min(3, genres.length))][0] : undefined;
    const existingIds = new Set(currentSongs.map(s => s.id));
    setLoadingSuggestions(true);
    setSuggestions([]);
    try {
      const random = serverId
        ? await getRandomSongsForServer(serverId, 25, genre)
        : await getRandomSongs(25, genre);
      if (requestGeneration.current === generation) {
        setSuggestions(random
          .filter(s => !existingIds.has(s.id))
          .slice(0, 10)
          .map(song => serverId ? { ...song, serverId } : song));
      }
    } catch { /* ignore: best-effort */ }
    if (requestGeneration.current === generation) setLoadingSuggestions(false);
  }, [serverId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (songs.length > 0) {
        void loadSuggestions(songs);
      } else {
        requestGeneration.current += 1;
        setSuggestions([]);
        setLoadingSuggestions(false);
      }
    }, 0);
    return () => {
      requestGeneration.current += 1;
      window.clearTimeout(timer);
    };
  }, [playlistId, serverId, songs, loadSuggestions]);

  return { suggestions, setSuggestions, loadingSuggestions, loadSuggestions };
}
