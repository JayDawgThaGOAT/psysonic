import { frontendDebugLog } from '@/lib/api/debugLog';
import { isDebugLoggingModeActive } from '@/lib/perf/debugLoggingMode';
import { isPsyLabDebugTraceEnabled } from '@/lib/perf/psyLabDebugTraces';

let sessionT0 = 0;
const MAX_TRACE_ENTRIES = 80;

export type TrackBrowseTraceEntry = {
  step: string;
  elapsedMs: number;
  details?: Record<string, unknown>;
};

let traceEntries: TrackBrowseTraceEntry[] = [];
const traceListeners = new Set<() => void>();

function tracksBrowseDiagnosticsActive(): boolean {
  return isPsyLabDebugTraceEnabled('tracksBrowse');
}

function tracksBrowseLogActive(): boolean {
  return isDebugLoggingModeActive() && tracksBrowseDiagnosticsActive();
}

function publishTrace(): void {
  for (const listener of traceListeners) listener();
}

function recordTrace(step: string, details?: Record<string, unknown>): TrackBrowseTraceEntry {
  const entry = {
    step,
    elapsedMs: sessionT0 ? Math.round(performance.now() - sessionT0) : 0,
    ...(details ? { details } : {}),
  };
  traceEntries = [...traceEntries.slice(-(MAX_TRACE_ENTRIES - 1)), entry];
  publishTrace();
  return entry;
}

export function getTrackBrowseTraceSnapshot(): readonly TrackBrowseTraceEntry[] {
  return traceEntries;
}

export function subscribeTrackBrowseTrace(listener: () => void): () => void {
  traceListeners.add(listener);
  return () => traceListeners.delete(listener);
}

export function formatTrackBrowseTraceReport(context: Record<string, unknown>): string {
  return [
    'tracks browse diagnostics',
    `context: ${JSON.stringify(context)}`,
    ...traceEntries.map(entry => [
      `elapsedMs: ${entry.elapsedMs}`,
      `step: ${entry.step}`,
      `details: ${JSON.stringify(entry.details ?? {})}`,
    ].join('\n')),
  ].join('\n\n');
}

export function beginTrackBrowseTrace(details?: Record<string, unknown>): void {
  sessionT0 = performance.now();
  if (!tracksBrowseDiagnosticsActive()) return;
  traceEntries = [];
  publishTrace();
  recordTrace('session_start', details);
}

export function emitTrackBrowseDebug(
  step: string,
  details?: Record<string, unknown>,
): void {
  if (!tracksBrowseDiagnosticsActive()) return;
  const entry = recordTrace(step, details);
  if (!tracksBrowseLogActive()) return;
  void frontendDebugLog(
    'tracks-browse',
    JSON.stringify({
      step,
      elapsedMs: entry.elapsedMs,
      ...(details ? { details } : {}),
    }),
  );
}

export async function trackBrowseTimed<T>(
  step: string,
  fn: () => Promise<T>,
  details?: Record<string, unknown>,
): Promise<T> {
  if (!tracksBrowseDiagnosticsActive()) return fn();
  const t0 = performance.now();
  emitTrackBrowseDebug(`${step}_start`, details);
  try {
    const result = await fn();
    emitTrackBrowseDebug(`${step}_done`, {
      ...details,
      stepMs: Math.round(performance.now() - t0),
    });
    return result;
  } catch (error) {
    emitTrackBrowseDebug(`${step}_error`, {
      ...details,
      stepMs: Math.round(performance.now() - t0),
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
