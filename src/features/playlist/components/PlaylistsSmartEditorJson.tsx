import { useTranslation } from 'react-i18next';
import type { SmartEditorSession } from '@/features/playlist/utils/smartPlaylistEditor';
import {
  unsupportedSmartRulePaths,
  validateSmartRulesDocument,
  type ValidateSmartRulesOptions,
} from '@/features/playlist/utils/smartPlaylistRules';

interface Props {
  session: SmartEditorSession;
  onDraftChange: (json: string) => void;
  onApply: () => void;
  validationOptions: ValidateSmartRulesOptions;
}

export default function PlaylistsSmartEditorJson({
  session, onDraftChange, onApply, validationOptions,
}: Props) {
  const { t } = useTranslation();
  const issues = session.jsonError
    ? []
    : validateSmartRulesDocument(session.document, validationOptions);
  const unsupported = session.jsonError
    ? []
    : unsupportedSmartRulePaths(session.document, validationOptions);

  return (
    <section style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-3)' }}>
      <textarea
        className="input"
        aria-label={t('smartPlaylists.modeJson')}
        value={session.jsonDraft}
        onChange={event => onDraftChange(event.target.value)}
        rows={18}
        style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)', width: '100%', resize: 'vertical' }}
      />
      {session.jsonError && (
        <div style={{ color: 'var(--danger, #c0392b)', fontSize: 12, marginTop: 'var(--space-2)' }}>
          {t('smartPlaylists.jsonInvalid')} {session.jsonError}
        </div>
      )}
      {issues.filter(issue => issue.severity === 'error').map(issue => (
        <div key={`${issue.path}-${issue.code}`} style={{ color: 'var(--danger, #c0392b)', fontSize: 12, marginTop: 'var(--space-1)' }}>
          {issue.path}: {issue.message}
        </div>
      ))}
      {unsupported.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 'var(--space-2)' }}>
          {t('smartPlaylists.unsupportedPaths', { paths: unsupported.join(', ') })}
        </div>
      )}
      <div style={{ marginTop: 'var(--space-3)' }}>
        <button type="button" className="btn btn-primary" onClick={onApply} disabled={!!session.jsonError}>
          {t('smartPlaylists.applyJson')}
        </button>
      </div>
    </section>
  );
}
