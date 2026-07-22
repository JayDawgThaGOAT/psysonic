import { buildStreamUrl, buildStreamUrlForServer } from '@/lib/api/subsonicStreamUrl';
import { commands } from '@/generated/bindings';
import { useAuthStore } from '@/store/authStore';
import { usePlayerStore } from '@/features/playback/store/playerStore';
import { bumpWaveformRefreshGen } from '@/features/playback/store/waveformRefreshGen';
import { clearLoudnessCacheState } from '@/features/playback/store/loudnessGainCache';
import { resetLoudnessBackfillState } from '@/features/playback/store/loudnessBackfillState';
import {
  analysisTrackRefForTrack,
  analysisTrackRefKey,
  type AnalysisTrackRef,
} from '@/features/playback/store/analysisTrackRef';

/**
 * Tear down every cached piece of analysis for a track and re-enqueue a
 * forced reseed. Used by the Settings „Re-analyse this track" action.
 *
 * Sequence:
 *  1. Skip if loudness engine isn't active (re-analysis only makes sense
 *     when normalization actually consumes the result).
 *  2. Invalidate the waveform refresh generation so any in-flight read
 *     for this id is discarded, and blank the seekbar bins immediately if
 *     the track is current.
 *  3. Wipe both loudness-cache maps (both forms of the id) + the backfill
 *     retry state.
 *  4. Reset the live normalization-state to placeholder values so the UI
 *     doesn't show stale dB until the new analysis lands.
 *  5. Delete the on-disk waveform + loudness rows via Rust.
 *  6. Re-issue `updateReplayGainForCurrentTrack` so the engine drops
 *     whatever gain it was holding for this track.
 *  7. Enqueue a forced seed via `analysis_enqueue_seed_from_url`.
 *
 * Best-effort throughout — Rust errors are logged but never thrown.
 */
export async function reseedLoudnessForTrackId(ref: AnalysisTrackRef): Promise<void> {
  const { trackId, serverIndexKey } = ref;
  if (!trackId || !serverIndexKey) return;
  const auth = useAuthStore.getState();
  if (auth.normalizationEngine !== 'loudness') return;
  bumpWaveformRefreshGen(ref);
  const player = usePlayerStore.getState();
  const currentRef = player.currentTrack
    ? analysisTrackRefForTrack(player.currentTrack, player.queueItems[player.queueIndex])
    : null;
  if (currentRef && analysisTrackRefKey(currentRef) === analysisTrackRefKey(ref)) {
    usePlayerStore.setState({ waveformBins: null });
  }
  clearLoudnessCacheState(ref);
  resetLoudnessBackfillState(ref);
  usePlayerStore.setState({
    normalizationNowDb: null,
    normalizationTargetLufs: auth.loudnessTargetLufs,
    normalizationEngineLive: 'loudness',
  });
  try {
    const res = await commands.analysisDeleteWaveformForTrack(trackId, serverIndexKey);
    if (res.status === 'error') throw new Error(res.error);
  } catch (e) {
    console.error('[psysonic] analysis_delete_waveform_for_track failed:', e);
  }
  try {
    const res = await commands.analysisDeleteLoudnessForTrack(trackId, serverIndexKey);
    if (res.status === 'error') throw new Error(res.error);
  } catch (e) {
    console.error('[psysonic] analysis_delete_loudness_for_track failed:', e);
  }
  usePlayerStore.getState().updateReplayGainForCurrentTrack();
  const url = serverIndexKey ? buildStreamUrlForServer(serverIndexKey, trackId) : buildStreamUrl(trackId);
  try {
    const res = await commands.analysisEnqueueSeedFromUrl(trackId, url, true, serverIndexKey, null);
    if (res.status === 'error') throw new Error(res.error);
  } catch (e) {
    console.error('[psysonic] analysis_enqueue_seed_from_url (reseed) failed:', e);
  }
}
