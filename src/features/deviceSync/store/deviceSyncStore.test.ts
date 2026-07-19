import { beforeEach, describe, expect, it } from 'vitest';
import {
  deviceSyncOwnerKey,
  deviceSyncSourceKey,
  deviceSyncSourcesFromManifest,
  useDeviceSyncStore,
  type DeviceSyncSource,
} from './deviceSyncStore';

const sourceA: DeviceSyncSource = {
  type: 'album',
  id: 'shared-id',
  name: 'Album A',
  serverIndexKey: 'server-a.test',
};

const sourceB: DeviceSyncSource = {
  ...sourceA,
  name: 'Album B',
  serverIndexKey: 'server-b.test',
};

describe('deviceSyncStore ownership', () => {
  beforeEach(() => {
    useDeviceSyncStore.setState({
      targetDir: null,
      sources: [],
      checkedIds: [],
      pendingDeletion: [],
      deviceFilePaths: [],
      scanning: false,
    });
  });

  it('qualifies colliding raw IDs by server and source type', () => {
    expect(deviceSyncSourceKey(sourceA)).not.toBe(deviceSyncSourceKey(sourceB));
    expect(deviceSyncSourceKey(sourceA)).not.toBe(deviceSyncSourceKey({
      ...sourceA,
      type: 'playlist',
    }));
  });

  it('keeps one durable owner per device configuration', () => {
    useDeviceSyncStore.getState().addSource(sourceA);
    useDeviceSyncStore.getState().addSource(sourceB);

    expect(useDeviceSyncStore.getState().sources).toEqual([sourceA]);
    expect(deviceSyncOwnerKey(useDeviceSyncStore.getState().sources)).toBe(sourceA.serverIndexKey);
  });

  it('imports only owner-qualified manifests with a matching manifest owner', () => {
    expect(deviceSyncSourcesFromManifest({
      version: 3,
      ownerServerIndexKey: sourceA.serverIndexKey,
      sources: [sourceA],
    })).toEqual([sourceA]);

    expect(deviceSyncSourcesFromManifest({
      version: 2,
      sources: [{ type: 'album', id: 'legacy', name: 'Legacy' }],
    })).toEqual([]);

    expect(deviceSyncSourcesFromManifest({
      version: 3,
      ownerServerIndexKey: sourceB.serverIndexKey,
      sources: [sourceA],
    })).toEqual([]);
  });
});
