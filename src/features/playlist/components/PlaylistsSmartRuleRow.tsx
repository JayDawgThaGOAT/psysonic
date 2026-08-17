import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import CustomSelect from '@/ui/CustomSelect';
import PlaylistsSmartFieldPicker from '@/features/playlist/components/PlaylistsSmartFieldPicker';
import PlaylistsSmartValuePicker from '@/features/playlist/components/PlaylistsSmartValuePicker';
import {
  findSmartRuleField,
  getSmartRuleOperatorsForField,
  type SmartPlaylistCapabilities,
  type SmartRuleFieldDefinition,
} from '@/features/playlist/utils/smartPlaylistFields';
import { YEAR_MAX, YEAR_MIN } from '@/features/playlist/utils/playlistsSmart';
import {
  setSmartRuleValue,
  type SmartRuleLeafNode,
  type SmartRuleValidationIssue,
  type SmartRulesDocument,
} from '@/features/playlist/utils/smartPlaylistRules';

interface PlaylistOption {
  id: string;
  name: string;
}

interface Props {
  node: SmartRuleLeafNode;
  document: SmartRulesDocument;
  onDocumentChange: (document: SmartRulesDocument) => void;
  capabilities: SmartPlaylistCapabilities;
  customFields: readonly SmartRuleFieldDefinition[];
  playlistOptions: PlaylistOption[];
  genreSuggestions?: readonly string[];
  issues?: readonly SmartRuleValidationIssue[];
}

function controlIssueClass(issues: readonly SmartRuleValidationIssue[]): string {
  if (issues.some(issue => issue.severity === 'error')) return 'smart-query-control-error';
  if (issues.length > 0) return 'smart-query-control-warning';
  return '';
}

function isYearField(field: SmartRuleFieldDefinition | undefined): boolean {
  return field?.type === 'number' && /year$/i.test(field.name);
}

function isPlaylistOperator(operator: string): boolean {
  return operator === 'inPlaylist' || operator === 'notInPlaylist';
}

function playlistIdValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value && 'id' in value) {
    return String((value as { id?: unknown }).id ?? '');
  }
  return '';
}

function currentYear(): number {
  return new Date().getFullYear();
}

function todayIsoDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function defaultValueFor(
  field: SmartRuleFieldDefinition,
  operator: string,
): unknown {
  if (isPlaylistOperator(operator) || field.type === 'playlist') return '';
  if (operator === 'isMissing' || operator === 'isPresent') return true;
  if (operator === 'inTheRange') {
    if (field.type === 'date') return [todayIsoDate(), todayIsoDate()];
    if (isYearField(field)) return [YEAR_MIN, YEAR_MAX];
    return [0, 0];
  }
  if (operator === 'inTheLast' || operator === 'notInTheLast') return 1;
  if (operator === 'gt' || operator === 'lt') {
    return isYearField(field) ? currentYear() : 1;
  }
  switch (field.type) {
    case 'boolean':
      return true;
    case 'number':
      return isYearField(field) ? currentYear() : 0;
    case 'date':
      return todayIsoDate();
    default:
      return '';
  }
}

