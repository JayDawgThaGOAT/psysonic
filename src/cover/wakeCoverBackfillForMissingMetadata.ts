import { wakeLibraryCoverBackfill } from '@/lib/library/coverBackfillWake';
import { coverStrategyAllowsLibraryBackfill } from '@/lib/library/coverStrategy';
import { findServerByIdOrIndexKey } from '@/lib/server/serverLookup';
import { useAuthStore } from '@/store/authStore';
import { useCoverStrategyStore } from '@/store/coverStrategyStore';

let lastWakeMs: number | null = null;
const WAKE_COOLDOWN_MS = 4_000;

/** Nudge aggressive backfill when missing metadata belongs to its active session. */
export function wakeCoverBackfillForMissingMetadata(serverId: string): void {
  const ownerServerId = serverId.trim();
  if (!ownerServerId) return;

  // The native full-pass worker has one active-server session. Never let a
  // cross-server row wake that session for the wrong owner.
  const activeServerId = useAuthStore.getState().activeServerId;
  const ownerProfileId = findServerByIdOrIndexKey(ownerServerId)?.id ?? ownerServerId;
  if (!activeServerId || ownerProfileId !== activeServerId) return;

  const now = Date.now();
  if (lastWakeMs !== null && now - lastWakeMs < WAKE_COOLDOWN_MS) return;

  const strategy = useCoverStrategyStore.getState().getStrategyForServer(ownerServerId);
  if (!coverStrategyAllowsLibraryBackfill(strategy)) return;

  lastWakeMs = now;
  wakeLibraryCoverBackfill();
}
