import type { SubsonicAlbum } from '@/lib/api/subsonicTypes';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ndListLosslessAlbumsPageForServer } from '@/lib/api/navidromeBrowse';
import AlbumRow from '@/features/album/components/AlbumRow';
import { useAuthStore } from '@/store/authStore';
import { useLibraryIndexStore } from '@/store/libraryIndexStore';
import { runLocalLosslessAlbums } from '@/lib/library/browseTextSearch';
import { LOSSLESS_MODE_QUERY } from '@/lib/library/losslessMode';

interface Props {
  /** Ordered Home scope. Omit to preserve the legacy active-server rail. */
  serverIds?: readonly string[];
  /** Bump when per-server library selections change without changing serverIds. */
  scopeVersion?: number;
  disableArtwork?: boolean;
  artworkSize?: number;
  windowArtworkByViewport?: boolean;
  initialArtworkBudget?: number;
}

const TARGET_ALBUMS = 20;
const NETWORK_SONGS_PER_SERVER = 100;
const LOSSLESS_RAIL_DEADLINE_MS = 4000;

async function withinDeadline<T>(request: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      request,
      new Promise<T>(resolve => {
        timer = setTimeout(() => resolve(fallback), LOSSLESS_RAIL_DEADLINE_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function allocateQuotas(serverCount: number): number[] {
  if (serverCount <= 0) return [];
  const base = Math.floor(TARGET_ALBUMS / serverCount);
  const remainder = TARGET_ALBUMS % serverCount;
  return Array.from({ length: serverCount }, (_, index) => base + (index < remainder ? 1 : 0));
}

function roundRobinAlbums(groups: SubsonicAlbum[][]): SubsonicAlbum[] {
  const result: SubsonicAlbum[] = [];
  const maxLength = Math.max(0, ...groups.map(group => group.length));
  for (let index = 0; index < maxLength; index++) {
    for (const group of groups) {
      const album = group[index];
      if (album) result.push(album);
    }
  }
  return result.slice(0, TARGET_ALBUMS);
}

export default function LosslessAlbumsRail({
  serverIds,
  scopeVersion = 0,
  disableArtwork = false,
  artworkSize,
  windowArtworkByViewport,
  initialArtworkBudget,
}: Props) {
  const { t } = useTranslation();
  const activeServerId = useAuthStore(s => s.activeServerId);
  const indexEnabled = useLibraryIndexStore(s => s.masterEnabled);
  const orderedServerIds = useMemo(() => {
    const requested = serverIds ?? (activeServerId ? [activeServerId] : []);
    return [...new Set(requested.filter(Boolean))];
  }, [activeServerId, serverIds]);
  const [albums, setAlbums] = useState<SubsonicAlbum[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (orderedServerIds.length === 0) {
        setAlbums([]);
        return;
      }

      const quotas = allocateQuotas(orderedServerIds.length);
      const groups = await Promise.all(orderedServerIds.map(async (serverId, index) => {
        const quota = quotas[index];
        if (quota <= 0) return [];

        if (indexEnabled) {
          const local = await runLocalLosslessAlbums(serverId, quota, 0);
          if (local && local.albums.length > 0) {
            return local.albums.slice(0, quota).map(album => ({ ...album, serverId }));
          }
        }

        try {
          const page = await withinDeadline(
            ndListLosslessAlbumsPageForServer(serverId, {
              targetNewAlbums: quota,
              songsPerPage: NETWORK_SONGS_PER_SERVER,
              maxPagesPerCall: 1,
            }),
            { entries: [], done: false, nextSongOffset: 0 },
          );
          return page.entries.slice(0, quota).map(entry => entry.album);
        } catch {
          return [];
        }
      }));

      if (!cancelled) setAlbums(roundRobinAlbums(groups));
    })();
    return () => { cancelled = true; };
  }, [indexEnabled, orderedServerIds, scopeVersion]);

  if (albums.length === 0) return null;

  return (
    <AlbumRow
      title={t('home.losslessAlbums')}
      titleLink="/lossless-albums"
      albums={albums}
      disableArtwork={disableArtwork}
      artworkSize={artworkSize}
      windowArtworkByViewport={windowArtworkByViewport}
      initialArtworkBudget={initialArtworkBudget}
      albumLinkQuery={LOSSLESS_MODE_QUERY}
    />
  );
}