export default function PlaylistsSmartRuleRow({
  node, document, onDocumentChange, capabilities, customFields, playlistOptions,
  genreSuggestions = [], issues = [],
}: Props) {
  const { t } = useTranslation();
  const isPlaylistOp = isPlaylistOperator(node.operator);
  const field = findSmartRuleField(isPlaylistOp ? 'playlist' : node.field, customFields);
  const fieldIssues = issues.filter(issue => (
    issue.code === 'unknown_field' || issue.code === 'unsupported_field'
  ));
  const operatorIssues = issues.filter(issue => (
    issue.code === 'unknown_operator' || issue.code === 'unsupported_operator'
  ));
  const valueIssues = issues.filter(issue => (
    issue.code === 'invalid_value' || issue.code === 'self_reference'
  ));
  const fieldIssueClass = controlIssueClass(fieldIssues);
  const operatorIssueClass = controlIssueClass(operatorIssues);
  const valueIssueClass = controlIssueClass(valueIssues);
  const operators = useMemo(() => (
    field ? getSmartRuleOperatorsForField(field, capabilities) : []
  ), [capabilities, field]);

  const replaceLeaf = (operator: string, fieldName: string, value: unknown) => {
    const playlist = isPlaylistOperator(operator);
    const nextValue = playlist
      ? { id: typeof value === 'string' ? value : playlistIdValue(value) }
      : { [fieldName]: value };
    onDocumentChange(setSmartRuleValue(document, node.path, { [operator]: nextValue }));
  };

  const currentValue = isPlaylistOp ? playlistIdValue(node.value) : node.value;

  return (
    <div className="smart-query-rule">
      <PlaylistsSmartFieldPicker
        value={isPlaylistOp ? 'playlist' : node.field}
        className={fieldIssueClass}
        ariaInvalid={fieldIssues.some(issue => issue.severity === 'error')}
        capabilities={capabilities}
        customFields={customFields}
        onChange={nextField => {
          const nextOps = getSmartRuleOperatorsForField(nextField, capabilities);
          const operator = nextOps.some(item => item.name === node.operator)
            ? node.operator
            : nextOps[0]?.name ?? 'is';
          replaceLeaf(operator, nextField.name, defaultValueFor(nextField, operator));
        }}
      />
      <CustomSelect
        value={node.operator}
        className={operatorIssueClass}
        ariaInvalid={operatorIssues.some(issue => issue.severity === 'error')}
        options={operators.map(operator => ({
          value: operator.name,
          label: t(`smartPlaylists.operator_${operator.name}`),
        }))}
        onChange={operator => {
          const keepPlaylistValue = isPlaylistOp && isPlaylistOperator(operator);
          replaceLeaf(
            operator,
            isPlaylistOp ? 'playlist' : node.field,
            keepPlaylistValue
              ? currentValue
              : field ? defaultValueFor(field, operator) : currentValue,
          );
        }}
      />
      {renderValueInput({
        t,
        operator: node.operator,
        field,
        value: currentValue,
        playlistOptions,
        genreSuggestions,
        issueClass: valueIssueClass,
        ariaInvalid: valueIssues.some(issue => issue.severity === 'error'),
        onChange: value => replaceLeaf(node.operator, isPlaylistOp ? 'id' : node.field, value),
      })}
    </div>
  );
}

function renderValueInput({
  t, operator, field, value, playlistOptions, genreSuggestions, issueClass, ariaInvalid, onChange,
}: {
  t: TFunction;
  operator: string;
  field: SmartRuleFieldDefinition | undefined;
  value: unknown;
  playlistOptions: PlaylistOption[];
  genreSuggestions: readonly string[];
  issueClass: string;
  ariaInvalid: boolean;
  onChange: (value: unknown) => void;
}) {
  if (isPlaylistOperator(operator) || field?.type === 'playlist') {
    return (
      <PlaylistsSmartValuePicker
        value={typeof value === 'string' ? value : ''}
        options={playlistOptions.map(option => ({ value: option.id, label: option.name }))}
        onChange={onChange}
        ariaLabel={t('smartPlaylists.value')}
        className={issueClass}
        ariaInvalid={ariaInvalid}
      />
    );
  }
  if (operator === 'isMissing' || operator === 'isPresent') return null;
  if (field?.type === 'boolean') {
    return (
      <CustomSelect
        value={value === false ? 'false' : 'true'}
        options={[
          { value: 'true', label: t('smartPlaylists.booleanTrue') },
          { value: 'false', label: t('smartPlaylists.booleanFalse') },
        ]}
        onChange={next => onChange(next === 'true')}
        ariaLabel={t('smartPlaylists.booleanValue')}
        className={issueClass}
        ariaInvalid={ariaInvalid}
      />
    );
  }
  if (operator === 'inTheRange') {
    const range = Array.isArray(value) ? value : [value, value];
    const isDate = field?.type === 'date';
    return (
      <div className={`smart-query-rule-value ${issueClass}`} aria-invalid={ariaInvalid || undefined}>
        {isDate ? (
          <>
            <DateValueInput
              value={String(range[0] ?? '')}
              onChange={next => onChange([next, range[1]])}
            />
            <DateValueInput
              value={String(range[1] ?? '')}
              onChange={next => onChange([range[0], next])}
            />
          </>
        ) : isYearField(field) ? (
          <>
            <YearValueInput
              value={range[0]}
              onChange={next => onChange([next, range[1]])}
            />
            <YearValueInput
              value={range[1]}
              onChange={next => onChange([range[0], next])}
            />
          </>
        ) : (
          <>
            <input
              className="input"
              type="number"
              value={String(range[0] ?? '')}
              onChange={event => onChange([Number(event.target.value), range[1]])}
            />
            <input
              className="input"
              type="number"
              value={String(range[1] ?? '')}
              onChange={event => onChange([range[0], Number(event.target.value)])}
            />
          </>
        )}
      </div>
    );
  }
  if (field?.type === 'date' || operator === 'before' || operator === 'after') {
    return (
      <DateValueInput
        value={typeof value === 'string' ? value : ''}
        onChange={onChange}
        className={issueClass}
        ariaInvalid={ariaInvalid}
      />
    );
  }
  if (isYearField(field)) {
    return <YearValueInput value={value} onChange={onChange} className={issueClass} ariaInvalid={ariaInvalid} />;
  }
  if (field?.type === 'number' || operator === 'gt' || operator === 'lt'
    || operator === 'inTheLast' || operator === 'notInTheLast') {
    return (
      <input
        className={`input ${issueClass}`}
        aria-invalid={ariaInvalid || undefined}
        type="number"
        value={typeof value === 'number' ? value : ''}
        onChange={event => onChange(Number(event.target.value))}
      />
    );
  }
  if (field?.name === 'genre' && genreSuggestions.length > 0) {
    return (
      <PlaylistsSmartValuePicker
        value={typeof value === 'string' ? value : String(value ?? '')}
        options={genreSuggestions.map(genre => ({ value: genre, label: genre }))}
        onChange={onChange}
        ariaLabel={t('smartPlaylists.value')}
        className={issueClass}
        ariaInvalid={ariaInvalid}
      />
    );
  }
  return (
    <input
      className={`input ${issueClass}`}
      aria-invalid={ariaInvalid || undefined}
      value={typeof value === 'string' ? value : String(value ?? '')}
      onChange={event => onChange(event.target.value)}
    />
  );
}

