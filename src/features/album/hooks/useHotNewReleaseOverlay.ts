import { useEffect, useState } from 'react';
import type { SubsonicAlbum } from '@/lib/api/subsonicTypes';
import type { LibraryScopePair } from '@/lib/api/library/scopeReads';
import { fetchHotNewReleases } from '@/features/album/utils/hotNewReleases';

/** Network-only first-page overlay; stale results are discarded when scope changes. */
export function useHotNewReleaseOverlay(
  scopes: LibraryScopePair[],
  scopeFingerprint: string,
  active: boolean,
): { scopeFingerprint: string; albums: SubsonicAlbum[] } {
  const [result, setResult] = useState({ scopeFingerprint: '', albums: [] as SubsonicAlbum[] });

  useEffect(() => {
    let cancelled = false;
    if (!active || scopes.length === 0) return () => { cancelled = true; };
    void fetchHotNewReleases(scopes).then(result => {
      if (!cancelled) setResult({ scopeFingerprint, albums: result });
    });
    return () => { cancelled = true; };
  }, [active, scopeFingerprint, scopes]);

  return result;
}
