import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAuthStore } from '@/test/helpers/storeReset';
import { useAuthStore } from '@/store/authStore';
import { DragDropProvider } from '@/lib/dnd/DragDropContext';
import ConnectionIndicator from './ConnectionIndicator';
import { setServerReachability } from '@/lib/network/serverReachability';

const switchActiveServerMock = vi.fn();

vi.mock('@/utils/server/switchActiveServer', () => ({
  switchActiveServer: (...args: unknown[]) => switchActiveServerMock(...args),
}));

vi.mock('@/app/hooks/usePlayQueueSyncLedState', () => ({
  usePlayQueueSyncLedState: () => ({
    ledVariant: 'connected',
    localQueueSyncPaused: false,
    queueHandoffReason: null,
    pullInFlight: false,
    syncRingVisible: false,
    pullFromActiveServer: vi.fn(),
  }),
}));

function setupServers() {
  const a = useAuthStore.getState().addServer({
    name: 'Home', url: 'https://home.test', username: 'u', password: 'p',
  });
  const b = useAuthStore.getState().addServer({
    name: 'Remote', url: 'https://remote.test', username: 'u', password: 'p',
  });
  useAuthStore.setState({ activeServerId: a, libraryBrowseServerIds: [a] });
  return { a, b };
}

function renderIndicator() {
  renderWithProviders(
    <DragDropProvider>
      <ConnectionIndicator status="connected" isLan={false} serverName="Home" />
    </DragDropProvider>,
  );
}

beforeEach(() => {
  resetAuthStore();
  switchActiveServerMock.mockReset();
  switchActiveServerMock.mockResolvedValue(true);
});

describe('ConnectionIndicator Library server selection', () => {
  it('uses checkbox selection additively and shows the multi-server badge', async () => {
    const user = userEvent.setup();
    setupServers();
    renderIndicator();

    await user.click(screen.getByText('Home'));
    await user.click(screen.getByRole('button', { name: /Include Remote.*Library scope/i }));

    expect(useAuthStore.getState().libraryBrowseServerIds).toHaveLength(2);
    expect(screen.getByText('Multi-server')).toBeInTheDocument();
    expect(screen.getByText('2 servers')).toBeInTheDocument();
    expect(switchActiveServerMock).not.toHaveBeenCalled();
    expect(screen.getByRole('menuitem', { name: 'Home' }).querySelector('.nav-library-dropdown-check')).toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Home' }).closest('.nav-library-dropdown-item')).toHaveClass(
      'nav-library-dropdown-item--selected',
    );
    expect(screen.getByRole('menuitem', { name: 'Remote' }).closest('.nav-library-dropdown-item')).toHaveClass(
      'nav-library-dropdown-item--selected',
    );
  });

  it('clicking the server row switches active server and makes Library exclusive', async () => {
    const user = userEvent.setup();
    const { a, b } = setupServers();
    useAuthStore.setState({ libraryBrowseServerIds: [a, b] });
    renderIndicator();

    await user.click(screen.getByText('2 servers'));
    await user.click(screen.getByRole('menuitem', { name: 'Remote' }));

    expect(switchActiveServerMock).toHaveBeenCalledWith(expect.objectContaining({ id: b }));
    expect(useAuthStore.getState().libraryBrowseServerIds).toEqual([b]);
  });

  it('crosses out the selected count while an unavailable server is outside the effective scope', () => {
    const { a, b } = setupServers();
    useAuthStore.setState({ libraryBrowseServerIds: [a, b] });
    setServerReachability(b, 'unavailable');

    renderIndicator();

    expect(screen.getByText('2 servers').tagName).toBe('DEL');
    expect(screen.getByText('1 servers')).toBeInTheDocument();
    expect(useAuthStore.getState().libraryBrowseServerIds).toEqual([a, b]);

    act(() => setServerReachability(b, 'available'));

    expect(screen.getByText('2 servers').tagName).toBe('SPAN');
    expect(screen.queryByText('1 servers')).not.toBeInTheDocument();
  });
});
