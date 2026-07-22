import type { SubsonicSong } from '@/lib/api/subsonicTypes';
import type { PinSource } from '@/store/localPlaybackStore';
import {
  cancelledDownloads,
  useOfflineJobStore,
  type OfflinePinQueueEntry,
} from '@/features/offline/store/offlineJobStore';

export type OfflinePinKind = PinSource['kind'];

export interface OfflinePinTask {
  albumId: string;
  albumName: string;
  albumArtist: string;
  coverArt: string | undefined;
  year: number | undefined;
  songs: SubsonicSong[];
  serverId: string;
  type: OfflinePinKind;
  /** When set, bump `bulkProgress[groupId].done` after each album finishes. */
  artistProgressGroupId?: string;
}

type OfflinePinExecutor = (task: OfflinePinTask) => Promise<void>;

const pinTasks = new Map<string, OfflinePinTask>();
let executor: OfflinePinExecutor | null = null;
let queueDraining = false;

export function registerOfflinePinExecutor(fn: OfflinePinExecutor): void {
  executor = fn;
}

export function clearOfflinePinTasks(): void {
  pinTasks.clear();
}

function pinKey(albumId: string, serverId?: string): string {
  return serverId ? `${serverId}:${albumId}` : albumId;
}

export function removeOfflinePinTask(albumId: string, serverId?: string): void {
  pinTasks.delete(pinKey(albumId, serverId));
}

/** True when the album is waiting in the pin queue (not actively downloading). */
export function isAlbumPinQueued(albumId: string, serverId?: string): boolean {
  return useOfflineJobStore.getState().pinQueue.some(
    p => p.albumId === albumId
      && (!serverId || !p.serverId || p.serverId === serverId)
      && p.status === 'queued',
  );
}

/** Remove a queued pin before download starts. No-op if already downloading. */
export function dequeueOfflinePin(albumId: string, serverId?: string): boolean {
  const store = useOfflineJobStore.getState();
  const entry = store.pinQueue.find(p => (
    p.albumId === albumId && (!serverId || !p.serverId || p.serverId === serverId)
  ));
  if (!entry || entry.status !== 'queued') return false;
  cancelledDownloads.add(pinKey(albumId, entry.serverId ?? serverId));
  removeOfflinePinTask(albumId, entry.serverId ?? serverId);
  store.removePinFromQueue(albumId, entry.serverId ?? serverId);
  return true;
}

function isPinAlreadyScheduled(albumId: string, serverId: string): boolean {
  const { pinQueue } = useOfflineJobStore.getState();
  return pinQueue.some(p => p.albumId === albumId && (!p.serverId || p.serverId === serverId));
}

/**
 * Queue a library-tier pin. Duplicate album/playlist/artist ids coalesce to one
 * entry; the queue drains one album at a time so parallel pins do not evict each other.
 */
export function enqueueOfflinePin(task: OfflinePinTask): boolean {
  const taskKey = pinKey(task.albumId, task.serverId);
  cancelledDownloads.delete(taskKey);
  cancelledDownloads.delete(task.albumId);

  const store = useOfflineJobStore.getState();
  const existing = store.pinQueue.find(
    p => p.albumId === task.albumId && (!p.serverId || p.serverId === task.serverId),
  );
  if (existing?.status === 'downloading') {
    return false;
  }

  pinTasks.set(taskKey, task);

  if (existing?.status === 'queued') {
    scheduleOfflinePinQueue();
    return true;
  }
  if (isPinAlreadyScheduled(task.albumId, task.serverId)) {
    return false;
  }

  const entry: OfflinePinQueueEntry = {
    albumId: task.albumId,
    albumName: task.albumName,
    pinKind: task.type,
    status: 'queued',
    queuedAt: Date.now(),
    serverId: task.serverId,
  };
  useOfflineJobStore.setState(state => ({
    pinQueue: [...state.pinQueue, entry],
  }));
  scheduleOfflinePinQueue();
  return true;
}

export function scheduleOfflinePinQueue(): void {
  void drainOfflinePinQueue();
}

async function drainOfflinePinQueue(): Promise<void> {
  if (queueDraining || !executor) return;
  queueDraining = true;
  try {
    while (true) {
      const store = useOfflineJobStore.getState();
      const next = store.pinQueue.find(p => p.status === 'queued');
      if (!next) break;

      const nextKey = pinKey(next.albumId, next.serverId);
      if (cancelledDownloads.has(nextKey)) {
        store.removePinFromQueue(next.albumId, next.serverId);
        pinTasks.delete(nextKey);
        continue;
      }

      const task = pinTasks.get(nextKey);
      if (!task) {
        store.removePinFromQueue(next.albumId, next.serverId);
        continue;
      }

      store.setPinQueueStatus(next.albumId, 'downloading', next.serverId);
      try {
        await executor(task);
      } catch {
        /* per-track errors are recorded on jobs; continue queue */
      } finally {
        if (task.artistProgressGroupId) {
          store.bumpBulkProgressDone(task.artistProgressGroupId);
        }
        store.removePinFromQueue(next.albumId, next.serverId);
        pinTasks.delete(nextKey);
      }
    }
  } finally {
    queueDraining = false;
    const stillQueued = useOfflineJobStore.getState().pinQueue.some(p => p.status === 'queued');
    if (stillQueued) {
      void drainOfflinePinQueue();
    }
  }
}
