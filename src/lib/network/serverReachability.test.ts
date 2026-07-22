import { beforeEach, describe, expect, it } from 'vitest';
import {
  getActiveServerReachable,
  getConnectionStatus,
  resetActiveServerConnectionSnapshot,
} from './activeServerReachability';
import {
  getServerReachabilitySnapshot,
  publishServerConnectionStatus,
  resetServerReachabilitySnapshot,
} from './serverReachability';

beforeEach(() => {
  resetServerReachabilitySnapshot();
  resetActiveServerConnectionSnapshot();
});

describe('publishServerConnectionStatus', () => {
  it('updates profile and active-server status immediately', () => {
    publishServerConnectionStatus('a', 'online', true);
    expect(getServerReachabilitySnapshot().get('a')).toBe('available');
    expect(getActiveServerReachable()).toBe(true);
    expect(getConnectionStatus()).toBe('connected');

    publishServerConnectionStatus('a', 'offline', true);
    expect(getServerReachabilitySnapshot().get('a')).toBe('unavailable');
    expect(getActiveServerReachable()).toBe(false);
    expect(getConnectionStatus()).toBe('disconnected');
  });

  it('does not overwrite active-server status for another profile', () => {
    publishServerConnectionStatus('b', 'online');
    expect(getServerReachabilitySnapshot().get('b')).toBe('available');
    expect(getActiveServerReachable()).toBeNull();
    expect(getConnectionStatus()).toBe('checking');
  });
});
