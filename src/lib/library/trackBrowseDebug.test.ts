import { beforeEach, describe, expect, it } from 'vitest';
import { setPsyLabDebugTrace } from '@/lib/perf/psyLabDebugTraces';
import {
  beginTrackBrowseTrace,
  emitTrackBrowseDebug,
  formatTrackBrowseTraceReport,
  getTrackBrowseTraceSnapshot,
} from './trackBrowseDebug';

describe('trackBrowseDebug', () => {
  beforeEach(() => {
    setPsyLabDebugTrace('tracksBrowse', false);
  });

  it('retains a copyable timeline when the Tracks trace is enabled', () => {
    setPsyLabDebugTrace('tracksBrowse', true);
    beginTrackBrowseTrace({ serverId: 'srv' });
    emitTrackBrowseDebug('scope_browse_done', { stepMs: 42, songCount: 50 });

    expect(getTrackBrowseTraceSnapshot()).toEqual([
      expect.objectContaining({ step: 'session_start', details: { serverId: 'srv' } }),
      expect.objectContaining({
        step: 'scope_browse_done',
        details: { stepMs: 42, songCount: 50 },
      }),
    ]);
    expect(formatTrackBrowseTraceReport({ route: '/tracks' })).toContain(
      'step: scope_browse_done',
    );
  });
});
