import { db } from "../src/db";
import * as s from "../src/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
const [command, ...args] = process.argv.slice(2);
await db.transaction(async (tx) => {
  let entityId = "",
    after: unknown;
  if (command === "committee") {
    const [id, name] = z.array(z.string().min(2)).length(2).parse(args);
    entityId = id;
    after = { id, name };
    await tx.insert(s.committees).values({ id, name });
  } else if (command === "term") {
    const [id, name, year, start, end] = z
      .tuple([z.string(), z.string(), z.string(), z.iso.date(), z.iso.date()])
      .parse(args);
    entityId = id;
    after = { id, name, year };
    await tx.insert(s.terms).values({
      id,
      name,
      year,
      startAt: new Date(start),
      endAt: new Date(end),
      status: "active",
    });
  } else if (command === "disable" || command === "enable") {
    const [u] = await tx
      .select()
      .from(s.user)
      .where(eq(s.user.email, args[0] || ""));
    if (!u) throw new Error("الحساب غير موجود");
    entityId = u.id;
    after = { active: command === "enable" };
    await tx
      .update(s.user)
      .set({ active: command === "enable" })
      .where(eq(s.user.id, u.id));
    if (command === "disable")
      await tx.delete(s.session).where(eq(s.session.userId, u.id));
  } else if (command === "assign") {
    const [email, roleId, committeeId, termId] = args;
    const [u] = await tx.select().from(s.user).where(eq(s.user.email, email));
    if (!u || !roleId || !committeeId || !termId)
      throw new Error("البريد والدور واللجنة والفصل مطلوبة");
    entityId = crypto.randomUUID();
    after = { userId: u.id, roleId, committeeId, termId };
    await tx.insert(s.assignments).values({
      id: entityId,
      userId: u.id,
      roleId,
      committeeId,
      termId,
      scope: "committee",
    });
  } else if (command === "close-term") {
    entityId = args[0];
    if (!entityId) throw new Error("معرف الفصل مطلوب");
    await tx
      .update(s.terms)
      .set({ status: "closed" })
      .where(eq(s.terms.id, entityId));
    await tx
      .update(s.assignments)
      .set({ endAt: new Date(), active: false })
      .where(
        and(eq(s.assignments.termId, entityId), eq(s.assignments.active, true)),
      );
    after = { status: "closed" };
  } else
    throw new Error(
      "الأوامر: committee, term, assign, disable, enable, close-term",
    );
  await tx.insert(s.auditLogs).values({
    id: crypto.randomUUID(),
    action: `organization.${command}`,
    entityType: "organization",
    entityId,
    newValue: after,
  });
});
console.log("تم تنفيذ التغيير وتسجيله في التدقيق.");
process.exit(0);
