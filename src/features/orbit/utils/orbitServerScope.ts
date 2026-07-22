import { canonicalQueueServerKey } from '@/lib/server/serverIndexKey';

/** Orbit is source-bound: only tracks owned by the session server may cross it. */
export function orbitServerMatches(sessionServerId: string, itemServerId: string | null | undefined): boolean {
  if (!sessionServerId || !itemServerId) return false;
  return canonicalQueueServerKey(sessionServerId) === canonicalQueueServerKey(itemServerId);
}

/** Ownerless legacy rows are safe only while the session server is still active. */
export function orbitActionServerMatches(
  sessionServerId: string,
  itemServerId: string | null | undefined,
  activeServerId: string | null | undefined,
): boolean {
  return orbitServerMatches(sessionServerId, itemServerId ?? activeServerId);
}
