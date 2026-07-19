import { useAuthStore } from '@/store/authStore';
import {
  analysisTrackRefKey,
  type AnalysisTrackRef,
} from '@/features/playback/store/analysisTrackRef';

/**
 * In-memory cache of the per-track loudness normalization gain (dB). Two
 * parallel maps:
 *
 *  - `cachedLoudnessGainByTrackId` — the dB value last computed (from an
 *    `analysis_get_loudness_for_track` row, a partial-loudness event, or
 *    a placeholder-until-cache value).
 *  - `stableLoudnessGainByTrackId` — `true` once the value has been
 *    promoted to the final cached/analysis-confirmed form. Engine bind
 *    only trusts entries flagged stable; partial / placeholder values
 *    deliberately omit the flag so Rust uses its pre-trim default until
 *    the analysis catches up.
 *
 * Keys combine the analysis owner with a normalized track id, so equal raw
 * Subsonic ids from different servers cannot share gain or stability state.
 * The shared identity helper also collapses bare and `stream:` id forms.
 */

const cachedLoudnessGainByTrackId: Record<string, number> = {};
const stableLoudnessGainByTrackId: Record<string, true> = {};

export function getCachedLoudnessGain(ref: AnalysisTrackRef): number | undefined {
  return cachedLoudnessGainByTrackId[analysisTrackRefKey(ref)];
}

export function setCachedLoudnessGain(ref: AnalysisTrackRef, gainDb: number): void {
  cachedLoudnessGainByTrackId[analysisTrackRefKey(ref)] = gainDb;
}

export function hasStableLoudness(ref: AnalysisTrackRef): boolean {
  return Boolean(stableLoudnessGainByTrackId[analysisTrackRefKey(ref)]);
}

/** Atomic: write the cached value AND mark it stable (analysis-confirmed). */
export function markLoudnessStable(ref: AnalysisTrackRef, gainDb: number): void {
  const key = analysisTrackRefKey(ref);
  cachedLoudnessGainByTrackId[key] = gainDb;
  stableLoudnessGainByTrackId[key] = true;
}

export function forgetLoudnessGain(ref: AnalysisTrackRef): void {
  const key = analysisTrackRefKey(ref);
  delete cachedLoudnessGainByTrackId[key];
  delete stableLoudnessGainByTrackId[key];
}

export function clearLoudnessCacheState(ref: AnalysisTrackRef): void {
  forgetLoudnessGain(ref);
}

/**
 * Pass to `audio_play` / `audio_chain_preload` only — DB-backed gain. Omit
 * partial hints so Rust uses pre-trim until `analysis:loudness-partial` +
 * `audio_update_replay_gain`.
 */
export function loudnessGainDbForEngineBind(ref: AnalysisTrackRef | null): number | null {
  if (!ref?.trackId) return null;
  const key = analysisTrackRefKey(ref);
  if (!stableLoudnessGainByTrackId[key]) return null;
  const v = cachedLoudnessGainByTrackId[key];
  return Number.isFinite(v) ? v : null;
}

/** True when ReplayGain is selected AND user has it enabled in Settings. */
export function isReplayGainActive(): boolean {
  const a = useAuthStore.getState();
  return a.normalizationEngine === 'replaygain' && a.replayGainEnabled;
}

/** Test-only: wipe both maps so each spec starts clean. */
export function _resetLoudnessGainCacheForTest(): void {
  for (const k of Object.keys(cachedLoudnessGainByTrackId)) delete cachedLoudnessGainByTrackId[k];
  for (const k of Object.keys(stableLoudnessGainByTrackId)) delete stableLoudnessGainByTrackId[k];
}
