import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Infinity as InfinityIcon } from 'lucide-react';
import PlaylistsSmartRuleGroup from '@/features/playlist/components/PlaylistsSmartRuleGroup';
import PlaylistsSmartSortRows from '@/features/playlist/components/PlaylistsSmartSortRows';
import {
  type SmartPlaylistCapabilities,
  type SmartRuleFieldDefinition,
} from '@/features/playlist/utils/smartPlaylistFields';
import { defaultSmartRuleGroup } from '@/features/playlist/utils/smartPlaylistEditor';
import {
  parseSmartRulesDocument,
  removeSmartRuleValue,
  setSmartRuleValue,
  type SmartRulesDocument,
} from '@/features/playlist/utils/smartPlaylistRules';

interface PlaylistOption {
  id: string;
  name: string;
}

interface Props {
  document: SmartRulesDocument;
  onDocumentChange: (document: SmartRulesDocument) => void;
  capabilities: SmartPlaylistCapabilities;
  customFields: SmartRuleFieldDefinition[];
  playlistOptions: PlaylistOption[];
  genreSuggestions?: readonly string[];
}

export default function PlaylistsSmartEditorAdvanced({
  document, onDocumentChange, capabilities, customFields, playlistOptions,
  genreSuggestions = [],
}: Props) {
  const { t } = useTranslation();
  const hasLimit = typeof document.raw.limit === 'number';
  const hasPercent = typeof document.raw.limitPercent === 'number';
  const [limitMode, setLimitModeState] = useState<'none' | 'limit' | 'limitPercent'>(
    hasPercent ? 'limitPercent' : hasLimit ? 'limit' : 'none',
  );
  const [countDraft, setCountDraft] = useState(
    hasLimit ? String(document.raw.limit) : '50',
  );
  const [percentDraft, setPercentDraft] = useState(
    hasPercent ? String(document.raw.limitPercent) : '25',
  );

  useEffect(() => {
    if (hasPercent) setLimitModeState('limitPercent');
    else if (hasLimit) setLimitModeState('limit');
    else setLimitModeState('none');
  }, [hasLimit, hasPercent]);

  useEffect(() => {
    if (hasLimit) setCountDraft(String(document.raw.limit));
  }, [document.raw.limit, hasLimit]);

  useEffect(() => {
    if (hasPercent) setPercentDraft(String(document.raw.limitPercent));
  }, [document.raw.limitPercent, hasPercent]);

  const withoutLimits = () => {
    let next = document;
    if (hasLimit) next = removeSmartRuleValue(next, '/limit');
    if (hasPercent) next = removeSmartRuleValue(next, '/limitPercent');
    return next;
  };

  const setLimitMode = (mode: 'none' | 'limit' | 'limitPercent') => {
    setLimitModeState(mode);
    const next = withoutLimits();
    if (mode === 'none') {
      if (next !== document) onDocumentChange(next);
      return;
    }
    if (mode === 'limitPercent') {
      const clamped = Math.min(100, Math.max(1, Math.trunc(Number(percentDraft) || 25)));
      setPercentDraft(String(clamped));
      onDocumentChange(setSmartRuleValue(next, '/limitPercent', clamped));
      return;
    }
    const count = Math.max(1, Math.trunc(Number(countDraft) || 50));
    setCountDraft(String(count));
    onDocumentChange(setSmartRuleValue(next, '/limit', count));
  };

  const setCount = (raw: string) => {
    setCountDraft(raw);
    if (raw === '') {
      if (hasLimit) onDocumentChange(removeSmartRuleValue(document, '/limit'));
      return;
    }
    const next = Number(raw);
    if (!Number.isFinite(next)) return;
    onDocumentChange(setSmartRuleValue(document, '/limit', Math.max(1, Math.trunc(next))));
  };

  const setPercent = (raw: string) => {
    setPercentDraft(raw);
    if (raw === '') {
      if (hasPercent) onDocumentChange(removeSmartRuleValue(document, '/limitPercent'));
      return;
    }
    const next = Number(raw);
    if (!Number.isFinite(next)) return;
    const clamped = Math.min(100, Math.max(1, Math.trunc(next)));
    setPercentDraft(String(clamped));
    onDocumentChange(setSmartRuleValue(document, '/limitPercent', clamped));
  };

  return (
    <div className="smart-query-editor">
      {document.root ? (
        <PlaylistsSmartRuleGroup
          node={document.root}
          document={document}
          onDocumentChange={onDocumentChange}
          capabilities={capabilities}
          customFields={customFields}
          playlistOptions={playlistOptions}
          genreSuggestions={genreSuggestions}
          isRoot
        />
      ) : (
        <div className="smart-query-group">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onDocumentChange(parseSmartRulesDocument({
              ...document.raw,
              all: (defaultSmartRuleGroup().all as unknown[]),
            }))}
          >
            {t('smartPlaylists.addRule')}
          </button>
        </div>
      )}
      <div className="smart-query-footer">
        <PlaylistsSmartSortRows
          document={document}
          onDocumentChange={onDocumentChange}
          capabilities={capabilities}
          customFields={customFields}
        />
        <div className="smart-query-limit">
          <span className="smart-query-limit-label">{t('smartPlaylists.limit')}</span>
          <div className="smart-query-limit-controls">
            <div className="smart-query-limit-mode" role="group" aria-label={t('smartPlaylists.limit')}>
              <button
                type="button"
                className={`btn ${limitMode === 'limit' ? 'btn-primary' : 'btn-surface'}`}
                aria-label={t('smartPlaylists.limitCount')}
                aria-pressed={limitMode === 'limit'}
                onClick={() => setLimitMode('limit')}
              >
                #
              </button>
              {capabilities.percentageLimit && (
                <button
                  type="button"
                  className={`btn ${limitMode === 'limitPercent' ? 'btn-primary' : 'btn-surface'}`}
                  aria-label={t('smartPlaylists.limitPercent')}
                  aria-pressed={limitMode === 'limitPercent'}
                  onClick={() => setLimitMode('limitPercent')}
                >
                  %
                </button>
              )}
              <button
                type="button"
                className={`btn ${limitMode === 'none' ? 'btn-primary' : 'btn-surface'}`}
                aria-label={t('smartPlaylists.limitUnlimited')}
                aria-pressed={limitMode === 'none'}
                onClick={() => setLimitMode('none')}
              >
                <InfinityIcon size={14} />
              </button>
            </div>
            {limitMode === 'limitPercent' && (
              <input
                type="range"
                min={1}
                max={100}
                step={1}
                aria-label={t('smartPlaylists.limitPercent')}
                title={t('smartPlaylists.limitPercentHint')}
                value={percentDraft === '' ? 1 : percentDraft}
                onChange={event => setPercent(event.target.value)}
              />
            )}
            {limitMode === 'limit' && (
              <input
                className="input"
                type="number"
                min={1}
                aria-label={t('smartPlaylists.limitCount')}
                value={countDraft}
                onChange={event => setCount(event.target.value)}
              />
            )}
            {limitMode === 'limitPercent' && (
              <input
                className="input"
                type="number"
                min={1}
                max={100}
                aria-label={t('smartPlaylists.limitPercent')}
                value={percentDraft}
                onChange={event => setPercent(event.target.value)}
              />
            )}
          </div>
        </div>
      </div>
      <details className="smart-query-more">
        <summary>{t('smartPlaylists.moreOptions')}</summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <span>{t('smartPlaylists.offset')}</span>
            <input
              className="input"
              type="number"
              min={0}
              value={typeof document.raw.offset === 'number' ? document.raw.offset : 0}
              onChange={event => {
                const offset = Number(event.target.value);
                if (!offset) {
                  if (Object.prototype.hasOwnProperty.call(document.raw, 'offset')) {
                    onDocumentChange(removeSmartRuleValue(document, '/offset'));
                  }
                  return;
                }
                onDocumentChange(setSmartRuleValue(document, '/offset', offset));
              }}
            />
          </label>
        </div>
      </details>
    </div>
  );
}
