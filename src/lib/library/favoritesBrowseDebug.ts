import { frontendDebugLog } from '@/lib/api/debugLog';
import { isDebugLoggingModeActive } from '@/lib/perf/debugLoggingMode';
import { isPsyLabDebugTraceEnabled } from '@/lib/perf/psyLabDebugTraces';

let sessionT0 = 0;
const MAX_TRACE_ENTRIES = 80;

export type FavoritesBrowseTraceEntry = {
  step: string;
  elapsedMs: number;
  details?: Record<string, unknown>;
};

let traceEntries: FavoritesBrowseTraceEntry[] = [];
const traceListeners = new Set<() => void>();

function favoritesBrowseTraceActive(): boolean {
  return isPsyLabDebugTraceEnabled('favoritesBrowse');
}

function favoritesBrowseLogActive(): boolean {
  return isDebugLoggingModeActive() && favoritesBrowseTraceActive();
}

function recordTrace(step: string, details?: Record<string, unknown>): FavoritesBrowseTraceEntry {
  const entry = {
    step,
    elapsedMs: sessionT0 ? Math.round(performance.now() - sessionT0) : 0,
    ...(details ? { details } : {}),
  };
  traceEntries = [...traceEntries.slice(-(MAX_TRACE_ENTRIES - 1)), entry];
  for (const listener of traceListeners) listener();
  return entry;
}

export function getFavoritesBrowseTraceSnapshot(): readonly FavoritesBrowseTraceEntry[] {
  return traceEntries;
}

export function subscribeFavoritesBrowseTrace(listener: () => void): () => void {
  traceListeners.add(listener);
  return () => traceListeners.delete(listener);
}

export function formatFavoritesBrowseTraceReport(context: Record<string, unknown>): string {
  return [
    'favorites browse diagnostics',
    `context: ${JSON.stringify(context)}`,
    ...traceEntries.map(entry => [
      `elapsedMs: ${entry.elapsedMs}`,
      `step: ${entry.step}`,
      `details: ${JSON.stringify(entry.details ?? {})}`,
    ].join('\n')),
  ].join('\n\n');
}

export function beginFavoritesBrowseTrace(details?: Record<string, unknown>): void {
  sessionT0 = performance.now();
  if (favoritesBrowseTraceActive()) {
    traceEntries = [];
    for (const listener of traceListeners) listener();
  }
  emitFavoritesBrowseDebug('load_start', details);
}

export function emitFavoritesBrowseDebug(
  step: string,
  details?: Record<string, unknown>,
): void {
  if (!favoritesBrowseTraceActive()) return;
  const entry = recordTrace(step, details);
  if (!favoritesBrowseLogActive()) return;
  frontendDebugLog(
    'favorites-browse',
    JSON.stringify({
      step,
      elapsedMs: entry.elapsedMs,
      ...(details ? { details } : {}),
    }),
  );
}

export async function favoritesBrowseTimed<T>(
  step: string,
  fn: () => Promise<T>,
  details?: Record<string, unknown>,
): Promise<T> {
  if (!favoritesBrowseTraceActive()) return fn();
  const t0 = performance.now();
  emitFavoritesBrowseDebug(`${step}_start`, details);
  try {
    const result = await fn();
    emitFavoritesBrowseDebug(`${step}_done`, {
      ...details,
      stepMs: Math.round(performance.now() - t0),
    });
    return result;
  } catch (error) {
    emitFavoritesBrowseDebug(`${step}_error`, {
      ...details,
      stepMs: Math.round(performance.now() - t0),
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
