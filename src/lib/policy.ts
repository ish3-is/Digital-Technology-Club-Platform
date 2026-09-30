export type Grant = {
  permission: string;
  scope: string;
  committeeId: string | null;
  startAt: Date;
  endAt: Date | null;
  active: boolean;
  termStatus?: string | null;
  termId?: string | null;
};
export function permits(
  grants: Grant[],
  permission: string,
  resource?: { committeeId?: string; ownerId?: string },
  actorId?: string,
  now = new Date(),
) {
  return grants.some(
    (g) =>
      g.permission === permission &&
      g.active &&
      g.startAt <= now &&
      (!g.endAt || g.endAt > now) &&
      (permission.endsWith(".read") || g.termStatus !== "closed") &&
      (g.scope === "club" ||
        (g.scope === "committee" &&
          !!resource?.committeeId &&
          g.committeeId === resource.committeeId) ||
        (g.scope === "self" && !!actorId && resource?.ownerId === actorId)),
  );
}
