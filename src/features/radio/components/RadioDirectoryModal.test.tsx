import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';

const mocks = vi.hoisted(() => ({
  createForServer: vi.fn(),
  fetchUrlBytes: vi.fn(),
  getForServer: vi.fn(),
  getTop: vi.fn(),
  search: vi.fn(),
  uploadBytesForServer: vi.fn(),
}));

vi.mock('@/lib/api/subsonicRadio', () => ({
  createInternetRadioStationForServer: mocks.createForServer,
  fetchUrlBytes: mocks.fetchUrlBytes,
  getInternetRadioStationsForServer: mocks.getForServer,
  getTopRadioStations: mocks.getTop,
  searchRadioBrowser: mocks.search,
  uploadRadioCoverArtBytesForServer: mocks.uploadBytesForServer,
}));

import RadioDirectoryModal from './RadioDirectoryModal';

describe('RadioDirectoryModal owner-scoped creation', () => {
  beforeEach(() => {
    Object.values(mocks).forEach(mock => mock.mockReset());
    mocks.getTop.mockResolvedValue([{
      stationuuid: 'directory-id',
      name: 'Directory Station',
      url: 'https://shared.test/live',
      favicon: 'https://images.test/directory.png',
      tags: '',
    }]);
    mocks.createForServer.mockResolvedValue(undefined);
    mocks.getForServer.mockResolvedValue([
      {
        id: 'existing-id',
        serverId: 'srv-owner',
        name: 'Existing Station',
        streamUrl: 'https://shared.test/live',
      },
      {
        id: 'created-id',
        serverId: 'srv-owner',
        name: 'Directory Station',
        streamUrl: 'https://shared.test/live',
      },
    ]);
    mocks.fetchUrlBytes.mockResolvedValue([[1, 2, 3], 'image/png']);
    mocks.uploadBytesForServer.mockResolvedValue(undefined);
  });

  it('uploads the directory favicon to the station matching both name and stream URL', async () => {
    const onAdded = vi.fn();
    const view = renderWithProviders(
      <RadioDirectoryModal
        targetServerId="srv-owner"
        onMutationStart={vi.fn()}
        onClose={vi.fn()}
        onAdded={onAdded}
      />,
    );

    fireEvent.click(await view.findByText('Directory Station'));

    await waitFor(() => expect(mocks.uploadBytesForServer).toHaveBeenCalledWith(
      'srv-owner',
      'created-id',
      [1, 2, 3],
      'image/png',
    ));
    expect(mocks.uploadBytesForServer).not.toHaveBeenCalledWith(
      'srv-owner',
      'existing-id',
      expect.anything(),
      expect.anything(),
    );
    expect(onAdded).toHaveBeenCalledOnce();
  });
});
