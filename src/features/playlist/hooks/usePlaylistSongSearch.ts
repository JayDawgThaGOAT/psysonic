import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import { search, searchForServer } from '@/lib/api/subsonicSearch';
import type { SubsonicSong } from '@/lib/api/subsonicTypes';

export interface PlaylistSongSearchResult {
  searchResults: SubsonicSong[];
  setSearchResults: React.Dispatch<React.SetStateAction<SubsonicSong[]>>;
  searching: boolean;
}

export function usePlaylistSongSearch(
  songs: SubsonicSong[],
  searchOpen: boolean,
  searchQuery: string,
  serverId?: string,
): PlaylistSongSearchResult {
  const [searchResults, setSearchResults] = useState<SubsonicSong[]>([]);
  const [searching, setSearching] = useState(false);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchGeneration = useRef(0);

  useEffect(() => {
    const generation = ++searchGeneration.current;
    if (!searchOpen || !searchQuery.trim()) {
      // React Compiler set-state-in-effect rule: reset derived async state when search becomes invalid.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSearchResults([]);
      setSearching(false);
      return;
    }
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = serverId
          ? await searchForServer(serverId, searchQuery, { songCount: 20, artistCount: 0, albumCount: 0 })
          : await search(searchQuery, { songCount: 20, artistCount: 0, albumCount: 0 });
        const existingIds = new Set(songs.map(s => s.id));
        if (searchGeneration.current === generation) {
          setSearchResults(res.songs
            .filter(s => !existingIds.has(s.id))
            .map(song => serverId ? { ...song, serverId } : song));
        }
      } catch { /* ignore: best-effort */ }
      if (searchGeneration.current === generation) setSearching(false);
    }, 350);
    return () => {
      if (searchDebounce.current) clearTimeout(searchDebounce.current);
      if (searchGeneration.current === generation) searchGeneration.current += 1;
    };
  }, [searchQuery, searchOpen, songs, serverId]);

  return { searchResults, setSearchResults, searching };
}
