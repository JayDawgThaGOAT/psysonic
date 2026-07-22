import { beforeEach, describe, expect, it } from 'vitest';
import { onInvoke } from '@/test/mocks/tauri';
import { useAuthStore } from '@/store/authStore';
import { setPsyLabDebugTrace } from '@/lib/perf/psyLabDebugTraces';
import {
  beginFavoritesBrowseTrace,
  emitFavoritesBrowseDebug,
  formatFavoritesBrowseTraceReport,
} from './favoritesBrowseDebug';

describe('favoritesBrowseDebug', () => {
  beforeEach(() => {
    useAuthStore.setState({ loggingMode: 'normal' });
    setPsyLabDebugTrace('favoritesBrowse', false);
  });

  it('records a copyable trace when the PsyLab toggle is enabled', () => {
    setPsyLabDebugTrace('favoritesBrowse', true);
    beginFavoritesBrowseTrace({ offline: false });
    emitFavoritesBrowseDebug('server_starred_done', { songCount: 3 });

    expect(formatFavoritesBrowseTraceReport({ route: '/favorites' })).toContain(
      'step: server_starred_done',
    );
  });

  it('forwards JSON to frontend_debug_log in debug mode', () => {
    useAuthStore.setState({ loggingMode: 'debug' });
    setPsyLabDebugTrace('favoritesBrowse', true);
    let captured: unknown;
    onInvoke('frontend_debug_log', args => {
      captured = args;
      return undefined;
    });
    emitFavoritesBrowseDebug('render_ready');

    expect(captured).toEqual({
      scope: 'favorites-browse',
      message: expect.stringContaining('"step":"render_ready"'),
    });
  });
});
