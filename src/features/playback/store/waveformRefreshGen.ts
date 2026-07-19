import {
  analysisTrackRefKey,
  type AnalysisTrackRef,
} from '@/features/playback/store/analysisTrackRef';

/**
 * Last-write-wins generation counter per track. Avoids applying a stale
 * empty waveform read when `analysis:waveform-updated` bumps the gen after
 * SQLite commit while an older `analysis_get_waveform_for_track` is still
 * in flight. Gen is bumped only on explicit invalidation (waveform-updated,
 * analysis storage), not on every `refreshWaveformForTrack` call —
 * otherwise bursts (Lucky Mix, queue) cancel each other.
 *
 * Typical usage:
 *
 *   const gen = getWaveformRefreshGen(ref);
 *   const row = await invoke('analysis_get_waveform_for_track', { trackId });
 *   if (getWaveformRefreshGen(ref) !== gen) return; // stale result
 */

const waveformRefreshGenByTrackId: Record<string, number> = {};

export function bumpWaveformRefreshGen(ref: AnalysisTrackRef): void {
  if (!ref.trackId) return;
  const key = analysisTrackRefKey(ref);
  waveformRefreshGenByTrackId[key] = (waveformRefreshGenByTrackId[key] ?? 0) + 1;
}

export function getWaveformRefreshGen(ref: AnalysisTrackRef): number {
  return waveformRefreshGenByTrackId[analysisTrackRefKey(ref)] ?? 0;
}

/** Test-only: wipe the per-track generations so each spec starts fresh. */
export function _resetWaveformRefreshGenForTest(): void {
  for (const k of Object.keys(waveformRefreshGenByTrackId)) {
    delete waveformRefreshGenByTrackId[k];
  }
}
