import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { wakeLibraryCoverBackfill } from '@/lib/library/coverBackfillWake';
import { useAuthStore } from '@/store/authStore';
import { useCoverStrategyStore } from '@/store/coverStrategyStore';
import { wakeCoverBackfillForMissingMetadata } from './wakeCoverBackfillForMissingMetadata';

vi.mock('@/lib/library/coverBackfillWake', () => ({
  wakeLibraryCoverBackfill: vi.fn(),
}));

describe('wakeCoverBackfillForMissingMetadata', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.mocked(wakeLibraryCoverBackfill).mockClear();
    useAuthStore.setState({
      activeServerId: 'srv-active',
      servers: [
        { id: 'srv-active', name: 'Active', url: 'https://active.test', username: 'u', password: 'p' },
        { id: 'srv-owner', name: 'Owner', url: 'https://owner.test', username: 'u', password: 'p' },
      ],
    });
    useCoverStrategyStore.setState({ strategy: 'aggressive', strategyByServer: {} });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('wakes the aggressive active-server session', () => {
    wakeCoverBackfillForMissingMetadata('srv-active');
    expect(wakeLibraryCoverBackfill).toHaveBeenCalledOnce();
  });

  it('does not wake the active session for a non-active owner', () => {
    vi.setSystemTime(10_000);
    wakeCoverBackfillForMissingMetadata('srv-owner');
    expect(wakeLibraryCoverBackfill).not.toHaveBeenCalled();
  });

  it('does not wake under the lazy strategy', () => {
    vi.setSystemTime(20_000);
    useCoverStrategyStore.setState({ strategy: 'lazy', strategyByServer: {} });
    wakeCoverBackfillForMissingMetadata('srv-active');
    expect(wakeLibraryCoverBackfill).not.toHaveBeenCalled();
  });
});
