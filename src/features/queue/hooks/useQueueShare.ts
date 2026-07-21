import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { QueueItemRef } from '@/lib/media/trackTypes';
import type { ServerProfile } from '@/store/authStoreTypes';
import { queueTrackIdsForServerProfile } from '@/features/playback';
import { encodeSharePayload } from '@/lib/share/shareLink';
import { serverShareBaseUrl } from '@/lib/server/serverEndpoint';
import { copyTextToClipboard } from '@/lib/server/serverMagicString';
import { serverListDisplayLabel } from '@/lib/server/serverDisplayName';
import { showToast } from '@/lib/dom/toast';

interface Options {
  queueItems: QueueItemRef[];
  servers: ServerProfile[];
  activeServerId: string | null;
  publicShareQueueActive: boolean;
  navidromePublicSharePageUrl: string | null;
}

export function useQueueShare({
  queueItems,
  servers,
  activeServerId,
  publicShareQueueActive,
  navidromePublicSharePageUrl,
}: Options) {
  const { t } = useTranslation();
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const serverOptions = useMemo(() => servers
    .filter(server => queueTrackIdsForServerProfile(queueItems, server.id).length > 0)
    .map(server => ({ id: server.id, label: serverListDisplayLabel(server, servers) })), [queueItems, servers]);
  const defaultServerId = activeServerId && serverOptions.some(server => server.id === activeServerId)
    ? activeServerId
    : serverOptions[0]?.id ?? '';

  const copyForServer = async (serverId: string) => {
    const ids = queueTrackIdsForServerProfile(queueItems, serverId);
    if (ids.length === 0) {
      showToast(t('queue.shareQueueEmpty'), 3000, 'info');
      return;
    }
    // Queue share goes to remote recipients, so use the share URL instead of
    // the connect URL the app is currently bound to (which could leak a LAN host).
    const server = servers.find(candidate => candidate.id === serverId);
    if (!server) return;
    const srv = serverShareBaseUrl(server);
    if (!srv) return;
    const ok = await copyTextToClipboard(encodeSharePayload({ srv, k: 'queue', ids }));
    if (ok) showToast(t('contextMenu.shareCopied'));
    else showToast(t('contextMenu.shareCopyFailed'), 4000, 'error');
  };

  const handleCopy = async () => {
    if (publicShareQueueActive) {
      const pageUrl = navidromePublicSharePageUrl?.trim();
      if (!pageUrl) {
        showToast(t('queue.shareNavidromePublicMissing'), 4000, 'error');
        return;
      }
      const ok = await copyTextToClipboard(pageUrl);
      if (ok) showToast(t('contextMenu.shareCopied'));
      else showToast(t('contextMenu.shareCopyFailed'), 4000, 'error');
      return;
    }
    if (serverOptions.length === 0) {
      showToast(t('queue.shareQueueEmpty'), 3000, 'info');
      return;
    }
    if (serverOptions.length > 1) {
      setShareModalOpen(true);
      return;
    }
    await copyForServer(serverOptions[0]!.id);
  };

  const shareForServer = async (serverId: string) => {
    try {
      if (serverOptions.some(server => server.id === serverId)) await copyForServer(serverId);
    } finally {
      setShareModalOpen(false);
    }
  };

  return {
    serverOptions,
    defaultServerId,
    shareModalOpen,
    handleCopy,
    shareForServer,
    closeShareModal: () => setShareModalOpen(false),
  };
}
