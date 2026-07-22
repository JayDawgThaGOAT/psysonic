import { useSyncExternalStore } from 'react';
import { subscribeLibrarySyncIdle } from '@/lib/api/library/events';
import { resolveServerIdForIndexKey } from '@/lib/server/serverLookup';
import { resolveIndexKey } from '@/lib/server/serverIndexKey';

const syncRevisionByScope = new Map<string, number>();
const listeners = new Set<() => void>();
let syncHookRegistered = false;
let anySyncRevision = 0;

function notifySyncRevisionListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

function scopeKeysForServer(serverId: string): string[] {
  const keys = new Set<string>([serverId]);
  keys.add(resolveIndexKey(serverId));
  const profileId = resolveServerIdForIndexKey(serverId);
  if (profileId) keys.add(profileId);
  return [...keys];
}

function bumpOfflineLocalLibrarySyncRevision(serverIdFromEvent: string): void {
  anySyncRevision += 1;
  for (const key of scopeKeysForServer(serverIdFromEvent)) {
    syncRevisionByScope.set(key, (syncRevisionByScope.get(key) ?? 0) + 1);
  }
  notifySyncRevisionListeners();
}

/** Monotonic revision bumped after any successful library sync-idle event. */
export function librarySyncRevision(): number {
  ensureOfflineLocalLibrarySyncHook();
  return anySyncRevision;
}

/** Reactive revision for views that aggregate more than one server index. */
export function useLibrarySyncRevision(): number {
  ensureOfflineLocalLibrarySyncHook();
  return useSyncExternalStore(
    onStoreChange => {
      listeners.add(onStoreChange);
      return () => listeners.delete(onStoreChange);
    },
    librarySyncRevision,
    () => 0,
  );
}

/** Aggregate successful sync revision among the supplied canonical server scopes. */
export function libraryScopeSyncRevision(serverIds: readonly string[]): number {
  ensureOfflineLocalLibrarySyncHook();
  let revision = 0;
  const serverKeys = new Set(serverIds.map(resolveIndexKey));
  for (const serverKey of serverKeys) {
    revision += offlineLocalLibrarySyncRevision(serverKey);
  }
  return revision;
}

/** Reactive revision limited to the supplied server scopes. */
export function useLibraryScopeSyncRevision(serverIds: readonly string[]): number {
  ensureOfflineLocalLibrarySyncHook();
  return useSyncExternalStore(
    onStoreChange => {
      listeners.add(onStoreChange);
      return () => listeners.delete(onStoreChange);
    },
    () => libraryScopeSyncRevision(serverIds),
    () => 0,
  );
}

function ensureOfflineLocalLibrarySyncHook(): void {
  if (syncHookRegistered) return;
  syncHookRegistered = true;
  if (typeof subscribeLibrarySyncIdle !== 'function') return;
  void subscribeLibrarySyncIdle(payload => {
    if (payload.ok) {
      // Rust drains identity invalidations before publishing sync-idle.
      bumpOfflineLocalLibrarySyncRevision(payload.serverId);
    }
  });
}

/** Monotonic revision bumped after successful library sync-idle for a server scope. */
export function offlineLocalLibrarySyncRevision(serverId: string): number {
  ensureOfflineLocalLibrarySyncHook();
  let max = 0;
  for (const key of scopeKeysForServer(serverId)) {
    max = Math.max(max, syncRevisionByScope.get(key) ?? 0);
  }
  return max;
}

/** Reactive library sync revision for offline browse reload keys. */
export function useOfflineLocalLibrarySyncRevision(
  serverId: string | null | undefined,
): number {
  ensureOfflineLocalLibrarySyncHook();
  return useSyncExternalStore(
    onStoreChange => {
      listeners.add(onStoreChange);
      return () => listeners.delete(onStoreChange);
    },
    () => (serverId ? offlineLocalLibrarySyncRevision(serverId) : 0),
    () => 0,
  );
}

/** Test-only reset. */
export function resetOfflineLocalLibrarySyncRevisionForTests(): void {
  syncRevisionByScope.clear();
  anySyncRevision = 0;
  syncHookRegistered = false;
}

/** Test-only bump without going through sync-idle events. */
export function bumpOfflineLocalLibrarySyncRevisionForTests(serverId: string): void {
  bumpOfflineLocalLibrarySyncRevision(serverId);
}
