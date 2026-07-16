import { frontendDebugLog } from '@/lib/api/debugLog';
import { isDebugLoggingModeActive } from '@/lib/perf/debugLoggingMode';
import { isPsyLabDebugTraceEnabled } from '@/lib/perf/psyLabDebugTraces';

let sessionT0 = 0;
let navT0 = 0;
const MAX_TRACE_ENTRIES = 80;

export type AlbumBrowseTraceEntry = {
  step: string;
  elapsedMs: number;
  details?: Record<string, unknown>;
};

let traceEntries: AlbumBrowseTraceEntry[] = [];
const traceListeners = new Set<() => void>();

function albumsBrowseDiagnosticsActive(): boolean {
  return isPsyLabDebugTraceEnabled('albumsBrowse');
}

function albumsBrowseLogActive(): boolean {
  return isDebugLoggingModeActive() && albumsBrowseDiagnosticsActive();
}

function publishTrace(): void {
  for (const listener of traceListeners) listener();
}

function recordTrace(step: string, details?: Record<string, unknown>): AlbumBrowseTraceEntry {
  const entry = {
    step,
    elapsedMs: sessionT0 ? Math.round(performance.now() - sessionT0) : 0,
    ...(details ? { details } : {}),
  };
  traceEntries = [...traceEntries.slice(-(MAX_TRACE_ENTRIES - 1)), entry];
  publishTrace();
  return entry;
}

export function getAlbumBrowseTraceSnapshot(): readonly AlbumBrowseTraceEntry[] {
  return traceEntries;
}

export function subscribeAlbumBrowseTrace(listener: () => void): () => void {
  traceListeners.add(listener);
  return () => traceListeners.delete(listener);
}

export function formatAlbumBrowseTraceReport(context: Record<string, unknown>): string {
  return [
    'albums browse diagnostics',
    `context: ${JSON.stringify(context)}`,
    ...traceEntries.map(entry => [
      `elapsedMs: ${entry.elapsedMs}`,
      `step: ${entry.step}`,
      `details: ${JSON.stringify(entry.details ?? {})}`,
    ].join('\n')),
  ].join('\n\n');
}

/**
 * PsyLab → Toggles → Albums → **Browse perf trace** (plus Logs → Debug).
 * Terminal + `psysonic-logs-*.log` via `frontend_debug_log` / `app_deprintln!`.
 */
export function markAlbumBrowseNavIntent(source: string): void {
  if (!albumsBrowseDiagnosticsActive()) return;
  navT0 = performance.now();
  emitAlbumBrowseNav('nav_intent', { source });
}

/** Navigation pipeline (click → route → lazy chunk → page mount). */
export function emitAlbumBrowseNav(
  step: string,
  details?: Record<string, unknown>,
): void {
  if (!albumsBrowseLogActive()) return;
  void frontendDebugLog(
    'albums-browse',
    JSON.stringify({
      step,
      elapsedMs: navT0 ? Math.round(performance.now() - navT0) : 0,
      ...(details ? { details } : {}),
    }),
  );
}

export function beginAlbumBrowseTrace(details?: Record<string, unknown>): void {
  sessionT0 = performance.now();
  const navGapMs = navT0 ? Math.round(sessionT0 - navT0) : undefined;
  if (albumsBrowseDiagnosticsActive()) {
    traceEntries = [];
    publishTrace();
    recordTrace('session_start', {
      ...details,
      ...(navGapMs != null ? { navGapMs } : {}),
    });
  }
  if (navGapMs != null) {
    emitAlbumBrowseNav('page_mount', { navGapMs, sessionElapsedMs: 0 });
  }
}

export function emitAlbumBrowseDebug(
  step: string,
  details?: Record<string, unknown>,
): void {
  if (!albumsBrowseDiagnosticsActive()) return;
  const entry = recordTrace(step, details);
  if (!albumsBrowseLogActive()) return;
  void frontendDebugLog(
    'albums-browse',
    JSON.stringify({
      step,
        elapsedMs: entry.elapsedMs,
      ...(details ? { details } : {}),
    }),
  );
}

export async function albumBrowseTimed<T>(
  step: string,
  fn: () => Promise<T>,
  details?: Record<string, unknown>,
): Promise<T> {
  if (!albumsBrowseDiagnosticsActive()) return fn();
  const t0 = performance.now();
  emitAlbumBrowseDebug(`${step}_start`, details);
  try {
    const result = await fn();
    emitAlbumBrowseDebug(`${step}_done`, {
      ...details,
      stepMs: Math.round(performance.now() - t0),
    });
    return result;
  } catch (error) {
    emitAlbumBrowseDebug(`${step}_error`, {
      ...details,
      stepMs: Math.round(performance.now() - t0),
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
