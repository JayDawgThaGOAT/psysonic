import { frontendDebugLog } from '@/lib/api/debugLog';
import { isDebugLoggingModeActive } from '@/lib/perf/debugLoggingMode';
import { isPsyLabDebugTraceEnabled } from '@/lib/perf/psyLabDebugTraces';

let sessionT0 = 0;
let navT0 = 0;
const MAX_TRACE_ENTRIES = 80;

export type ArtistBrowseTraceEntry = {
  step: string;
  elapsedMs: number;
  details?: Record<string, unknown>;
};

let traceEntries: ArtistBrowseTraceEntry[] = [];
const traceListeners = new Set<() => void>();

function artistsBrowseTraceActive(): boolean {
  return isPsyLabDebugTraceEnabled('artistsBrowse');
}

function artistsBrowseLogActive(): boolean {
  return isDebugLoggingModeActive() && artistsBrowseTraceActive();
}

function recordTrace(step: string, details?: Record<string, unknown>): ArtistBrowseTraceEntry {
  const entry = {
    step,
    elapsedMs: sessionT0 ? Math.round(performance.now() - sessionT0) : 0,
    ...(details ? { details } : {}),
  };
  traceEntries = [...traceEntries.slice(-(MAX_TRACE_ENTRIES - 1)), entry];
  for (const listener of traceListeners) listener();
  return entry;
}

export function getArtistBrowseTraceSnapshot(): readonly ArtistBrowseTraceEntry[] {
  return traceEntries;
}

export function subscribeArtistBrowseTrace(listener: () => void): () => void {
  traceListeners.add(listener);
  return () => traceListeners.delete(listener);
}

export function formatArtistBrowseTraceReport(context: Record<string, unknown>): string {
  return [
    'artists browse diagnostics',
    `context: ${JSON.stringify(context)}`,
    ...traceEntries.map(entry => [
      `elapsedMs: ${entry.elapsedMs}`,
      `step: ${entry.step}`,
      `details: ${JSON.stringify(entry.details ?? {})}`,
    ].join('\n')),
  ].join('\n\n');
}

/**
 * PsyLab → Toggles → Artists → **Browse perf trace** (plus Logs → Debug).
 * Terminal + `psysonic-logs-*.log` via `frontend_debug_log` / `app_deprintln!`.
 */
export function markArtistsBrowseNavIntent(source: string): void {
  if (!artistsBrowseLogActive()) return;
  navT0 = performance.now();
  emitArtistsBrowseNav('nav_intent', { source });
}

/** Navigation pipeline (click → route → lazy chunk → page mount). */
export function emitArtistsBrowseNav(
  step: string,
  details?: Record<string, unknown>,
): void {
  if (!artistsBrowseTraceActive()) return;
  frontendDebugLog(
    'artists-browse',
    JSON.stringify({
      step,
      elapsedMs: navT0 ? Math.round(performance.now() - navT0) : 0,
      ...(details ? { details } : {}),
    }),
  );
}

export function beginArtistsBrowseTrace(details?: Record<string, unknown>): void {
  sessionT0 = performance.now();
  const navGapMs = navT0 ? Math.round(sessionT0 - navT0) : undefined;
  if (artistsBrowseTraceActive()) {
    traceEntries = [];
    for (const listener of traceListeners) listener();
  }
  emitArtistsBrowseDebug('session_start', {
    ...details,
    ...(navGapMs != null ? { navGapMs } : {}),
  });
  if (navGapMs != null) {
    emitArtistsBrowseNav('page_mount', { navGapMs, sessionElapsedMs: 0 });
  }
}

export function emitArtistsBrowseDebug(
  step: string,
  details?: Record<string, unknown>,
): void {
  if (!artistsBrowseTraceActive()) return;
  const entry = recordTrace(step, details);
  if (!artistsBrowseLogActive()) return;
  frontendDebugLog(
    'artists-browse',
    JSON.stringify({
      step,
      elapsedMs: entry.elapsedMs,
      ...(details ? { details } : {}),
    }),
  );
}

export async function artistBrowseTimed<T>(
  step: string,
  fn: () => Promise<T>,
  details?: Record<string, unknown>,
): Promise<T> {
  if (!artistsBrowseTraceActive()) return fn();
  const t0 = performance.now();
  emitArtistsBrowseDebug(`${step}_start`, details);
  try {
    const result = await fn();
    emitArtistsBrowseDebug(`${step}_done`, {
      ...details,
      stepMs: Math.round(performance.now() - t0),
    });
    return result;
  } catch (error) {
    emitArtistsBrowseDebug(`${step}_error`, {
      ...details,
      stepMs: Math.round(performance.now() - t0),
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
