import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PlaylistsSmartEditor from '@/features/playlist/components/PlaylistsSmartEditor';
import {
  createSmartEditorSession,
  syncSessionFromBasicFilters,
  type SmartEditorSession,
} from '@/features/playlist/utils/smartPlaylistEditor';
import type { SubsonicServerIdentity } from '@/lib/server/subsonicServerIdentity';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';

function SmartEditorHarness({
  editingSmartId,
  initialSession,
  onSaveCopy,
  serverIdentity,
  availableGenres = [],
  playlistOptions,
  serverOptions = [
    { id: 'server-a', label: 'Server A' },
    { id: 'server-b', label: 'Server B' },
  ],
}: {
  editingSmartId: string | null;
  initialSession?: SmartEditorSession;
  onSaveCopy?: () => void;
  serverIdentity?: SubsonicServerIdentity;
  availableGenres?: string[];
  playlistOptions?: Array<{ id: string; name: string }>;
  serverOptions?: Array<{ id: string; label: string }>;
}) {
  const [session, setSession] = useState(initialSession ?? createSmartEditorSession());
  const [filters, setFilters] = useState(session.filters);
  const [serverId, setServerId] = useState('server-a');

  return (
    <PlaylistsSmartEditor
      session={session}
      setSession={setSession}
      smartFilters={filters}
      setSmartFilters={action => {
        setFilters(prev => {
          const next = typeof action === 'function' ? action(prev) : action;
          setSession(current => (
            current.mode === 'basic'
              ? syncSessionFromBasicFilters(current, next)
              : { ...current, filters: { ...current.filters, name: next.name } }
          ));
          return next;
        });
      }}
      availableGenres={availableGenres}
      playlistOptions={playlistOptions}
      genreQuery=""
      setGenreQuery={vi.fn()}
      editingSmartId={editingSmartId}
      creatingSmartBusy={false}
      genresReady
      createServerId={serverId}
      setCreateServerId={setServerId}
      createServerOptions={serverOptions}
      setCreatingSmart={vi.fn()}
      setEditingSmartId={vi.fn()}
      onSave={vi.fn()}
      onCancel={vi.fn()}
      onSaveCopy={onSaveCopy}
      onPreview={async () => []}
      serverIdentity={serverIdentity}
    />
  );
}

