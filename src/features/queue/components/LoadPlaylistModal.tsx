import { useEffect, useState } from 'react';
import { Play, X, Trash2, ListPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { deletePlaylist } from '@/lib/api/subsonicPlaylists';
import type { SubsonicPlaylist } from '@/lib/api/subsonicTypes';
import { usePlaylistStore } from '@/features/playlist';
import { ownedEntityKey } from '@/lib/util/ownedEntityKey';
import { useAuthStore } from '@/store/authStore';
import { serverListDisplayLabel } from '@/lib/server/serverDisplayName';

interface Props {
  onClose: () => void;
  onLoad: (playlist: SubsonicPlaylist, mode: 'replace' | 'append') => void;
}

export function LoadPlaylistModal({ onClose, onLoad }: Props) {
  const { t } = useTranslation();
  const playlists = usePlaylistStore(state => state.playlists);
  const loading = usePlaylistStore(state => state.playlistsLoading);
  const fetchPlaylists = usePlaylistStore(state => state.fetchPlaylists);
  const servers = useAuthStore(state => state.servers);
  const [filter, setFilter] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<SubsonicPlaylist | null>(null);
  const serverLabelById = new Map(servers.map(server => [
    server.id,
    serverListDisplayLabel(server, servers),
  ]));

  useEffect(() => {
    void fetchPlaylists();
  }, [fetchPlaylists]);

  const handleDelete = async (playlist: SubsonicPlaylist) => {
    setConfirmDelete(playlist);
  };

  const confirmDeletePlaylist = async () => {
    if (!confirmDelete) return;
    await deletePlaylist(confirmDelete.id, confirmDelete.serverId);
    setConfirmDelete(null);
    await fetchPlaylists();
  };

  return (
    <>
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '560px', width: '90vw' }}>
        <button className="modal-close" onClick={onClose}><X size={18} /></button>
        <h3 style={{ marginBottom: '1rem', fontFamily: 'var(--font-display)' }}>{t('queue.loadPlaylist')}</h3>
        {!loading && playlists.length > 0 && (
          <input
            type="text"
            className="live-search-field"
            placeholder={t('queue.filterPlaylists')}
            value={filter}
            onChange={e => setFilter(e.target.value)}
            autoFocus
            style={{ width: '100%', marginBottom: '0.75rem', padding: '8px 14px' }}
          />
        )}
        {loading ? (
          <p style={{ color: 'var(--text-muted)' }}>{t('queue.loading')}</p>
        ) : playlists.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>{t('queue.noPlaylists')}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
            {playlists.filter(p => p.name.toLowerCase().includes(filter.toLowerCase())).map(p => (
              <div key={ownedEntityKey(p)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg-hover)', borderRadius: 'var(--radius-md)' }}>
                <span style={{ fontWeight: 500 }} className="truncate" data-tooltip={p.name}>
                  {p.name}{p.serverId ? ` · ${serverLabelById.get(p.serverId) ?? p.serverId}` : ''}
                </span>
                <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                  <button className="nav-btn" onClick={() => onLoad(p, 'replace')} data-tooltip={t('queue.load')} style={{ width: '28px', height: '28px', background: 'transparent' }}><Play size={14} /></button>
                  <button className="nav-btn" onClick={() => onLoad(p, 'append')} data-tooltip={t('queue.appendToQueue')} style={{ width: '28px', height: '28px', background: 'transparent' }}><ListPlus size={14} /></button>
                  <button className="nav-btn" onClick={() => handleDelete(p)} data-tooltip={t('queue.delete')} style={{ width: '28px', height: '28px', background: 'transparent', color: 'var(--danger)' }}><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>

    {confirmDelete && (
      <div className="modal-overlay" onClick={() => setConfirmDelete(null)} role="dialog" aria-modal="true">
        <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '360px' }}>
          <button className="modal-close" onClick={() => setConfirmDelete(null)}><X size={18} /></button>
          <h3 style={{ marginBottom: '0.5rem', fontFamily: 'var(--font-display)' }}>{t('queue.delete')}</h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
            {t('queue.deleteConfirm', { name: confirmDelete.name })}
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>{t('queue.cancel')}</button>
            <button className="btn btn-primary" style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={confirmDeletePlaylist}>
              {t('queue.delete')}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
