import { findServerByIdOrIndexKey } from '@/lib/server/serverLookup';

export interface ArtistDetailPathOptions {
  serverId?: string | null;
  search?: string | URLSearchParams;
}

/** Build an artist detail path while preserving query parameters and owning server. */
export function buildArtistDetailPath(
  artistId: string,
  options: ArtistDetailPathOptions = {},
): string {
  const params = new URLSearchParams(options.search ?? '');
  if (options.serverId) params.set('server', options.serverId);
  const query = params.toString();
  return `/artist/${artistId}${query ? `?${query}` : ''}`;
}

/** Resolve `?server=` on album/artist detail routes; falls back when absent or unknown. */
export function readDetailServerId(
  searchParams: URLSearchParams,
  fallback: string | null | undefined,
): string | null {
  const raw = searchParams.get('server');
  const explicit = raw ? findServerByIdOrIndexKey(raw)?.id : undefined;
  if (explicit) return explicit;
  if (!fallback) return null;
  return findServerByIdOrIndexKey(fallback)?.id ?? null;
}

/** Append or merge `server=` into an existing album/artist link query string. */
export function appendServerQuery(
  base: string | undefined,
  serverId: string | undefined,
): string | undefined {
  if (!serverId) return base;
  const params = new URLSearchParams(base ?? '');
  params.set('server', serverId);
  return params.toString();
}
