export const LOCAL_READ_SINGLE_FLIGHT_RETENTION_MS = 30_000;
const MAX_LOCAL_READ_SINGLE_FLIGHTS = 32;

export class StaleLibraryLocalReadError extends Error {
  constructor() {
    super('local library read was evicted');
    this.name = 'StaleLibraryLocalReadError';
  }
}

interface LocalReadFlight {
  promise: Promise<unknown>;
  reject: (error: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

const localReadFlights = new Map<string, LocalReadFlight>();

function evictLocalReadFlight(key: string, flight: LocalReadFlight): void {
  if (localReadFlights.get(key) !== flight) return;
  localReadFlights.delete(key);
  clearTimeout(flight.timer);
  flight.reject(new StaleLibraryLocalReadError());
}

/** Reuse an uncancellable local read until its native invoke actually settles. */
export function runLibraryLocalReadSingleFlight<T>(
  key: string,
  start: () => Promise<T>,
): Promise<T> {
  const existing = localReadFlights.get(key);
  if (existing) return existing.promise as Promise<T>;

  while (localReadFlights.size >= MAX_LOCAL_READ_SINGLE_FLIGHTS) {
    const oldest = localReadFlights.entries().next().value as [string, LocalReadFlight] | undefined;
    if (!oldest) break;
    evictLocalReadFlight(oldest[0], oldest[1]);
  }

  const source = Promise.resolve().then(start);
  let resolveFlight!: (value: T) => void;
  let rejectFlight!: (error: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolveFlight = resolve;
    rejectFlight = reject;
  });
  const flight: LocalReadFlight = {
    promise,
    reject: rejectFlight,
    timer: setTimeout(() => evictLocalReadFlight(key, flight), LOCAL_READ_SINGLE_FLIGHT_RETENTION_MS),
  };
  localReadFlights.set(key, flight);
  void source.then(
    value => {
      if (localReadFlights.get(key) !== flight) return;
      localReadFlights.delete(key);
      clearTimeout(flight.timer);
      resolveFlight(value);
    },
    error => {
      if (localReadFlights.get(key) !== flight) return;
      localReadFlights.delete(key);
      clearTimeout(flight.timer);
      rejectFlight(error);
    },
  );
  return promise;
}

export function resetLibraryLocalReadSingleFlightsForTests(): void {
  for (const [key, flight] of localReadFlights) evictLocalReadFlight(key, flight);
}
