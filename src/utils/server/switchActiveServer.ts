import type { ServerProfile } from '../../store/authStoreTypes';
import { scheduleInstantMixProbeForServer } from '@/lib/api/subsonic';
import {
  coverTrafficBeginServerSwitch,
  coverTrafficEndServerSwitch,
} from '../../cover/coverTraffic';
import { useAuthStore } from '../../store/authStore';
import { flushPlayQueueForServer } from '@/features/playback/store/queueSync';
import { markQueueHandoffPending } from '@/features/playback/store/queueSyncUiState';
import { ensureConnectUrlResolved } from '@/lib/server/serverEndpoint';
import { syncServerHttpContextForProfile } from '@/lib/server/syncServerHttpContext';
import { publishServerConnectionStatus } from '@/lib/network/serverReachability';

export async function switchActiveServer(server: ServerProfile): Promise<boolean> {
  coverTrafficBeginServerSwitch();
  try {
    // Resolve the reachable endpoint (LAN-first, sticky cached); this also
    // populates the connect cache so the sync `getBaseUrl()` lookup serves the
    // probed URL on the very next read. Single-address profiles fall through
    // to one ping, identical to the legacy behaviour.
    const probe = await ensureConnectUrlResolved(server);
    if (!probe.ok) return false;

    const auth = useAuthStore.getState();
    const oldActiveId = auth.activeServerId;
    if (oldActiveId && oldActiveId !== server.id) {
      await flushPlayQueueForServer(oldActiveId);
    }

    const identity = {
      type: probe.ping.type,
      serverVersion: probe.ping.serverVersion,
      openSubsonic: probe.ping.openSubsonic,
    };
    auth.setSubsonicServerIdentity(server.id, identity);
    scheduleInstantMixProbeForServer(server.id, probe.baseUrl, server.username, server.password, identity);
    auth.setActiveServer(server.id);
    auth.setLoggedIn(true);
    publishServerConnectionStatus(server.id, 'online', true);
    if (oldActiveId && oldActiveId !== server.id) {
      markQueueHandoffPending();
    }
    void syncServerHttpContextForProfile(server);
    return true;
  } catch {
    return false;
  } finally {
    coverTrafficEndServerSwitch();
  }
}
