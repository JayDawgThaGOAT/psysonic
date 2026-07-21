import { Check } from 'lucide-react';

export interface ServerChoiceOption {
  id: string;
  label: string;
}

interface Props {
  value: string;
  options: ServerChoiceOption[];
  onChange: (serverId: string) => void;
  ariaLabel: string;
  disabled?: boolean;
  autoFocusSelected?: boolean;
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
            className={`nav-library-dropdown-item ${selected ? 'nav-library-dropdown-item--selected' : ''}`}
            onClick={() => onChange(server.id)}
            disabled={disabled}
            autoFocus={autoFocusSelected && selected}
          >
            <span className="nav-library-dropdown-item-label">{server.label}</span>
            <span
              className={`nav-library-dropdown-item-toggle ${selected ? 'nav-library-dropdown-item-toggle--on' : ''}`}
              aria-hidden
            >
              {selected ? <Check size={16} strokeWidth={2.5} /> : <span className="nav-library-dropdown-item-toggle-box" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
