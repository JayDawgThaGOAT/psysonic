import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LOCAL_READ_SINGLE_FLIGHT_RETENTION_MS,
  resetLibraryLocalReadSingleFlightsForTests,
  runLibraryLocalReadSingleFlight,
  StaleLibraryLocalReadError,
} from './localReadSingleFlight';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => { resolve = res; });
  return { promise, resolve };
}

describe('runLibraryLocalReadSingleFlight', () => {
  beforeEach(() => {
    vi.useRealTimers();
    resetLibraryLocalReadSingleFlightsForTests();
  });

  it('evicts hung reads and prevents their late results from publishing', async () => {
    vi.useFakeTimers();
    const oldSource = deferred<string>();
    const applied: string[] = [];
    const oldFlight = runLibraryLocalReadSingleFlight('scope-revision', () => oldSource.promise);
    void oldFlight.then(value => applied.push(value), () => undefined);

    await vi.advanceTimersByTimeAsync(LOCAL_READ_SINGLE_FLIGHT_RETENTION_MS);
    await expect(oldFlight).rejects.toBeInstanceOf(StaleLibraryLocalReadError);

    const freshFlight = runLibraryLocalReadSingleFlight('scope-revision', async () => 'fresh');
    await expect(freshFlight).resolves.toBe('fresh');
    applied.push(await freshFlight);

    oldSource.resolve('stale');
    await Promise.resolve();
    expect(applied).toEqual(['fresh']);
    vi.useRealTimers();
  });
});
