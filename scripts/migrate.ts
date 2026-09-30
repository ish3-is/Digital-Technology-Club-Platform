import { db } from "../src/db";
import { migrate as localMigrate } from "drizzle-orm/pglite/migrator";
import { migrate as pgMigrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { permissions, roles, rolePermissions } from "../src/db/schema";
import { permissionCatalog, roleCatalog } from "../src/db/catalog";
import { seedEventConfiguration } from "../src/lib/events/configuration";
await (process.env.DATABASE_URL
  ? pgMigrate(db as unknown as Parameters<typeof pgMigrate>[0], {
      migrationsFolder: "migrations",
    })
  : localMigrate(db, { migrationsFolder: "migrations" }));
await db.execute(
  sql`CREATE OR REPLACE FUNCTION reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit log is append-only'; END; $$;`,
);
await db.execute(sql`DROP TRIGGER IF EXISTS audit_append_only ON audit_logs`);
await db.execute(
  sql`CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();`,
);
await db.transaction(async (tx) => {
  for (const [id, description] of Object.entries(permissionCatalog))
    await tx
      .insert(permissions)
      .values({ id, description })
      .onConflictDoNothing();
  for (const [id, role] of Object.entries(roleCatalog)) {
    await tx
      .insert(roles)
      .values({ id, name: role.name })
      .onConflictDoNothing();
    for (const permissionId of role.permissions)
      await tx
        .insert(rolePermissions)
        .values({ roleId: id, permissionId })
        .onConflictDoNothing();
  }
});
await seedEventConfiguration();
console.log(
  "اكتملت الهجرات وتهيئة الأدوار. لم تُنشأ حسابات أو بيانات تجريبية.",
);
process.exit(0);
