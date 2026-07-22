import { Check, TriangleAlert } from 'lucide-react';

export interface ServerChoiceOption {
  id: string;
  label: string;
  warning?: string;
}

interface Props {
  value: string;
  options: ServerChoiceOption[];
  onChange: (serverId: string) => void;
  ariaLabel: string;
  disabled?: boolean;
  autoFocusSelected?: boolean;
}

export function ServerChoiceWarning({ warning }: { warning?: string }) {
  if (!warning) return null;
  return (
    <span
      className="server-choice-warning"
      data-tooltip={warning}
      data-tooltip-wrap
      aria-hidden
    >
      <TriangleAlert size={15} strokeWidth={2.25} />
    </span>
  );
}

export default function ServerChoiceList({
  value,
  options,
  onChange,
  ariaLabel,
  disabled,
  autoFocusSelected,
}: Props) {
  return (
    <div className="nav-library-dropdown-panel" role="radiogroup" aria-label={ariaLabel}>
      {options.map(server => {
        const selected = server.id === value;
        return (
          <button
            key={server.id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={server.warning ? `${server.label}. ${server.warning}` : undefined}
            className={`nav-library-dropdown-item ${selected ? 'nav-library-dropdown-item--selected' : ''}`}
            onClick={() => onChange(server.id)}
            disabled={disabled}
            autoFocus={autoFocusSelected && selected}
          >
            <span className="nav-library-dropdown-item-label server-choice-label">
              <span className="server-choice-label__text">{server.label}</span>
              <ServerChoiceWarning warning={server.warning} />
            </span>
            <span
              className={`nav-library-dropdown-item-toggle server-choice-check ${selected ? 'nav-library-dropdown-item-toggle--on' : ''}`}
              aria-hidden
            >
              {selected ? <Check size={16} strokeWidth={2.5} /> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
