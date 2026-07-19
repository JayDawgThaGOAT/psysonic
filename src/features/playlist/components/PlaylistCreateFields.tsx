import React, { useId } from 'react';
import { useTranslation } from 'react-i18next';
import ServerSelect, { type ServerSelectOption } from '@/ui/ServerSelect';

interface Props {
  name: string;
  nameLabel: string;
  namePlaceholder: string;
  onNameChange: (name: string) => void;
  onNameKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  nameInputRef?: React.RefObject<HTMLInputElement | null>;
  serverId: string;
  onServerChange: (serverId: string) => void;
  serverOptions: ServerSelectOption[];
  showServer?: boolean;
}

export default function PlaylistCreateFields({
  name,
  nameLabel,
  namePlaceholder,
  onNameChange,
  onNameKeyDown,
  nameInputRef,
  serverId,
  onServerChange,
  serverOptions,
  showServer = true,
}: Props) {
  const { t } = useTranslation();
  const nameId = useId();
  const serverVisible = showServer && serverOptions.length > 1;

  return (
    <div className={`playlist-create-fields${serverVisible ? '' : ' playlist-create-fields--single'}`}>
      <label className="playlist-create-field" htmlFor={nameId}>
        <span className="playlist-create-field__label">{nameLabel}</span>
        <input
          ref={nameInputRef}
          id={nameId}
          className="input"
          placeholder={namePlaceholder}
          value={name}
          onChange={event => onNameChange(event.target.value)}
          onKeyDown={onNameKeyDown}
        />
      </label>
      {serverVisible && (
        <div className="playlist-create-field">
          <span className="playlist-create-field__label">{t('settings.servers')}</span>
          <ServerSelect
            value={serverId}
            options={serverOptions}
            onChange={onServerChange}
          />
        </div>
      )}
    </div>
  );
}
