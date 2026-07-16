import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import type { Track } from '@/lib/media/trackTypes';

const resolveAlbum = vi.hoisted(() => vi.fn());
const resolveMediaServerId = vi.hoisted(() => vi.fn((serverId?: string) => serverId ?? null));

vi.mock('@/features/offline', () => ({ resolveAlbum, resolveMediaServerId }));
vi.mock('@/lib/dnd/DragDropContext', () => ({
  registerQueueDragHitTest: () => () => {},
  useDragDrop: () => ({ isDragging: false, startDrag: vi.fn(), payload: null }),
}));

import { useQueuePanelDrag } from './useQueuePanelDrag';

describe('useQueuePanelDrag', () => {
  it('resolves an album against its explicit owner and stamps every resolved track', async () => {
    const aside = document.createElement('aside');
    document.body.appendChild(aside);
    const asideRef = createRef<HTMLElement>();
    asideRef.current = aside;
    const enqueueAt = vi.fn();
    resolveAlbum.mockResolvedValue({
      album: { id: 'album-1' },
      songs: [{
        id: 'song-1',
        title: 'Song',
        artist: 'Artist',
        album: 'Album',
        albumId: 'album-1',
        duration: 100,
        serverId: 'wrong-owner',
      }],
    });

    const { unmount } = renderHook(() => useQueuePanelDrag({
      asideRef,
      isQueueVisible: true,
      reorderQueue: vi.fn(),
      enqueueAt,
      removeTrack: vi.fn(),
    }));

    act(() => {
      aside.dispatchEvent(new CustomEvent('psy-drop', {
        detail: {
          data: JSON.stringify({ type: 'album', id: 'album-1', serverId: 'srv-owner' }),
        },
      }));
    });

    await waitFor(() => expect(enqueueAt).toHaveBeenCalledOnce());
    expect(resolveMediaServerId).toHaveBeenCalledWith('srv-owner');
    expect(resolveAlbum).toHaveBeenCalledWith('srv-owner', 'album-1');
    expect(enqueueAt).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'song-1', serverId: 'srv-owner' }) as Track,
    ], 0);

    unmount();
    aside.remove();
  });
});
