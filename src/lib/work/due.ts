import { and, eq, sql, lte, gte } from "drizzle-orm";
import { db } from "../../db";
import * as s from "../../db/schema";
import { dueSoonHours } from "./model";
import { canReadPerson } from "./access";
export async function deliverDueSoon(now = new Date()) {
  let delivered = 0;
  const items = await db
    .select()
    .from(s.workItems)
    .where(
      and(
        sql`${s.workItems.kind} in ('task','request')`,
        sql`${s.workItems.status} not in ('completed','cancelled','rejected')`,
        gte(s.workItems.dueAt, now),
        lte(
          s.workItems.dueAt,
          new Date(now.getTime() + dueSoonHours() * 3600000),
        ),
      ),
    );
  for (const w of items)
    await db.transaction(async (tx) => {
      const [term] = await tx
        .select()
        .from(s.terms)
        .where(eq(s.terms.id, w.termId))
        .for("update");
      if (term?.status !== "active") return;
      const [current] = await tx
        .select()
        .from(s.workItems)
        .where(eq(s.workItems.id, w.id));
      if (
        !current ||
        ["completed", "cancelled", "rejected"].includes(current.status) ||
        !current.dueAt ||
        current.dueAt < now ||
        current.dueAt.getTime() > now.getTime() + dueSoonHours() * 3600000
      )
        return;
      const people = await tx
        .select()
        .from(s.workAssignments)
        .where(
          and(
            eq(s.workAssignments.workId, w.id),
            eq(s.workAssignments.role, "responsible"),
          ),
        );
      for (const p of people) {
        if (!(await canReadPerson(p.userId, w, tx))) continue;
        const inserted = await tx
          .insert(s.dueDeliveries)
          .values({ workId: w.id, userId: p.userId, dueAt: w.dueAt! })
          .onConflictDoNothing()
          .returning();
        if (!inserted.length) continue;
        await tx.insert(s.notifications).values({
          id: crypto.randomUUID(),
          userId: p.userId,
          title: "اقترب موعد العمل",
          body: w.title,
          workId: w.id,
        });
        delivered++;
      }
    });
  return { delivered };
}
