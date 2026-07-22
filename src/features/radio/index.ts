/**
 * Internet radio feature — station browse/edit UI (directory, cards, toolbar),
 * the InternetRadio page, and the live ICY/AzuraCast metadata hooks. The page is
 * lazy-loaded by the router via its deep path, so it is not re-exported here.
 *
 * Note: radio *playback* state (`store/radioPlayer`, `store/radioSessionState`)
 * and the ICY→MPRIS bridge (`audioListenerSetup/radioMprisMetadata`) stay in the
 * playback/audio core — the player core drives them, so they are not part of
 * this UI feature.
 */
export { useRadioMetadata } from './hooks/useRadioMetadata';
export type { RadioMetadata } from './hooks/useRadioMetadata';
export { useRadioMprisSync } from './hooks/useRadioMprisSync';
export {
  migrateRadioStationKeys,
  radioStationKey,
  sameRadioStation,
} from './utils/radioStationIdentity';
