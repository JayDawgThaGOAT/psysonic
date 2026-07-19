import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, waitFor } from '@testing-library/react';
import type { InternetRadioStation } from '@/lib/api/subsonicTypes';

const hoisted = vi.hoisted(() => ({
  getSettled: vi.fn(),
  getForServer: vi.fn(),
  createForServer: vi.fn(),
  updateForServer: vi.fn(),
  deleteForServer: vi.fn(),
  uploadCoverForServer: vi.fn(),
  deleteCoverForServer: vi.fn(),
  playRadio: vi.fn(),
  stop: vi.fn(),
  playerState: {
    currentRadio: null as InternetRadioStation | null,
    isPlaying: false,
    volume: 1,
  },
}));

vi.mock('@/lib/api/subsonicRadio', () => ({
  getInternetRadioStationsForServersSettled: hoisted.getSettled,
  getInternetRadioStationsForServer: hoisted.getForServer,
  createInternetRadioStationForServer: hoisted.createForServer,
  updateInternetRadioStationForServer: hoisted.updateForServer,
  deleteInternetRadioStationForServer: hoisted.deleteForServer,
  uploadRadioCoverArtForServer: hoisted.uploadCoverForServer,
  deleteRadioCoverArtForServer: hoisted.deleteCoverForServer,
}));

vi.mock('@/features/playback/store/playerStore', () => {
  const usePlayerStore = Object.assign(
    (selector: (state: unknown) => unknown) => selector({
      ...hoisted.playerState,
      playRadio: hoisted.playRadio,
      stop: hoisted.stop,
    }),
    {
      getState: () => ({ ...hoisted.playerState, stop: hoisted.stop }),
    },
  );
  return { usePlayerStore };
});

vi.mock('@/features/playback/store/radioPlayer', () => ({ setRadioVolume: vi.fn() }));
vi.mock('@/features/playback/utils/playback/fadeOut', () => ({ fadeOut: vi.fn() }));
vi.mock('@/cover/radioCoverInvalidation', () => ({ invalidateRadioCoverArtCache: vi.fn() }));
vi.mock('@/lib/perf/perfFlags', () => ({
  usePerfProbeFlags: () => ({ disableMainstageVirtualLists: true }),
}));
vi.mock('@/lib/hooks/useNavidromeAdminRole', () => ({
  canManageNavidromeRadio: (role: string) => role !== 'user',
  useNavidromeAdminRoles: (serverIds: string[]) => Object.fromEntries(
    serverIds.map(serverId => [serverId, 'admin']),
  ),
}));
vi.mock('@/features/radio/components/RadioToolbar', () => ({ default: () => null }));
vi.mock('@/features/radio/components/AlphabetFilterBar', () => ({ default: () => null }));
vi.mock('@/features/radio/components/RadioCard', () => ({
  default: ({
    s,
    serverLabel,
    onDelete,
  }: {
    s: InternetRadioStation;
    serverLabel?: string;
    onDelete: (event: React.MouseEvent) => void;
  }) => (
    <div data-testid={`station-${s.serverId}-${s.id}`}>
      <span>{s.name}</span>
      {serverLabel && <span>{serverLabel}</span>}
      <button onClick={onDelete}>delete {s.serverId}</button>
    </div>
  ),
}));
vi.mock('@/features/radio/components/RadioEditModal', () => ({
  default: ({ onSave }: {
    onSave: (options: {
      name: string;
      streamUrl: string;
      homepageUrl: string;
      coverFile: File | null;
      coverRemoved: boolean;
    }) => Promise<void>;
  }) => (
    <button onClick={() => void onSave({
      name: 'Created',
      streamUrl: 'https://created.test/live',
      homepageUrl: '',
      coverFile: null,
      coverRemoved: false,
    })}>save station</button>
  ),
}));
vi.mock('@/features/radio/components/RadioDirectoryModal', () => ({ default: () => null }));
vi.mock('@/ui/VirtualCardGrid', () => ({
  VirtualCardGrid: ({
    items,
    renderItem,
  }: {
    items: InternetRadioStation[];
    renderItem: (item: InternetRadioStation) => React.ReactNode;
  }) => <>{items.map(item => <React.Fragment key={`${item.serverId}:${item.id}`}>{renderItem(item)}</React.Fragment>)}</>,
}));

import InternetRadio from './InternetRadio';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAuthStore } from '@/test/helpers/storeReset';
import { useAuthStore } from '@/store/authStore';

const DUPLICATE_STATIONS: InternetRadioStation[] = [
  { id: 'shared', serverId: 'srv-a', name: 'Alpha Radio', streamUrl: 'https://a.test/live' },
  { id: 'shared', serverId: 'srv-b', name: 'Beta Radio', streamUrl: 'https://b.test/live' },
];

