import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import PlaylistsSmartFieldPicker from '@/features/playlist/components/PlaylistsSmartFieldPicker';
import { resolveSmartPlaylistCapabilities } from '@/features/playlist/utils/smartPlaylistFields';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';

describe('PlaylistsSmartFieldPicker', () => {
  it('filters the field list as the user types', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const view = renderWithProviders(
      <PlaylistsSmartFieldPicker
        value="title"
        capabilities={resolveSmartPlaylistCapabilities('0.63.2')}
        customFields={[]}
        onChange={onChange}
      />,
    );

    const input = view.getByRole('combobox', { name: 'Field' });
    await user.click(input);
    await user.type(input, 'mood');
    expect(view.getByRole('option', { name: 'Mood' })).toBeInTheDocument();
    expect(view.queryByRole('option', { name: 'Title' })).not.toBeInTheDocument();

    await user.click(view.getByRole('option', { name: /mood/i }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ name: 'mood' }));
  });
});
