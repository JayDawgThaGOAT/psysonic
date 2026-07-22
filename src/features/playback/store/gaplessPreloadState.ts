/**
 * Coordinates the gapless-chain preloader so the runtime doesn't pre-fetch
 * the same track twice or fire a chain-switch while a previous one is
 * still settling.
 *
 *  - `gaplessPreloadingId` — queue identity last handed to `audio_chain_preload`
 *  - `bytePreloadingId`    — queue identity last handed to `audio_preload`
 *  - `lastGaplessSwitchTime` — timestamp of the last gapless track-switch
 *    event from Rust. The 500–600 ms guards in `handleAudioTrackSwitched`
 *    and the progress handler use this to suppress stale IPC arriving
 *    right after the switch.
 *
 * `clearPreloadingIds` collapses the repeated `= null; = null;` pattern
 * that the store actions used to inline in five places.
 */

let gaplessPreloadingId: string | null = null;
let bytePreloadingId: string | null = null;
let bytePreloadingUrl: string | null = null;
let lastGaplessSwitchTime = 0;

export function getGaplessPreloadingId(): string | null {
  return gaplessPreloadingId;
}

export function setGaplessPreloadingId(id: string | null): void {
  gaplessPreloadingId = id;
}

export function getBytePreloadingId(): string | null {
  return bytePreloadingId;
}

export function setBytePreloadingId(id: string | null): void {
  bytePreloadingId = id;
  if (id == null) bytePreloadingUrl = null;
}

export function getBytePreloadingUrl(): string | null {
  return bytePreloadingUrl;
}

export function setBytePreloadingRequest(id: string, url: string): void {
  bytePreloadingId = id;
  bytePreloadingUrl = url;
}

/** Atomic: clear both preloading guards. Called on track switch + on errors. */
export function clearPreloadingIds(): void {
  gaplessPreloadingId = null;
  bytePreloadingId = null;
  bytePreloadingUrl = null;
}

export function getLastGaplessSwitchTime(): number {
  return lastGaplessSwitchTime;
}

/** Record a gapless switch event. Subsequent guards compare against this. */
export function markGaplessSwitch(): void {
  lastGaplessSwitchTime = Date.now();
}

/** Test-only: reset all three mutables. */
export function _resetGaplessPreloadStateForTest(): void {
  gaplessPreloadingId = null;
  bytePreloadingId = null;
  bytePreloadingUrl = null;
  lastGaplessSwitchTime = 0;
}