describe('InternetRadio multi-server ownership', () => {
  beforeEach(() => {
    resetAuthStore();
    localStorage.clear();
    Object.values(hoisted).forEach(value => {
      if (typeof value === 'function' && 'mockReset' in value) value.mockReset();
    });
    hoisted.playerState.currentRadio = null;
    hoisted.playerState.isPlaying = false;
    useAuthStore.setState({
      isLoggedIn: true,
      servers: [
        { id: 'srv-a', name: 'Home', url: 'https://a.test', username: 'a', password: 'p' },
        { id: 'srv-b', name: 'Remote', url: 'https://b.test', username: 'b', password: 'p' },
      ],
      activeServerId: 'srv-a',
      libraryBrowseServerIds: ['srv-a', 'srv-b'],
    });
    hoisted.getSettled.mockResolvedValue({ stations: DUPLICATE_STATIONS, failedServerIds: [] });
    hoisted.getForServer.mockImplementation(async (serverId: string) => (
      DUPLICATE_STATIONS.filter(station => station.serverId === serverId)
    ));
    hoisted.createForServer.mockResolvedValue(undefined);
    hoisted.deleteForServer.mockResolvedValue(undefined);
  });

  it('renders duplicate raw ids as distinct stations with source labels and owner-routed delete', async () => {
    const view = renderWithProviders(<InternetRadio />);

    expect(await view.findByTestId('station-srv-a-shared')).toHaveTextContent('Home');
    expect(view.getByTestId('station-srv-b-shared')).toHaveTextContent('Remote');
    expect(hoisted.getSettled).toHaveBeenCalledWith(['srv-a', 'srv-b']);

    fireEvent.click(view.getByRole('button', { name: 'delete srv-b' }));
    fireEvent.click(view.getByRole('button', { name: 'delete srv-b' }));

    await waitFor(() => expect(hoisted.deleteForServer).toHaveBeenCalledWith('srv-b', 'shared'));
    expect(view.getByTestId('station-srv-a-shared')).toBeInTheDocument();
    expect(view.queryByTestId('station-srv-b-shared')).not.toBeInTheDocument();
  });

  it('creates on the explicitly selected target server', async () => {
    const view = renderWithProviders(<InternetRadio />);
    await view.findByTestId('station-srv-a-shared');

    fireEvent.change(view.getByRole('combobox', { name: 'Servers' }), {
      target: { value: 'srv-b' },
    });
    fireEvent.click(view.getByRole('button', { name: /add station/i }));
    fireEvent.change(view.getByRole('combobox', { name: 'Servers' }), {
      target: { value: 'srv-a' },
    });
    fireEvent.click(view.getByRole('button', { name: 'save station' }));

    await waitFor(() => expect(hoisted.createForServer).toHaveBeenCalledWith(
      'srv-b',
      'Created',
      'https://created.test/live',
      undefined,
    ));
  });

  it('retains the previous owner slice when one selected server refresh fails', async () => {
    hoisted.getSettled
      .mockResolvedValueOnce({ stations: DUPLICATE_STATIONS, failedServerIds: [] })
      .mockResolvedValueOnce({ stations: [DUPLICATE_STATIONS[0]], failedServerIds: ['srv-b'] });
    const view = renderWithProviders(<InternetRadio />);
    expect(await view.findByTestId('station-srv-b-shared')).toBeInTheDocument();

    act(() => {
      useAuthStore.setState(state => ({
        servers: state.servers.map(server => server.id === 'srv-a'
          ? { ...server, name: 'Home updated' }
          : server),
      }));
    });

    await waitFor(() => expect(hoisted.getSettled).toHaveBeenCalledTimes(2));
    expect(view.getByTestId('station-srv-b-shared')).toBeInTheDocument();
  });

  it('does not restore a deleted station from an older aggregate refresh', async () => {
    let resolveRefresh: ((value: {
      stations: InternetRadioStation[];
      failedServerIds: string[];
    }) => void) | undefined;
    let resolveDelete: (() => void) | undefined;
    hoisted.deleteForServer.mockImplementationOnce(() => new Promise<void>(resolve => {
      resolveDelete = resolve;
    }));
    const view = renderWithProviders(<InternetRadio />);
    expect(await view.findByTestId('station-srv-b-shared')).toBeInTheDocument();
    fireEvent.click(view.getByRole('button', { name: 'delete srv-b' }));
    fireEvent.click(view.getByRole('button', { name: 'delete srv-b' }));
    await waitFor(() => expect(hoisted.deleteForServer).toHaveBeenCalledWith('srv-b', 'shared'));
    hoisted.getSettled.mockImplementationOnce(() => new Promise(resolve => {
      resolveRefresh = resolve;
    }));

    act(() => {
      useAuthStore.setState(state => ({ servers: [...state.servers] }));
    });
    await waitFor(() => expect(hoisted.getSettled).toHaveBeenCalledTimes(2));
    act(() => resolveDelete?.());
    act(() => resolveRefresh?.({ stations: DUPLICATE_STATIONS, failedServerIds: [] }));
    await view.findByTestId('station-srv-a-shared');
    expect(view.queryByTestId('station-srv-b-shared')).not.toBeInTheDocument();
  });
});
