import { useTranslation } from 'react-i18next';
import CustomSelect from '@/ui/CustomSelect';

export interface ServerSelectOption {
  id: string;
  label: string;
}

interface Props {
  value: string;
  options: ServerSelectOption[];
  onChange: (serverId: string) => void;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export default function ServerSelect({
  value,
  options,
  onChange,
  disabled,
  className,
  style,
}: Props) {
  const { t } = useTranslation();

  if (options.length <= 1) return null;

  return (
    <CustomSelect
      value={value}
      options={options.map(server => ({ value: server.id, label: server.label }))}
      onChange={onChange}
      disabled={disabled}
      className={className}
      style={style}
      ariaLabel={t('settings.servers')}
    />
  );
}
