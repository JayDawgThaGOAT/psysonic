import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import SidebarLibraryPicker from '@/features/sidebar/components/SidebarLibraryPicker';

const folders = [
  { id: 'lib-a', name: 'Rock' },
  { id: 'lib-b', name: 'Jazz' },
  { id: 'lib-c', name: 'Classical' },
];

async function flushAnimationFrame(): Promise<void> {
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
}

function renderPicker(
  over: Partial<ComponentProps<typeof SidebarLibraryPicker>> = {},
) {
  const onSelectionChange = vi.fn();
  const setLibraryDropdownOpen = vi.fn();
  const props = {
    groups: [{
      serverId: 'server-a',
      serverLabel: 'Home',
      folders,
      selectedLibraryIds: [] as string[],
    }],
    libraryDropdownOpen: true,
    setLibraryDropdownOpen,
    dropdownRect: { top: 0, left: 0, width: 240 },
    libraryTriggerRef: createRef<HTMLButtonElement>(),
    onSelectionChange,
    ...over,
  };

  renderWithProviders(<SidebarLibraryPicker {...props} />);

  return { onSelectionChange, setLibraryDropdownOpen, props };
}

describe('SidebarLibraryPicker', () => {
  it('shows the folder name when exactly one library is selected', () => {
    renderPicker({
      groups: [{ serverId: 'server-a', serverLabel: 'Home', folders, selectedLibraryIds: ['lib-b'] }],
      libraryDropdownOpen: false,
    });

    expect(screen.getByText('Jazz')).toBeInTheDocument();
  });

  it('shows the multi-library count summary', () => {
    renderPicker({
      groups: [{ serverId: 'server-a', serverLabel: 'Home', folders, selectedLibraryIds: ['lib-a', 'lib-c'] }],
      libraryDropdownOpen: false,
    });

    expect(screen.getByText('2 libraries')).toBeInTheDocument();
  });

  it('shows All libraries when every server uses its complete library scope', () => {
    renderPicker({
      groups: [
        { serverId: 'server-a', serverLabel: 'Home', folders, selectedLibraryIds: [] },
        { serverId: 'server-b', serverLabel: 'Remote', folders: [{ id: 'lib-d', name: 'Live' }], selectedLibraryIds: [] },
      ],
      libraryDropdownOpen: false,
    });

    expect(screen.getByText('All libraries')).toBeInTheDocument();
    expect(screen.queryByText('2 servers')).not.toBeInTheDocument();
  });

  it('counts selected libraries across servers instead of counting servers', () => {
    renderPicker({
      groups: [
        { serverId: 'server-a', serverLabel: 'Home', folders, selectedLibraryIds: [] },
        {
          serverId: 'server-b',
          serverLabel: 'Remote',
          folders: [{ id: 'lib-d', name: 'Live' }, { id: 'lib-e', name: 'Archive' }],
          selectedLibraryIds: ['lib-d', 'lib-e'],
        },
      ],
      libraryDropdownOpen: false,
    });

    expect(screen.getByText('5 libraries')).toBeInTheDocument();
    expect(screen.queryByText('2 servers')).not.toBeInTheDocument();
  });

  it('clears the selection when All libraries is chosen', async () => {
    const user = userEvent.setup();
    const { onSelectionChange, setLibraryDropdownOpen } = renderPicker({
      groups: [{ serverId: 'server-a', serverLabel: 'Home', folders, selectedLibraryIds: ['lib-a'] }],
    });

    const panel = screen.getByRole('dialog', { name: 'Library scope' });
    await user.click(within(panel).getByRole('button', { name: 'All libraries' }));
    await flushAnimationFrame();

    expect(onSelectionChange).toHaveBeenCalledWith('server-a', []);
    expect(setLibraryDropdownOpen).not.toHaveBeenCalled();
  });

  it('exclusive-selects one library when its label is clicked', async () => {
    const user = userEvent.setup();
    const { onSelectionChange, setLibraryDropdownOpen } = renderPicker({
      groups: [{ serverId: 'server-a', serverLabel: 'Home', folders, selectedLibraryIds: ['lib-a', 'lib-b'] }],
    });

    const panel = screen.getByRole('dialog', { name: 'Library scope' });
    await user.click(within(panel).getByRole('button', { name: 'Classical' }));
    await flushAnimationFrame();

    expect(onSelectionChange).toHaveBeenCalledWith('server-a', ['lib-c']);
    expect(setLibraryDropdownOpen).toHaveBeenCalledWith(false);
  });

  it('toggles a library on from the all-libraries state', async () => {
    const user = userEvent.setup();
    const { onSelectionChange } = renderPicker();

    const panel = screen.getByRole('dialog', { name: 'Library scope' });
    await user.click(within(panel).getByRole('button', { name: 'Include Jazz · Home' }));

    expect(onSelectionChange).toHaveBeenCalledWith('server-a', ['lib-b']);
  });

  it('appends a toggled-on library to the ordered selection', async () => {
    const user = userEvent.setup();
    const { onSelectionChange } = renderPicker({
      groups: [{ serverId: 'server-a', serverLabel: 'Home', folders, selectedLibraryIds: ['lib-a'] }],
    });

    const panel = screen.getByRole('dialog', { name: 'Library scope' });
    await user.click(within(panel).getByRole('button', { name: 'Include Jazz · Home' }));

    expect(onSelectionChange).toHaveBeenCalledWith('server-a', ['lib-a', 'lib-b']);
  });

  it('removes a toggled-off library from the selection', async () => {
    const user = userEvent.setup();
    const { onSelectionChange } = renderPicker({
      groups: [{ serverId: 'server-a', serverLabel: 'Home', folders, selectedLibraryIds: ['lib-a', 'lib-b'] }],
    });

    const panel = screen.getByRole('dialog', { name: 'Library scope' });
    await user.click(within(panel).getByRole('button', { name: 'Exclude Rock · Home' }));

    expect(onSelectionChange).toHaveBeenCalledWith('server-a', ['lib-b']);
  });

  it('groups duplicate library names under their servers', () => {
    renderPicker({
      groups: [
        { serverId: 'server-a', serverLabel: 'Home', folders: [{ id: 'a-jazz', name: 'Jazz' }], selectedLibraryIds: [] },
        { serverId: 'server-b', serverLabel: 'Remote', folders: [{ id: 'b-jazz', name: 'Jazz' }], selectedLibraryIds: [] },
      ],
    });

    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Remote')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Include Jazz · Home' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Include Jazz · Remote' })).toBeInTheDocument();
  });
});
