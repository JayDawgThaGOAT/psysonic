import { create } from 'zustand';
import type { DeviceSyncSource } from './deviceSyncStore';

export interface DeviceSyncJobContext {
  targetDir: string;
  serverIndexKey: string;
  sources: DeviceSyncSource[];
}

export interface DeviceSyncJobState {
  jobId: string | null;
  total: number;
  done: number;
  skipped: number;
  failed: number;
  status: 'idle' | 'running' | 'done' | 'cancelled';
  context: DeviceSyncJobContext | null;

  startSync: (jobId: string, total: number, context: DeviceSyncJobContext) => void;
  updateProgress: (done: number, skipped: number, failed: number) => void;
  complete: (done: number, skipped: number, failed: number) => void;
  cancel: () => void;
  reset: () => void;
}

export const useDeviceSyncJobStore = create<DeviceSyncJobState>()((set) => ({
  jobId: null,
  total: 0,
  done: 0,
  skipped: 0,
  failed: 0,
  status: 'idle',
  context: null,

  startSync: (jobId, total, context) =>
    set({ jobId, total, done: 0, skipped: 0, failed: 0, status: 'running', context }),

  updateProgress: (done, skipped, failed) =>
    set({ done, skipped, failed }),

  complete: (done, skipped, failed) =>
    set({ done, skipped, failed, status: 'done' }),

  cancel: () =>
    set({ status: 'cancelled' }),

  reset: () =>
    set({ jobId: null, total: 0, done: 0, skipped: 0, failed: 0, status: 'idle', context: null }),
}));
