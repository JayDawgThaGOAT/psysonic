import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useRangeSelection } from './useRangeSelection';
import { ownedEntityKey } from '@/lib/util/ownedEntityKey';

describe('useRangeSelection', () => {
  it('uses the supplied owner-aware key for toggles and ranges', () => {
    const items = [
      { id: 'shared', serverId: 'server-a' },
      { id: 'shared', serverId: 'server-b' },
      { id: 'third', serverId: 'server-b' },
    ];
    const { result } = renderHook(() => useRangeSelection(items, ownedEntityKey));

    act(() => result.current.toggleSelect('server-a:shared'));
    act(() => result.current.toggleSelect('server-b:third', { shiftKey: true }));

    expect([...result.current.selectedIds]).toEqual([
      'server-a:shared',
      'server-b:shared',
      'server-b:third',
    ]);
  });
});
