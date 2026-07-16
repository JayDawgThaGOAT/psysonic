import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LibraryScopePair } from '@/lib/api/library/scopeReads';
import { loadLocalNewReleases } from '@/lib/library/newReleasesLocal';
import {
  NEW_RELEASES_RESET_DELAY_MS,
  NEW_RELEASES_SEEN_MAX_IDS,
  NEW_RELEASES_UNREAD_POLL_MS,
  NEW_RELEASES_UNREAD_SAMPLE_SIZE,
  mergeSeenNewReleaseIdsCap,
  newReleasesSeenStorageKey as buildNewReleasesSeenStorageKey,
} from '@/features/sidebar/utils/sidebarHelpers';

interface Args {
  anchorServerId: string | null;
  scopes: LibraryScopePair[];
  scopeFingerprint: string;
  isLoggedIn: boolean;
  pathname: string;
}

export function useSidebarNewReleasesUnread({
  anchorServerId,
  scopes,
  scopeFingerprint,
  isLoggedIn,
  pathname,
}: Args): number {
  const [newReleasesUnreadCount, setNewReleasesUnreadCount] = useState(0);
  const newReleasesRefreshSeqRef = useRef(0);
  const newReleasesPageEnteredAtRef = useRef<number | null>(null);
  const newReleasesResetTimerRef = useRef<number | null>(null);

  const scopedSeenStorageKey = useMemo(
    () => buildNewReleasesSeenStorageKey(scopeFingerprint),
    [scopeFingerprint],
  );

  const readSeenNewReleaseIds = useCallback((): string[] => {
    try {
      const raw = localStorage.getItem(scopedSeenStorageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0);
    } catch {
      return [];
    }
  }, [scopedSeenStorageKey]);

  const writeSeenNewReleaseIds = useCallback((ids: string[]) => {
    const normalized = Array.from(new Set(ids.filter(Boolean))).slice(0, NEW_RELEASES_SEEN_MAX_IDS);
    localStorage.setItem(scopedSeenStorageKey, JSON.stringify(normalized));
  }, [scopedSeenStorageKey]);

  const refreshNewReleasesUnread = useCallback(async (markAsSeen = false) => {
    const seq = ++newReleasesRefreshSeqRef.current;
    const isCurrent = () => seq === newReleasesRefreshSeqRef.current;

    if (!isLoggedIn || !anchorServerId || scopes.length === 0) {
      if (isCurrent()) setNewReleasesUnreadCount(0);
      return;
    }

    try {
      const newest = await loadLocalNewReleases(
        anchorServerId,
        scopes,
        NEW_RELEASES_UNREAD_SAMPLE_SIZE,
      );
      const newestIds = newest.albums.map(a => a.id).filter(Boolean);
      const seenIds = readSeenNewReleaseIds();

      if (seenIds.length === 0) {
        // First bootstrap for this server/scope: baseline is "already seen".
        writeSeenNewReleaseIds(newestIds);
        if (isCurrent()) setNewReleasesUnreadCount(0);
        return;
      }

      if (markAsSeen) {
        // Prepend the live newest sample so a full `seenIds` list + slice(500)
        // cannot silently discard freshly "read" albums (fixes badge coming back).
        writeSeenNewReleaseIds(mergeSeenNewReleaseIdsCap(seenIds, newestIds, NEW_RELEASES_SEEN_MAX_IDS));
        if (isCurrent()) setNewReleasesUnreadCount(0);
        return;
      }

      const seenSet = new Set(seenIds);
      const unread = newestIds.reduce((count, id) => count + (seenSet.has(id) ? 0 : 1), 0);

      if (isCurrent()) setNewReleasesUnreadCount(unread);
    } catch {
      // Keep previous value on transient network/API errors.
    }
  }, [
    anchorServerId,
    isLoggedIn,
    readSeenNewReleaseIds,
    scopes,
    writeSeenNewReleaseIds,
  ]);

  useEffect(() => {
    const onNewReleasesPage = pathname.startsWith('/new-releases');
    if (newReleasesResetTimerRef.current != null) {
      window.clearTimeout(newReleasesResetTimerRef.current);
      newReleasesResetTimerRef.current = null;
    }

    if (onNewReleasesPage) {
      if (newReleasesPageEnteredAtRef.current == null) {
        newReleasesPageEnteredAtRef.current = Date.now();
      }
      const elapsed = Date.now() - newReleasesPageEnteredAtRef.current;
      const shouldMarkAsSeen = elapsed >= NEW_RELEASES_RESET_DELAY_MS;
      void refreshNewReleasesUnread(shouldMarkAsSeen);
      if (!shouldMarkAsSeen) {
        const remaining = NEW_RELEASES_RESET_DELAY_MS - elapsed;
        newReleasesResetTimerRef.current = window.setTimeout(() => {
          newReleasesResetTimerRef.current = null;
          void refreshNewReleasesUnread(true);
        }, remaining);
      }
    } else {
      newReleasesPageEnteredAtRef.current = null;
      void refreshNewReleasesUnread(false);
    }

    const timer = window.setInterval(() => {
      const activeOnNewReleases = pathname.startsWith('/new-releases');
      const enteredAt = newReleasesPageEnteredAtRef.current;
      const delayedSeenReached =
        activeOnNewReleases &&
        enteredAt != null &&
        Date.now() - enteredAt >= NEW_RELEASES_RESET_DELAY_MS;
      void refreshNewReleasesUnread(delayedSeenReached);
    }, NEW_RELEASES_UNREAD_POLL_MS);
    return () => {
      window.clearInterval(timer);
      if (newReleasesResetTimerRef.current != null) {
        window.clearTimeout(newReleasesResetTimerRef.current);
        newReleasesResetTimerRef.current = null;
      }
    };
  }, [pathname, refreshNewReleasesUnread]);

  return newReleasesUnreadCount;
}
