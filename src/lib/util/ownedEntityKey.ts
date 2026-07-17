export function ownedEntityKey(entity: { id: string; serverId?: string | null }): string {
  return entity.serverId ? `${entity.serverId}:${entity.id}` : entity.id;
}
