import { act, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SavePlaylistModal } from '@/features/queue/components/SavePlaylistModal';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';

describe('SavePlaylistModal', () => {
  it('allows only one create request while saving', async () => {
    let resolveSave!: () => void;
    const onSave = vi.fn(() => new Promise<void>(resolve => { resolveSave = resolve; }));
    const { getByPlaceholderText, getByRole } = renderWithProviders(
      <SavePlaylistModal
        onClose={vi.fn()}
        onSave={onSave}
        serverOptions={[{ id: 'server-a', label: 'Server A' }]}
        initialServerId="server-a"
      />,
    );
    const input = getByPlaceholderText('Playlist Name');
    const save = getByRole('button', { name: 'Save' });
    fireEvent.change(input, { target: { value: 'Queue mix' } });

    fireEvent.click(save);
    fireEvent.click(save);
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSave).toHaveBeenCalledOnce();
    expect(save).toBeDisabled();
    await act(async () => {
      resolveSave();
      await Promise.resolve();
    });
  });
});