describe('PlaylistsSmartEditor', () => {
  it('shows the target server while creating a smart playlist', () => {
    const view = renderWithProviders(<SmartEditorHarness editingSmartId={null} />);

    expect(view.getByRole('textbox', { name: 'Playlist Name' })).toBeInTheDocument();
    expect(view.getByRole('combobox', { name: 'Servers' })).toHaveTextContent('Server A');
    expect(view.getByRole('tab', { name: 'Basic' })).toHaveAttribute('aria-selected', 'true');
  });

  it('keeps the owner server fixed while editing a smart playlist', () => {
    const view = renderWithProviders(<SmartEditorHarness editingSmartId="smart-1" />);

    expect(view.getByRole('textbox', { name: 'Playlist Name' })).toBeInTheDocument();
    expect(view.queryByRole('combobox', { name: 'Servers' })).not.toBeInTheDocument();
  });

  it('hides the owner selector when creating in single-server mode', () => {
    const view = renderWithProviders(
      <SmartEditorHarness
        editingSmartId={null}
        serverOptions={[{ id: 'server-a', label: 'Server A' }]}
      />,
    );

    expect(view.getByRole('textbox', { name: 'Playlist Name' })).toBeInTheDocument();
    expect(view.queryByRole('combobox', { name: 'Servers' })).not.toBeInTheDocument();
  });

  it('keeps Basic UX and can switch to Advanced and JSON', async () => {
    const user = userEvent.setup();
    const view = renderWithProviders(<SmartEditorHarness editingSmartId={null} />);

    expect(view.getByText('1. Basic')).toBeInTheDocument();
    expect(view.getByText('2. Genres')).toBeInTheDocument();
    expect(view.getByPlaceholderText('Artist contains…')).toBeInTheDocument();

    await user.click(view.getByRole('tab', { name: 'Advanced' }));
    expect(view.getByRole('tab', { name: 'Advanced' })).toHaveAttribute('aria-selected', 'true');
    expect(view.getByRole('combobox', { name: 'Match' })).toHaveTextContent('Match all');
    expect(view.getByRole('button', { name: 'Add rule' })).toBeInTheDocument();
    expect(view.queryByRole('button', { name: 'Remove group' })).toBeNull();

    await user.click(view.getByRole('button', { name: 'Add group' }));
    const matchHeads = view.getAllByRole('combobox', { name: 'Match' });
    expect(matchHeads.length).toBeGreaterThan(1);
    expect(matchHeads[0].closest('.smart-query-group-head')?.querySelector('[aria-label="Remove group"]')).toBeNull();
    expect(view.getByRole('button', { name: 'Remove group' })).toBeInTheDocument();

    await user.click(view.getByRole('tab', { name: 'JSON' }));
    expect(view.getByRole('tab', { name: 'JSON' })).toHaveAttribute('aria-selected', 'true');
    expect((view.getByLabelText('JSON') as HTMLTextAreaElement).value).toContain('inTheRange');
    expect((view.getByLabelText('JSON') as HTMLTextAreaElement).value).toContain('"limit": 50');
    expect((view.getByLabelText('JSON') as HTMLTextAreaElement).value).toContain('+random');
  });

  it('opens JSON from the current Basic filters', async () => {
    const user = userEvent.setup();
    const view = renderWithProviders(<SmartEditorHarness editingSmartId={null} />);

    await user.type(view.getByPlaceholderText('Artist contains…'), 'Radiohead');
    await user.click(view.getByRole('tab', { name: 'JSON' }));
    expect((view.getByLabelText('JSON') as HTMLTextAreaElement).value).toContain('Radiohead');
    expect(view.queryByRole('button', { name: 'Preview JSON' })).not.toBeInTheDocument();
  });

  it('does not switch nested rules into Basic', async () => {
    const user = userEvent.setup();
    const view = renderWithProviders(
      <SmartEditorHarness
        editingSmartId="smart-1"
        initialSession={createSmartEditorSession({
          name: 'Nested',
          rules: { any: [{ contains: { title: 'live' } }, { all: [{ contains: { artist: 'A' } }] }] },
        })}
      />,
    );

    expect(view.getByRole('tab', { name: 'Advanced' })).toHaveAttribute('aria-selected', 'true');
    await user.click(view.getByRole('tab', { name: 'Basic' }));
    expect(view.getByRole('tab', { name: 'Advanced' })).toHaveAttribute('aria-selected', 'true');
    expect(view.getByText(/cannot be shown in Basic/)).toBeInTheDocument();
  });

  it('exposes Save a copy only while editing an existing playlist', async () => {
    const user = userEvent.setup();
    const onSaveCopy = vi.fn();
    const view = renderWithProviders(
      <SmartEditorHarness editingSmartId="smart-1" onSaveCopy={onSaveCopy} />,
    );

    await user.click(view.getByRole('button', { name: 'Save a copy' }));
    expect(onSaveCopy).toHaveBeenCalledTimes(1);
  });

  it('keeps invalid JSON as a draft and does not apply it', async () => {
    const user = userEvent.setup();
    const view = renderWithProviders(<SmartEditorHarness editingSmartId={null} />);

    await user.click(view.getByRole('tab', { name: 'JSON' }));
    const editor = view.getByLabelText('JSON');
    await user.clear(editor);
    await user.paste('{');
    await user.click(view.getByRole('button', { name: 'Apply to editor' }));
    expect(view.getByText(/JSON is not valid/)).toBeInTheDocument();
    expect(view.getByRole('button', { name: 'Apply to editor' })).toBeDisabled();
  });

  it('uses a typed date field instead of a trapping native calendar', () => {
    const view = renderWithProviders(
      <SmartEditorHarness
        editingSmartId="smart-1"
        initialSession={createSmartEditorSession({
          name: 'Loved',
          rules: { any: [{ after: { lastplayed: '2024-01-15' } }] },
        })}
      />,
    );

    expect(view.getByRole('tab', { name: 'Advanced' })).toHaveAttribute('aria-selected', 'true');
    expect(view.getByRole('combobox', { name: 'Year' })).toHaveTextContent('2024');
    expect(view.getByRole('combobox', { name: 'Month' })).toHaveTextContent('January');
    expect(view.getByRole('combobox', { name: 'Day' })).toHaveTextContent('15');
  });

  it('edits Boolean rule values with a dropdown', async () => {
    const user = userEvent.setup();
    const view = renderWithProviders(
      <SmartEditorHarness
        editingSmartId="smart-1"
        serverIdentity={{ type: 'navidrome', serverVersion: '0.61.0' }}
        initialSession={createSmartEditorSession({
          name: 'Loved',
          rules: { any: [{ is: { loved: true } }] },
        })}
      />,
    );

    const valueSelect = view.getByRole('combobox', { name: 'Boolean value' });
    expect(valueSelect).toHaveTextContent('True');
    await user.click(valueSelect);
    await user.click(view.getByRole('option', { name: 'False' }));
    expect(valueSelect).toHaveTextContent('False');
  });

  it('defaults year rules to a real year instead of 0', async () => {
    const user = userEvent.setup();
    const view = renderWithProviders(
      <SmartEditorHarness
        editingSmartId="smart-1"
        initialSession={createSmartEditorSession({
          name: 'Years',
          rules: { any: [{ is: { year: 0 } }] },
        })}
      />,
    );

    expect(view.getByRole('combobox', { name: 'Year' })).toHaveTextContent(String(new Date().getFullYear()));
    await user.click(view.getByRole('combobox', { name: 'Year' }));
    expect(view.getByRole('option', { name: '1950' })).toBeInTheDocument();
  });

  it('toggles Advanced limit between a fixed count and a percentage', async () => {
    const user = userEvent.setup();
    const view = renderWithProviders(
      <SmartEditorHarness
        editingSmartId="smart-1"
        serverIdentity={{ type: 'navidrome', serverVersion: '0.61.0' }}
        initialSession={createSmartEditorSession({
          name: 'Capped',
          rules: { all: [{ contains: { title: 'live' } }], limit: 50 },
        })}
      />,
    );

    await user.click(view.getByRole('tab', { name: 'Advanced' }));
    expect(view.getByRole('button', { name: 'Fixed count' })).toBeInTheDocument();
    expect(view.getByRole('button', { name: 'Unlimited' })).toBeInTheDocument();
    expect(view.getByRole('spinbutton', { name: 'Fixed count' })).toHaveValue(50);
    await user.click(view.getByRole('button', { name: 'Percentage' }));
    expect(view.getByRole('slider', { name: 'Percentage' })).toBeInTheDocument();
    expect(view.getByRole('spinbutton', { name: 'Percentage' })).toHaveValue(25);
    expect(view.getByRole('slider', { name: 'Percentage' })).toHaveValue('25');
    await user.click(view.getByRole('button', { name: 'Fixed count' }));
    expect(view.getByRole('spinbutton', { name: 'Fixed count' })).toHaveValue(50);
    await user.click(view.getByRole('button', { name: 'Percentage' }));
    expect(view.getByRole('spinbutton', { name: 'Percentage' })).toHaveValue(25);
    fireEvent.change(view.getByRole('spinbutton', { name: 'Percentage' }), { target: { value: '0' } });
    expect(view.getByRole('spinbutton', { name: 'Percentage' })).toHaveValue(1);
    fireEvent.change(view.getByRole('spinbutton', { name: 'Percentage' }), { target: { value: '101' } });
    expect(view.getByRole('spinbutton', { name: 'Percentage' })).toHaveValue(100);
    await user.click(view.getByRole('button', { name: 'Unlimited' }));
    expect(view.queryByRole('spinbutton', { name: 'Percentage' })).toBeNull();
    await user.click(view.getByRole('button', { name: 'Percentage' }));
    expect(view.getByRole('spinbutton', { name: 'Percentage' })).toHaveValue(100);
  });

  it('suggests existing genres in Advanced rule values', async () => {
    const user = userEvent.setup();
    const view = renderWithProviders(
      <SmartEditorHarness
        editingSmartId="smart-1"
        availableGenres={['Rock', 'Jazz']}
        initialSession={createSmartEditorSession({
          name: 'Genres',
          rules: { all: [{ is: { genre: '' } }] },
        })}
      />,
    );

    const value = view.getByRole('combobox', { name: 'Value' });
    await user.click(value);
    await user.type(value, 'ja');
    await user.click(view.getByRole('option', { name: 'Jazz' }));
    expect(value).toHaveValue('Jazz');
  });

  it('duplicates a rule and a nested group', async () => {
    const user = userEvent.setup();
    const view = renderWithProviders(
      <SmartEditorHarness
        editingSmartId="smart-1"
        initialSession={createSmartEditorSession({
          name: 'Dup',
          rules: {
            all: [
              { contains: { title: 'live' } },
              { any: [{ contains: { artist: 'A' } }] },
            ],
          },
        })}
      />,
    );

    expect(view.getAllByRole('button', { name: 'Duplicate rule' })).toHaveLength(2);
    await user.click(view.getAllByRole('button', { name: 'Duplicate rule' })[0]);
    expect(view.getAllByRole('button', { name: 'Duplicate rule' })).toHaveLength(3);
    expect(view.getAllByDisplayValue('live')).toHaveLength(2);

    await user.click(view.getByRole('button', { name: 'Duplicate group' }));
    expect(view.getAllByRole('button', { name: 'Duplicate group' })).toHaveLength(2);
    expect(view.getAllByDisplayValue('A')).toHaveLength(2);
  });

  it('uses typed number inputs for numeric Advanced rules', () => {
    const view = renderWithProviders(
      <SmartEditorHarness
        editingSmartId="smart-1"
        initialSession={createSmartEditorSession({
          name: 'Plays',
          rules: { any: [{ gt: { playcount: 12 } }] },
        })}
      />,
    );

    expect(view.getByRole('tab', { name: 'Advanced' })).toHaveAttribute('aria-selected', 'true');
    expect(view.getByDisplayValue('12')).toHaveAttribute('type', 'number');
  });

  it('warns about version-gated JSON paths without changing the document', async () => {
    const user = userEvent.setup();
    const view = renderWithProviders(
      <SmartEditorHarness
        editingSmartId="smart-1"
        serverIdentity={{ type: 'navidrome', serverVersion: '0.56.0' }}
        initialSession={createSmartEditorSession({
          name: 'Future',
          rules: {
            all: [{ contains: { title: 'live' } }],
            sort: '-lastplayed,title',
            clientMetadata: { kept: true },
          },
        })}
      />,
    );

    await user.click(view.getByRole('tab', { name: 'JSON' }));
    expect(view.getByText(/Unsupported or unknown paths/)).toBeInTheDocument();
    expect((view.getByLabelText('JSON') as HTMLTextAreaElement).value).toContain('clientMetadata');
  });
});
