import { useEffect, useMemo, useState } from 'react';
import { ndLogin } from '@/lib/api/navidromeAdmin';
import { useAuthStore } from '@/store/authStore';
import { isNavidromeServer } from '@/lib/server/subsonicServerIdentity';
import type { SubsonicServerIdentity } from '@/lib/server/subsonicServerIdentity';

export type NavidromeAdminRole = 'idle' | 'checking' | 'admin' | 'user' | 'na' | 'error';

/**
 * Navidrome ≥ 0.62 restricts internet-radio management (create/update/delete) to
 * admins (GHSA-jw24-qqrj-633c). Block those actions only for a *confirmed*
 * standard Navidrome user; everything else — admin, non-Navidrome servers
 * (`'na'`), and transient/unknown states — stays allowed, with the server as the
 * final authority. Non-Navidrome servers never carried this restriction.
 */
export function canManageNavidromeRadio(role: NavidromeAdminRole): boolean {
  return role !== 'user';
}

function normalizeServerUrl(url: string): string {
  const withScheme = url.startsWith('http') ? url : `http://${url}`;
  return withScheme.replace(/\/$/, '');
}

function roleBeforeProbe(
  isLoggedIn: boolean,
  server: { url: string } | undefined,
  identity: SubsonicServerIdentity | undefined,
): NavidromeAdminRole {
  if (!isLoggedIn || !server) return 'na';
  if (!identity) return 'checking';
  return isNavidromeServer(identity) ? 'checking' : 'na';
}

export function useNavidromeAdminRoles(serverIds: readonly string[]): Record<string, NavidromeAdminRole> {
  const isLoggedIn = useAuthStore(s => s.isLoggedIn);
  const servers = useAuthStore(s => s.servers);
  const identities = useAuthStore(s => s.subsonicServerIdentityByServer);
  const serverIdsKey = [...new Set(serverIds.filter(Boolean))].join('\0');
  const requestedServerIds = useMemo(
    () => serverIdsKey ? serverIdsKey.split('\0') : [],
    [serverIdsKey],
  );
  const probeKey = JSON.stringify(requestedServerIds.map(serverId => {
    const server = servers.find(candidate => candidate.id === serverId);
    const identity = identities[serverId];
    return [
      serverId,
      isLoggedIn,
      server?.url,
      server?.username,
      server?.password,
      identity?.type,
      identity?.serverVersion,
    ];
  }));
  const initialRoles = useMemo(() => Object.fromEntries(requestedServerIds.map(serverId => [
    serverId,
    roleBeforeProbe(
      isLoggedIn,
      servers.find(server => server.id === serverId),
      identities[serverId],
    ),
  ])), [requestedServerIds, isLoggedIn, servers, identities]);
  const [resolved, setResolved] = useState<{
    key: string;
    roles: Record<string, NavidromeAdminRole>;
  }>({ key: '', roles: {} });

  useEffect(() => {
    let cancelled = false;
    // React Compiler set-state-in-effect rule: reset role snapshots when the requested owners change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResolved({ key: probeKey, roles: initialRoles });
    for (const serverId of requestedServerIds) {
      const server = servers.find(candidate => candidate.id === serverId);
      const identity = identities[serverId];
      if (!isLoggedIn || !server || !identity || !isNavidromeServer(identity)) continue;
      void ndLogin(normalizeServerUrl(server.url), server.username, server.password)
        .then(result => result.isAdmin ? 'admin' as const : 'user' as const)
        .catch(() => 'error' as const)
        .then(role => {
          if (cancelled) return;
          setResolved(previous => previous.key === probeKey
            ? { key: probeKey, roles: { ...previous.roles, [serverId]: role } }
            : { key: probeKey, roles: { ...initialRoles, [serverId]: role } });
        });
    }
    return () => { cancelled = true; };
  }, [probeKey, initialRoles, requestedServerIds, servers, identities, isLoggedIn]);

  return resolved.key === probeKey ? resolved.roles : initialRoles;
}

/**
 * Probes Navidrome native login for the active server to learn whether the
 * current Subsonic credentials belong to an admin account.
 */
export function useNavidromeAdminRole(): NavidromeAdminRole {
  const activeServerId = useAuthStore(s => s.activeServerId);
  const requestedServerIds = useMemo(
    () => activeServerId ? [activeServerId] : [],
    [activeServerId],
  );
  const roles = useNavidromeAdminRoles(requestedServerIds);
  return activeServerId ? roles[activeServerId] ?? 'checking' : 'na';
}
