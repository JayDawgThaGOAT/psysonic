import { useSyncExternalStore } from 'react';

export type ServerReachability = 'available' | 'unavailable';

const reachabilityByServer = new Map<string, ServerReachability>();
const listeners = new Set<() => void>();
let unavailableServerIds: ReadonlySet<string> = new Set();

function publish(): void {
  unavailableServerIds = new Set(
    [...reachabilityByServer.entries()]
      .filter(([, reachability]) => reachability === 'unavailable')
      .map(([serverId]) => serverId),
  );
  listeners.forEach(listener => listener());
}

export function setServerReachability(serverId: string, reachability: ServerReachability): void {
  if (reachabilityByServer.get(serverId) === reachability) return;
  reachabilityByServer.set(serverId, reachability);
  publish();
}

export function getUnavailableServerIds(): ReadonlySet<string> {
  return unavailableServerIds;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useUnavailableServerIds(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, getUnavailableServerIds, getUnavailableServerIds);
}

export function resetServerReachabilitySnapshot(): void {
  if (reachabilityByServer.size === 0) return;
  reachabilityByServer.clear();
  publish();
}
