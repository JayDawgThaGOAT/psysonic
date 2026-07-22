import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { HardDriveDownload, LoaderCircle, Server, TriangleAlert, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import {
  usePlaybackAlternativeStore,
} from '@/features/playback/store/playbackAlternativeStore';
import { selectPlaybackAlternative } from '@/features/playback/store/selectPlaybackAlternative';
import {
  availablePlaybackAlternativeSources,
  type PlaybackAlternativeSource,
} from '@/features/playback/utils/playback/availablePlaybackAlternativeSources';

function sourceMeta(source: PlaybackAlternativeSource, localLabel: string, onlineLabel: string): string {
  const parts = [source.local ? localLabel : onlineLabel];
  if (source.suffix) parts.push(source.suffix.toUpperCase());
  if (source.bitRate) parts.push(`${source.bitRate} kbps`);
  return parts.join(' · ');
}

export default function PlaybackAlternativeModal() {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const { failure, status, sources, selectingKey, actionError, close } =
    usePlaybackAlternativeStore(useShallow(state => ({
      failure: state.failure,
      status: state.status,
      sources: state.sources,
      selectingKey: state.selectingKey,
      actionError: state.actionError,
      close: state.close,
    })));
  const failureKey = failure?.key ?? null;
  const availableSources = availablePlaybackAlternativeSources(sources);

  useEffect(() => {
    if (!failureKey) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !usePlaybackAlternativeStore.getState().selectingKey) close();
      if (event.key !== 'Tab') return;

      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      )];
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus();
    };
  }, [close, failureKey]);

  if (!failure) return null;

  const busy = selectingKey !== null;
  return createPortal(
    <div
      className="modal-overlay playback-alternative-overlay"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget && !busy) close();
      }}
    >
      <div
        ref={dialogRef}
        className="modal-content playback-alternative-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={busy || status === 'loading'}
        tabIndex={-1}
      >
        <button
          type="button"
          className="modal-close"
          onClick={close}
          disabled={busy}
          aria-label={t('common.close')}
        >
          <X size={18} />
        </button>

        <header className="playback-alternative-modal__header">
          <span className="playback-alternative-modal__warning" aria-hidden="true">
            <TriangleAlert size={22} />
          </span>
          <div>
            <h2 id={titleId} className="playback-alternative-modal__title">
              {t('player.sourceFailureTitle', { title: failure.track.title })}
            </h2>
            <p id={descriptionId} className="playback-alternative-modal__description">
              {t('player.sourceFailureBody')}
            </p>
          </div>
        </header>

        <p className="playback-alternative-modal__detail">
          {t('player.sourceFailureDetail', { detail: failure.detail })}
        </p>

        <div className="playback-alternative-modal__body" aria-live="polite">
          {status === 'loading' && (
            <div className="playback-alternative-modal__status">
              <LoaderCircle className="playback-alternative-modal__spinner" size={20} aria-hidden="true" />
              <span>{t('player.sourceFailureSearching')}</span>
            </div>
          )}
          {status === 'error' && (
            <div className="playback-alternative-modal__status playback-alternative-modal__status--error">
              {t('player.sourceFailureLoadError')}
            </div>
          )}
          {status === 'ready' && availableSources.length === 0 && (
            <div className="playback-alternative-modal__status">
              {t('player.sourceFailureNone')}
            </div>
          )}
          {availableSources.length > 0 && (
            <div className="playback-alternative-modal__sources">
              {availableSources.map(source => {
                const key = `${source.serverId}:${source.id}`;
                const selecting = selectingKey === key;
                return (
                  <button
                    key={key}
                    type="button"
                    className="playback-alternative-source"
                    disabled={busy}
                    onClick={() => void selectPlaybackAlternative(source)}
                  >
                    <span className="playback-alternative-source__icon" aria-hidden="true">
                      {source.local ? <HardDriveDownload size={20} /> : <Server size={20} />}
                    </span>
                    <span className="playback-alternative-source__copy">
                      <span className="playback-alternative-source__title">
                        {selecting
                          ? t('player.sourceFailureSwitching')
                          : t('player.sourceFailurePlayFrom', { server: source.serverLabel })}
                      </span>
                      <span className="playback-alternative-source__meta">
                        {sourceMeta(
                          source,
                          t('player.sourceFailureLocal'),
                          t('player.sourceFailureOnline'),
                        )}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {actionError && (
            <div className="playback-alternative-modal__status playback-alternative-modal__status--error">
              {t('player.sourceFailurePlayError')}
            </div>
          )}
        </div>

        <footer className="playback-alternative-modal__footer">
          <button type="button" className="btn btn-ghost" onClick={close} disabled={busy}>
            {t('player.sourceFailureKeep')}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
