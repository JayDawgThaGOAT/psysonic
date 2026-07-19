import { beforeEach, describe, expect, it } from 'vitest';
import type { SyncStateDto } from '@/lib/api/library';
import { onInvoke } from '@/test/mocks/tauri';
import { resetAuthStore } from '@/test/helpers/storeReset';
import { useAuthStore } from '@/store/authStore';
import { useLibraryIndexStore } from '@/store/libraryIndexStore';
import {
  libraryStatusIsReady,
  readyLibraryServerKeys,
  syncIngestDisplayCount,
} from './libraryReady';

const status = (over: Partial<SyncStateDto>): SyncStateDto => ({
  serverId: 's1',
  libraryScope: '',
  syncPhase: 'idle',
  capabilityFlags: 0,
  libraryTier: 'unknown',
  ...over,
});

describe('libraryStatusIsReady', () => {
  it('accepts ready', () => {
    expect(libraryStatusIsReady(status({ syncPhase: 'ready' }))).toBe(true);
  });

  it('rejects initial_sync even at 95% coverage', () => {
    expect(
      libraryStatusIsReady(
        status({ syncPhase: 'initial_sync', localTrackCount: 950, serverTrackCount: 1000 }),
      ),
    ).toBe(false);
  });

  it('accepts idle after a completed full sync (legacy bind clobber)', () => {
    expect(
      libraryStatusIsReady(
        status({ syncPhase: 'idle', localTrackCount: 100, lastFullSyncAt: 1 }),
      ),
    ).toBe(true);
  });

  it('accepts idle with lastFullSyncAt even when count snapshot is stale', () => {
    expect(
      libraryStatusIsReady(
        status({ syncPhase: 'idle', localTrackCount: 0, lastFullSyncAt: 1 }),
      ),
    ).toBe(true);
  });

  it('accepts idle when tracks exist (localTracksMaxUpdatedMs)', () => {
    expect(
      libraryStatusIsReady(
        status({ syncPhase: 'idle', localTracksMaxUpdatedMs: 42 }),
      ),
    ).toBe(true);
  });

  it('accepts idle when hasLocalTracks is set', () => {
    expect(
      libraryStatusIsReady(
        status({ syncPhase: 'idle', hasLocalTracks: true, localTrackCount: 0 }),
      ),
    ).toBe(true);
  });

  it('accepts empty syncPhase when hasLocalTracks is set (no sync_state row)', () => {
    expect(
      libraryStatusIsReady(
        status({ syncPhase: '', hasLocalTracks: true, localTrackCount: 0 }),
      ),
    ).toBe(true);
  });

  it('rejects idle without a prior full sync', () => {
    expect(libraryStatusIsReady(status({ syncPhase: 'idle', localTrackCount: 0 }))).toBe(false);
  });
});

describe('readyLibraryServerKeys', () => {
  beforeEach(() => {
    resetAuthStore();
    useLibraryIndexStore.setState({ masterEnabled: true });
    useAuthStore.setState({
      servers: [
        { id: 'a', name: 'A', url: 'https://a.test/rest', username: 'u', password: 'p' },
        { id: 'b', name: 'B', url: 'https://b.test', username: 'u', password: 'p' },
      ],
    });
  });

  it('returns URL-derived keys only when every server is ready', async () => {
    const statusKeys: string[] = [];
    onInvoke('library_get_status', args => {
      const serverId = (args as { serverId: string }).serverId;
      statusKeys.push(serverId);
      return status({ serverId, syncPhase: 'ready' });
    });

    await expect(readyLibraryServerKeys(['a', 'b'])).resolves.toEqual([
      'a.test/rest',
      'b.test',
    ]);
    expect(statusKeys).toEqual(['a.test/rest', 'b.test']);
  });

  it('declines the complete scope when one server is still syncing', async () => {
    onInvoke('library_get_status', args => {
      const serverId = (args as { serverId: string }).serverId;
      return status({
        serverId,
        syncPhase: serverId === 'b.test' ? 'initial_sync' : 'ready',
      });
    });

    await expect(readyLibraryServerKeys(['a', 'b'])).resolves.toBeNull();
  });
});

describe('syncIngestDisplayCount', () => {
  it('prefers the highest of live db count, cursor, and event total', () => {
    expect(
      syncIngestDisplayCount(
        { localTrackCount: 69_500, cursorIngestedCount: 68_000 },
        67_000,
      ),
    ).toBe(69_500);
    expect(
      syncIngestDisplayCount(
        { localTrackCount: 1_000, cursorIngestedCount: 8_000 },
        7_500,
      ),
    ).toBe(8_000);
  });
});
