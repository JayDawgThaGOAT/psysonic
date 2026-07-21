import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '@/ui/Modal';
import ServerChoiceList from '@/ui/ServerChoiceList';

interface Props {
  onClose: () => void;
  onShare: (serverId: string) => Promise<void>;
  serverOptions: Array<{ id: string; label: string }>;
  initialServerId: string;
}

export function ShareQueueModal({ onClose, onShare, serverOptions, initialServerId }: Props) {
  const { t } = useTranslation();
  const [serverId, setServerId] = useState(initialServerId);
  const [sharing, setSharing] = useState(false);

  const submit = async () => {
    if (sharing || !serverId) return;
    setSharing(true);
    try {
      await onShare(serverId);
    } finally {
      setSharing(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => { if (!sharing) onClose(); }}
      title={t('queue.shareQueue')}
      closeLabel={t('queue.close')}
      size="sm"
      footer={(
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={sharing}>
            {t('queue.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => { void submit(); }}
            disabled={sharing || !serverId}
          >
            {t('queue.shareQueue')}
          </button>
        </>
      )}
    >
      <ServerChoiceList
        value={serverId}
        options={serverOptions}
        onChange={setServerId}
        ariaLabel={t('settings.servers')}
        disabled={sharing}
        autoFocusSelected
      />
    </Modal>
  );
}
