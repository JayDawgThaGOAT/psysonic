import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlayQueueSyncLedState } from '@/app/hooks/usePlayQueueSyncLedState';
import {
  _resetQueueSyncUiForTest,
  markQueueHandoffPending,
} from '@/features/playback/store/queueSyncUiState';
import { usePlayerStore } from '@/features/playback/store/playerStore';
import { useAuthStore } from '@/store/authStore';
import { resetAllStores } from '@/test/helpers/storeReset';

const pullPlayQueueFromActiveServerMock = vi.fn();

vi.mock('@/features/playback/store/applyServerPlayQueue', () => ({
  pullPlayQueueFromActiveServer: () => pullPlayQueueFromActiveServerMock(),
}));

describe('usePlayQueueSyncLedState', () => {
  beforeEach(() => {
    resetAllStores();
    _resetQueueSyncUiForTest();
    pullPlayQueueFromActiveServerMock.mockReset();
    useAuthStore.setState({
      servers: [
        { id: 'a', name: 'A', url: 'http://a.test', username: 'u', password: 'p' },
        { id: 'b', name: 'B', url: 'http://b.test', username: 'u', password: 'p' },
      ],
      activeServerId: 'a',
    });
  });

  it('does not show or execute a browse/playback handoff for a mixed queue', async () => {
    usePlayerStore.setState({
      queueItems: [
        { serverId: 'a', trackId: 'a1' },
        { serverId: 'b', trackId: 'b1' },
        { serverId: 'a', trackId: 'a2' },
      ],
      queueIndex: 1,
      currentTrack: { id: 'b1', title: 'b1', artist: '', album: '', albumId: '', duration: 60, serverId: 'b' },
    });
    markQueueHandoffPending();

    const { result } = renderHook(() => usePlayQueueSyncLedState('connected'));

    expect(result.current.ledVariant).toBe('connected');
    expect(result.current.needsQueuePull).toBe(false);
    expect(result.current.queueHandoffReason).toBe(false);
    expect(result.current.syncRingVisible).toBe(false);

    await act(() => result.current.pullFromActiveServer());
    expect(pullPlayQueueFromActiveServerMock).not.toHaveBeenCalled();
  });
});
