import type React from 'react';
import type { TFunction } from 'i18next';
import { ndGetSmartPlaylist, ndListSmartPlaylists } from '@/lib/api/navidromeSmart';
import type { SubsonicGenre, SubsonicPlaylist } from '@/lib/api/subsonicTypes';
import {
  defaultSmartFilters, displayPlaylistName, isSmartPlaylistName,
  parseSmartRulesToFilters, type SmartFilters,
} from '@/features/playlist/utils/playlistsSmart';
import { showToast } from '@/lib/dom/toast';

export interface RunPlaylistsOpenSmartEditorDeps {
  pl: SubsonicPlaylist;
  serverId: string;
  isNavidromeServer: boolean;
  allGenres: SubsonicGenre[];
  t: TFunction;
  setSmartFilters: React.Dispatch<React.SetStateAction<SmartFilters>>;
  setEditingSmartId: React.Dispatch<React.SetStateAction<string | null>>;
  setGenreQuery: React.Dispatch<React.SetStateAction<string>>;
  setCreating: React.Dispatch<React.SetStateAction<boolean>>;
  setCreatingSmart: React.Dispatch<React.SetStateAction<boolean>>;
  setCreatingSmartBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setEditingSmartServerId: React.Dispatch<React.SetStateAction<string | null>>;
  isCurrent?: () => boolean;
}

export async function runPlaylistsOpenSmartEditor(deps: RunPlaylistsOpenSmartEditorDeps): Promise<void> {
  const {
    pl, serverId, isNavidromeServer, allGenres, t,
    setSmartFilters, setEditingSmartId, setGenreQuery,
    setCreating, setCreatingSmart, setCreatingSmartBusy, setEditingSmartServerId,
  } = deps;

  if (!isNavidromeServer || !isSmartPlaylistName(pl.name)) return;
  setCreatingSmartBusy(true);
  try {
    let target: { id: string; name: string; rules?: Record<string, unknown> } | null = null;
    try {
      // Prefer direct endpoint for this playlist: returns freshest rules.
      const direct = await ndGetSmartPlaylist(pl.id, serverId);
      if (direct.id && (direct.rules || isSmartPlaylistName(direct.name))) target = direct;
    } catch {
      // Fallback to list endpoint below.
    }
    if (!target) {
      const smart = await ndListSmartPlaylists(serverId);
      target = smart.find((v) =>
        v.id === pl.id ||
        v.name === pl.name ||
        displayPlaylistName(v.name) === displayPlaylistName(pl.name),
      ) ?? null;
    }
    if (deps.isCurrent && !deps.isCurrent()) return;
    if (target) {
      const parsed = parseSmartRulesToFilters(target.rules, target.name);
      if (parsed.untaggedGenresOnly) {
        parsed.selectedGenres = allGenres.map(g => g.value);
      }
      setSmartFilters(parsed);
      setEditingSmartId(target.id);
    } else {
      // Fallback: allow editing even if Navidrome smart list endpoint
      // doesn't return this playlist (shared/migrated/legacy edge cases).
      setSmartFilters({
        ...defaultSmartFilters,
        name: displayPlaylistName(pl.name),
      });
      setEditingSmartId(pl.id);
    }
    setEditingSmartServerId(serverId);
    setGenreQuery('');
    setCreating(false);
    setCreatingSmart(true);
  } catch {
    if (deps.isCurrent && !deps.isCurrent()) return;
    // Degrade gracefully instead of blocking the editor on transient/API errors.
    setSmartFilters({
      ...defaultSmartFilters,
      name: displayPlaylistName(pl.name),
    });
    setGenreQuery('');
    setEditingSmartId(pl.id);
    setEditingSmartServerId(serverId);
    setCreating(false);
    setCreatingSmart(true);
    showToast(t('smartPlaylists.loadFailed'), 3500, 'warning');
  } finally {
    if (!deps.isCurrent || deps.isCurrent()) setCreatingSmartBusy(false);
  }
}
