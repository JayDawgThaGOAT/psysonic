import { useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listDeviceDirFiles } from '@/lib/api/syncfs';
import type { TFunction } from 'i18next';
import {
  deviceSyncSourcesFromManifest,
  useDeviceSyncStore,
  type DeviceSyncManifest,
} from '@/features/deviceSync/store/deviceSyncStore';
import { showToast } from '@/lib/dom/toast';

export interface DeviceSyncDeviceScanResult {
  scanDevice: () => Promise<void>;
}

export function useDeviceSyncDeviceScan(
  targetDir: string | null,
  sourcesLength: number,
  driveDetected: boolean,
  ownerServerIndexKey: string | null,
  t: TFunction,
): DeviceSyncDeviceScanResult {
  const setDeviceFilePaths = useDeviceSyncStore.getState().setDeviceFilePaths;
  const setScanning        = useDeviceSyncStore.getState().setScanning;
  const scanRequestRef = useRef(0);

  const scanDevice = useCallback(async () => {
    const requestId = ++scanRequestRef.current;
    if (!targetDir || sourcesLength === 0) {
      setDeviceFilePaths([]);
      setScanning(false);
      return;
    }
    const requestTarget = targetDir;
    setScanning(true);
    try {
      const files = await listDeviceDirFiles({ dir: requestTarget });
      if (
        scanRequestRef.current === requestId &&
        useDeviceSyncStore.getState().targetDir === requestTarget
      ) setDeviceFilePaths(files);
    } catch {
      if (
        scanRequestRef.current === requestId &&
        useDeviceSyncStore.getState().targetDir === requestTarget
      ) setDeviceFilePaths([]);
    } finally {
      if (
        scanRequestRef.current === requestId &&
        useDeviceSyncStore.getState().targetDir === requestTarget
      ) setScanning(false);
    }
  }, [targetDir, sourcesLength, setDeviceFilePaths, setScanning]);

  // Scan device on mount and when targetDir changes
  useEffect(() => { scanDevice(); }, [scanDevice]);

  // Auto-import manifest when page loads and drive is already connected
  const manifestImportedTargetRef = useRef<string | null>(null);
  useEffect(() => {
    if (!targetDir || !driveDetected || manifestImportedTargetRef.current === targetDir) return;
    const requestTarget = targetDir;
    manifestImportedTargetRef.current = requestTarget;
    invoke<DeviceSyncManifest | null>(
      'read_device_manifest', { destDir: targetDir }
    ).then(manifest => {
      if (useDeviceSyncStore.getState().targetDir !== requestTarget) return;
      const manifestSources = deviceSyncSourcesFromManifest(manifest, ownerServerIndexKey);
      if (manifestSources.length > 0) {
        useDeviceSyncStore.getState().clearSources();
        manifestSources.forEach(s => useDeviceSyncStore.getState().addSource(s));
        showToast(t('deviceSync.manifestImported', { count: manifestSources.length }), 4000, 'info');
      }
    }).catch(() => {});
  }, [targetDir, driveDetected, ownerServerIndexKey, t]);

  // Clear device file list and reset import flag when stick is unplugged
  useEffect(() => {
    if (!driveDetected) {
      setDeviceFilePaths([]);
      manifestImportedTargetRef.current = null;
    }
  }, [driveDetected, setDeviceFilePaths]);

  return { scanDevice };
}
