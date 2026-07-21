import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAuthStore } from '@/test/helpers/storeReset';
import { makeServer } from '@/test/helpers/factories';
import { useAuthStore } from '@/store/authStore';

const mocks = vi.hoisted(() => ({
  startOrbitSession: vi.fn(),
}));

vi.mock('@/features/orbit/utils/orbit', () => ({
  buildOrbitShareLink: (serverBase: string, sid: string) => `psysonic2-orbit:${serverBase}:${sid}`,
  generateSessionId: () => 'session-id',
  startOrbitSession: mocks.startOrbitSession,
}));
vi.mock('@/features/orbit/utils/orbitNames', () => ({
  randomOrbitSessionName: () => 'Test Orbit',
}));

import OrbitStartModal from '@/features/orbit/components/OrbitStartModal';

beforeEach(() => {
  resetAuthStore();
  mocks.startOrbitSession.mockReset().mockResolvedValue({});
  const first = makeServer({ id: 'srv-a', name: 'Server A', url: 'https://a.example' });
  const second = makeServer({ id: 'srv-b', name: 'Server B', url: 'https://b.example' });
  useAuthStore.setState({
    servers: [first, second],
    activeServerId: first.id,
    libraryBrowseServerIds: [first.id, second.id],
  });
});

describe('OrbitStartModal', () => {
  it('starts Orbit on the server selected from the current library scope', async () => {
    const user = userEvent.setup();
    renderWithProviders(<OrbitStartModal onClose={vi.fn()} />);

    await user.click(screen.getByRole('radio', { name: 'Server B' }));
    await user.click(screen.getByRole('button', { name: 'Copy link & start' }));

    expect(mocks.startOrbitSession).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Test Orbit',
      sid: 'session-id',
      serverId: 'srv-b',
      clearQueue: false,
    }));
  });
});