function yearOptions(): Array<{ value: string; label: string }> {
  const years: Array<{ value: string; label: string }> = [];
  for (let year = YEAR_MAX; year >= YEAR_MIN; year--) {
    years.push({ value: String(year), label: String(year) });
  }
  return years;
}

function YearValueInput({
  value,
  onChange,
  className = '',
  ariaInvalid,
}: {
  value: unknown;
  onChange: (value: number) => void;
  className?: string;
  ariaInvalid?: boolean;
}) {
  const { t } = useTranslation();
  const year = typeof value === 'number' && value >= YEAR_MIN ? String(value) : String(currentYear());
  return (
    <CustomSelect
      value={year}
      options={yearOptions()}
      onChange={next => onChange(Number(next))}
      ariaLabel={t('smartPlaylists.year')}
      className={className}
      ariaInvalid={ariaInvalid}
    />
  );
}

const MONTH_KEYS = [
  'monthJan', 'monthFeb', 'monthMar', 'monthApr', 'monthMay', 'monthJun',
  'monthJul', 'monthAug', 'monthSep', 'monthOct', 'monthNov', 'monthDec',
] as const;

function parseIsoDate(value: string): { year: string; month: string; day: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    const today = todayIsoDate();
    return { year: today.slice(0, 4), month: today.slice(5, 7), day: today.slice(8, 10) };
  }
  return { year: match[1], month: match[2], day: match[3] };
}

function DateValueInput({
  value,
  onChange,
  className = '',
  ariaInvalid,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  ariaInvalid?: boolean;
}) {
  const { t } = useTranslation();
  const parsed = parseIsoDate(value);
  const emit = (year: string, month: string, day: string) => {
    const lastDay = new Date(Number(year), Number(month), 0).getDate();
    const safeDay = String(Math.min(Number(day) || 1, lastDay)).padStart(2, '0');
    onChange(`${year}-${month}-${safeDay}`);
  };

  return (
    <div className={`smart-query-rule-value ${className}`} aria-invalid={ariaInvalid || undefined}>
      <CustomSelect
        value={parsed.year}
        options={yearOptions()}
        onChange={year => emit(year, parsed.month, parsed.day)}
        ariaLabel={t('smartPlaylists.year')}
      />
      <CustomSelect
        value={parsed.month}
        options={MONTH_KEYS.map((key, index) => ({
          value: String(index + 1).padStart(2, '0'),
          label: t(`smartPlaylists.${key}`),
        }))}
        onChange={month => emit(parsed.year, month, parsed.day)}
        ariaLabel={t('smartPlaylists.month')}
      />
      <CustomSelect
        value={parsed.day}
        options={Array.from({ length: 31 }, (_, index) => {
          const day = String(index + 1).padStart(2, '0');
          return { value: day, label: day };
        })}
        onChange={day => emit(parsed.year, parsed.month, day)}
        ariaLabel={t('smartPlaylists.day')}
      />
    </div>
  );
}
