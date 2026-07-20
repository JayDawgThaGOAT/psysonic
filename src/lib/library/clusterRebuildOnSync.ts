/**
 * Rebuild library-cluster identity keys after each successful library sync so
 * multi-library dedup does not use stale precomputed keys.
 */
import { commands } from '@/generated/bindings';
import { subscribeLibrarySyncIdle } from '@/lib/api/library/events';
import { resolveIndexKey } from '@/lib/server/serverIndexKey';

const inFlight = new Map<string, Promise<boolean>>();

export function rebuildClusterForIndexKey(indexKey: string): Promise<boolean> {
  const existing = inFlight.get(indexKey);
  if (existing) return existing;
  const promise = (async () => {
    try {
      const res = await commands.libraryClusterRebuild(indexKey);
      if (res.status === 'error') {
        console.warn('[psysonic] libraryClusterRebuild failed:', indexKey, res.error);
        return false;
      }
      return true;
    } catch (err) {
      console.warn('[psysonic] libraryClusterRebuild error:', indexKey, err);
      return false;
    }
  })();
  inFlight.set(indexKey, promise);
  void promise.finally(() => {
    if (inFlight.get(indexKey) === promise) inFlight.delete(indexKey);
  });
  return promise;
}

/** Subscribe globally; call the returned fn on teardown (e.g. MainApp unmount). */
export function initClusterRebuildOnSync(): () => void {
  let unlisten: (() => void) | undefined;
  let stopped = false;

  void subscribeLibrarySyncIdle(payload => {
    if (!payload.ok) return;
    const indexKey = resolveIndexKey(payload.serverId);
    void rebuildClusterForIndexKey(indexKey);
  }).then(fn => {
    if (stopped) fn();
    else unlisten = fn;
  });

  return () => {
    stopped = true;
    unlisten?.();
    unlisten = undefined;
  };
}
