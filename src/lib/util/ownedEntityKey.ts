export function ownedEntityKey(entity: { id: string; serverId?: string | null }): string {
  return entity.serverId ? `${entity.serverId}:${entity.id}` : entity.id;
}

export function ownedOverrideValue<T>(
  overrides: Record<string, T>,
  entity: { id: string; serverId?: string | null },
): T | undefined {
  const key = ownedEntityKey(entity);
  if (Object.prototype.hasOwnProperty.call(overrides, key)) return overrides[key];
  if (key !== entity.id && Object.prototype.hasOwnProperty.call(overrides, entity.id)) {
    return overrides[entity.id];
  }
  return undefined;
}
