import { useEffect, useState } from 'react';
import type { LibraryScopePair } from '@/lib/api/library/scopeReads';
import {
  fetchHotNewReleases,
  type ResolvedHotNewRelease,
} from '@/features/album/utils/hotNewReleases';

/** Network-only first-page overlay; stale results are discarded when scope changes. */
export function useHotNewReleaseOverlay(
  scopes: LibraryScopePair[],
  scopeFingerprint: string,
  active: boolean,
): { scopeFingerprint: string; albums: ResolvedHotNewRelease[] } {
  const [result, setResult] = useState({
    scopeFingerprint: '',
    albums: [] as ResolvedHotNewRelease[],
  });

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
