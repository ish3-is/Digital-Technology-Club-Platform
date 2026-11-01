import { and, desc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import type { Identity } from "@/lib/services";

const ONLINE_WINDOW_MS = 2 * 60 * 1000;

export async function touchPresence(ctx: Identity) {
  const now = new Date();
  await db
    .insert(s.userPresence)
    .values({ userId: ctx.user.id, lastSeenAt: now })
    .onConflictDoUpdate({
      target: s.userPresence.userId,
      set: { lastSeenAt: now },
    });
  return { ok: true };
}

export async function onlineMembers() {
  const cutoff = new Date(Date.now() - ONLINE_WINDOW_MS);
  return db
    .select({
      id: s.user.id,
      name: s.user.name,
      lastSeenAt: s.userPresence.lastSeenAt,
    })
    .from(s.userPresence)
    .innerJoin(s.user, eq(s.user.id, s.userPresence.userId))
    .where(and(eq(s.user.active, true), gt(s.userPresence.lastSeenAt, cutoff)))
    .orderBy(desc(s.userPresence.lastSeenAt));
}
