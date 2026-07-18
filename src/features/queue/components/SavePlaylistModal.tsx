import { useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Props {
  onClose: () => void;
  onSave: (name: string, serverId: string) => Promise<void>;
  serverOptions: Array<{ id: string; label: string }>;
  initialServerId: string;
}

export function SavePlaylistModal({ onClose, onSave, serverOptions, initialServerId }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [serverId, setServerId] = useState(initialServerId);
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (saving || !name.trim() || !serverId) return;
    setSaving(true);
    try {
      await onSave(name.trim(), serverId);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="modal-overlay" onClick={() => { if (!saving) onClose(); }} role="dialog" aria-modal="true">
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
        <button className="modal-close" onClick={onClose} disabled={saving}><X size={18} /></button>
        <h3 style={{ marginBottom: '1rem', fontFamily: 'var(--font-display)' }}>{t('queue.savePlaylist')}</h3>
        <input
          type="text"
          className="live-search-field"
          placeholder={t('queue.playlistName')}
          value={name}
          onChange={e => setName(e.target.value)}
          autoFocus
          onKeyDown={e => { if (e.key === 'Enter') void submit(); }}
          disabled={saving}
          style={{ width: '100%', marginBottom: '1rem', padding: '10px 16px' }}
        />
        {serverOptions.length > 1 && (
          <select
            className="live-search-field"
            value={serverId}
            onChange={event => setServerId(event.target.value)}
            disabled={saving}
            aria-label={t('settings.servers')}
            style={{ width: '100%', marginBottom: '1rem', padding: '10px 16px' }}
          >
            {serverOptions.map(server => (
              <option key={server.id} value={server.id}>{server.label}</option>
            ))}
          </select>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>{t('queue.cancel')}</button>
          <button className="btn btn-primary" onClick={() => { void submit(); }} disabled={saving || !name.trim() || !serverId}>{t('queue.save')}</button>
        </div>
      </div>
    </div>
  );
}
