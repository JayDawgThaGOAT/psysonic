import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { HomeSectionId } from '@/features/home/store/homeStore';
import {
  useMainstageDiagnosticStore,
  type MainstageDiagnosticSectionState,
} from '@/features/home/store/mainstageDiagnosticStore';

interface MainstageDiagnosticFrameProps {
  sectionId: HomeSectionId;
  label: string;
  children: ReactNode;
  active: boolean;
}

export default function MainstageDiagnosticFrame({
  sectionId,
  label,
  children,
  active,
}: MainstageDiagnosticFrameProps) {
  const { t } = useTranslation();
  const infoId = useId();
  const section = useMainstageDiagnosticStore(state => state.sections[sectionId]);
  const setEnabled = useMainstageDiagnosticStore(state => state.setEnabled);
  const statusLabel = t(`home.diagnostics.statuses.${section.status}`);

  if (!active) return children;

  return (
    <section
      className="mainstage-diagnostic-frame"
      data-section-id={sectionId}
      data-status={section.status}
      aria-label={label}
    >
      <div className="mainstage-diagnostic-frame__controls">
        <label className="mainstage-diagnostic-frame__toggle">
          <input
            type="checkbox"
            checked={section.enabled}
            onChange={event => setEnabled(sectionId, event.target.checked)}
            aria-describedby={infoId}
            aria-label={t('home.diagnostics.enableSection', { section: label })}
          />
          <span>{label}</span>
        </label>
        <span
          className="mainstage-diagnostic-frame__status"
          data-status={section.status}
          aria-live="polite"
        >
          {statusLabel}
        </span>
      </div>

      {section.enabled ? children : null}

      <dl
        className="mainstage-diagnostic-frame__info"
        id={infoId}
        aria-label={t('home.diagnostics.generationInfo')}
        role="button"
        tabIndex={0}
        onClick={() => void copyDiagnosticInfo(sectionId, label, section, statusLabel)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            void copyDiagnosticInfo(sectionId, label, section, statusLabel);
          }
        }}
      >
        <div>
          <dt>{t('home.diagnostics.duration')}</dt>
          <dd>{formatDuration(section.durationMs, t('home.diagnostics.unavailable'))}</dd>
        </div>
        <div>
          <dt>{t('home.diagnostics.itemCount')}</dt>
          <dd>{section.itemCount ?? t('home.diagnostics.unavailable')}</dd>
        </div>
        <div>
          <dt>{t('home.diagnostics.status')}</dt>
          <dd>{statusLabel}</dd>
        </div>
        {section.detail ? (
          <div className="mainstage-diagnostic-frame__detail">
            <dt>{t('home.diagnostics.detail')}</dt>
            <dd>{section.detail}</dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}

function formatDuration(durationMs: number | null, unavailable: string): string {
  if (durationMs == null) return unavailable;
  const rounded = durationMs < 10
    ? Math.round(durationMs * 10) / 10
    : Math.round(durationMs);
  return `${rounded} ms`;
}

async function copyDiagnosticInfo(
  sectionId: HomeSectionId,
  label: string,
  section: MainstageDiagnosticSectionState,
  statusLabel: string,
): Promise<void> {
  const detail = section.detail ? `\ndetail: ${section.detail}` : '';
  const text = [
    `mainstage section: ${sectionId} (${label})`,
    `status: ${section.status} (${statusLabel})`,
    `durationMs: ${section.durationMs ?? 'n/a'}`,
    `itemCount: ${section.itemCount ?? 'n/a'}`,
    `enabled: ${section.enabled}`,
  ].join('\n') + detail;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard access may be unavailable in an embedded webview permission state.
  }
}
