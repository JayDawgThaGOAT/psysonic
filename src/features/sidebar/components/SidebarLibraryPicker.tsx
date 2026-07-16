import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, Music2 } from 'lucide-react';
import type { MusicFolder } from '@/store/authStoreTypes';

export interface SidebarLibraryGroup {
  serverId: string;
  serverLabel: string;
  folders: MusicFolder[];
  selectedLibraryIds: string[];
}

interface Props {
  groups: SidebarLibraryGroup[];
  selectionSummary: string | null;
  libraryDropdownOpen: boolean;
  setLibraryDropdownOpen: (open: boolean) => void;
  dropdownRect: { top: number; left: number; width: number };
  libraryTriggerRef: React.RefObject<HTMLButtonElement | null>;
  onSelectionChange: (serverId: string, libraryIds: string[]) => void;
}

export default function SidebarLibraryPicker({
  groups,
  selectionSummary,
  libraryDropdownOpen,
  setLibraryDropdownOpen,
  dropdownRect,
  libraryTriggerRef,
  onSelectionChange,
}: Props) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelWidth, setPanelWidth] = useState<number | null>(null);
  const folderCount = groups.reduce((count, group) => count + group.folders.length, 0);
  const hasExplicitSelection = groups.some(group => group.selectedLibraryIds.length > 0);

  useLayoutEffect(() => {
    if (!libraryDropdownOpen) {
      // React Compiler set-state-in-effect rule: panel width is measured from layout after open.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPanelWidth(null);
      return;
    }
    const measure = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const minW = dropdownRect.width;
      const maxW = Math.max(minW, window.innerWidth - dropdownRect.left - 8);
      panel.dataset.measure = 'true';
      panel.style.width = 'max-content';
      panel.style.minWidth = `${minW}px`;
      const measured = panel.offsetWidth;
      delete panel.dataset.measure;
      panel.style.width = '';
      panel.style.minWidth = '';
      setPanelWidth(Math.min(Math.max(minW, measured), maxW));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [libraryDropdownOpen, dropdownRect.left, dropdownRect.width, groups]);

  const selectAllLibraries = (serverId: string) => {
    onSelectionChange(serverId, []);
  };

  const exclusiveSelect = (serverId: string, id: string) => {
    setLibraryDropdownOpen(false);
    requestAnimationFrame(() => onSelectionChange(serverId, [id]));
  };

  const toggleFolder = (group: SidebarLibraryGroup, id: string) => {
    if (group.selectedLibraryIds.length === 0) {
      onSelectionChange(group.serverId, [id]);
      return;
    }
    if (group.selectedLibraryIds.includes(id)) {
      onSelectionChange(group.serverId, group.selectedLibraryIds.filter(folderId => folderId !== id));
      return;
    }
    onSelectionChange(group.serverId, [...group.selectedLibraryIds, id]);
  };

  return (
    <>
      <button
        ref={libraryTriggerRef}
        type="button"
        className={`nav-library-scope-trigger ${hasExplicitSelection ? '' : 'nav-library-scope-trigger--plain'} ${libraryDropdownOpen ? 'nav-library-scope-trigger--open' : ''}`}
        onClick={() => setLibraryDropdownOpen(!libraryDropdownOpen)}
        aria-label={t('sidebar.libraryScope')}
        aria-expanded={libraryDropdownOpen}
        aria-haspopup="dialog"
        data-tooltip={libraryDropdownOpen ? undefined : t('sidebar.libraryScope')}
        data-tooltip-pos="bottom"
      >
        {hasExplicitSelection ? <Music2 size={16} className="nav-library-scope-icon" strokeWidth={2} aria-hidden /> : null}
        <div className="nav-library-scope-text">
          <span className="nav-library-scope-title">{t('sidebar.library')}</span>
          {selectionSummary ? (
            <span className="nav-library-scope-subtitle" data-tooltip={selectionSummary} data-tooltip-pos="right">
              {selectionSummary}
            </span>
          ) : null}
        </div>
        <ChevronDown size={16} strokeWidth={2.25} className="nav-library-scope-chevron" aria-hidden />
      </button>
      {libraryDropdownOpen && createPortal(
        <div
          ref={panelRef}
          className={`nav-library-dropdown-panel${folderCount + groups.length > 10 ? ' nav-library-dropdown-panel--many-libraries' : ''}`}
          role="dialog"
          aria-label={t('sidebar.libraryScope')}
          style={{
            position: 'fixed',
            top: dropdownRect.top,
            left: dropdownRect.left,
            minWidth: dropdownRect.width,
            width: panelWidth ?? 'max-content',
            boxSizing: 'border-box',
          }}
        >
          {groups.map(group => {
            const allLibrariesSelected = group.selectedLibraryIds.length === 0;
            return (
              <section key={group.serverId} className="nav-library-server-group" aria-label={group.serverLabel}>
                <div className="nav-library-server-group-heading">{group.serverLabel}</div>
                <div className={`nav-library-dropdown-item ${allLibrariesSelected ? 'nav-library-dropdown-item--selected' : ''}`}>
                  <button
                    type="button"
                    className="nav-library-dropdown-item-main"
                    onClick={() => selectAllLibraries(group.serverId)}
                  >
                    <span className="nav-library-dropdown-item-label">{t('sidebar.allLibraries')}</span>
                  </button>
                  <span
                    className={`nav-library-dropdown-item-toggle ${allLibrariesSelected ? 'nav-library-dropdown-item-toggle--on' : 'nav-library-dropdown-item-toggle--align-only'}`}
                    aria-hidden
                  >
                    {allLibrariesSelected ? <Check size={16} strokeWidth={2.5} /> : null}
                  </span>
                </div>
                {group.folders.map(folder => {
                  const selected = group.selectedLibraryIds.includes(folder.id);
                  const accessibleName = `${folder.name} · ${group.serverLabel}`;
                  return (
                    <div key={folder.id} className={`nav-library-dropdown-item ${selected ? 'nav-library-dropdown-item--selected' : ''}`}>
                      <button
                        type="button"
                        className="nav-library-dropdown-item-main"
                        onClick={() => exclusiveSelect(group.serverId, folder.id)}
                      >
                        <span className="nav-library-dropdown-item-label">{folder.name}</span>
                      </button>
                      <button
                        type="button"
                        className={`nav-library-dropdown-item-toggle ${selected ? 'nav-library-dropdown-item-toggle--on' : ''}`}
                        aria-label={selected
                          ? t('sidebar.libraryDeselect', { name: accessibleName })
                          : t('sidebar.librarySelect', { name: accessibleName })}
                        aria-pressed={selected}
                        onClick={event => {
                          event.stopPropagation();
                          toggleFolder(group, folder.id);
                        }}
                      >
                        {selected ? <Check size={16} strokeWidth={2.5} /> : <span className="nav-library-dropdown-item-toggle-box" aria-hidden />}
                      </button>
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}
