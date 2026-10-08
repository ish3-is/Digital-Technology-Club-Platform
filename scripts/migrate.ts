import { db } from "../src/db";
import { migrate as localMigrate } from "drizzle-orm/pglite/migrator";
import { migrate as pgMigrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { permissions, roles, rolePermissions } from "../src/db/schema";
import { permissionCatalog, roleCatalog } from "../src/db/catalog";
import { seedEventConfiguration } from "../src/lib/events/configuration";

console.log("1/7 بدء الهجرات...");

await (process.env.DATABASE_URL
  ? pgMigrate(db as unknown as Parameters<typeof pgMigrate>[0], {
      migrationsFolder: "migrations",
    })
  : localMigrate(db, { migrationsFolder: "migrations" }));

console.log("2/7 الهجرات اكتملت");

await db.execute(
  sql`CREATE OR REPLACE FUNCTION reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit log is append-only'; END; $$;`,
);

console.log("3/7 دالة حماية Audit جاهزة");

await db.execute(sql`DROP TRIGGER IF EXISTS audit_append_only ON audit_logs`);

await db.execute(
  sql`CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();`,
);

console.log("4/7 Audit trigger جاهز");

console.log("4.1/7 تجهيز الصلاحيات والأدوار...");

await db.transaction(async (tx) => {
  const permissionRows = Object.entries(permissionCatalog).map(
    ([id, description]) => ({
      id,
      description,
    }),
  );

  if (permissionRows.length > 0) {
    await tx
      .insert(permissions)
      .values(permissionRows)
      .onConflictDoNothing();
  }

  console.log(`4.2/7 تم إدخال ${permissionRows.length} صلاحية`);

  const roleRows = Object.entries(roleCatalog).map(([id, role]) => ({
    id,
    name: role.name,
  }));

  if (roleRows.length > 0) {
    await tx
      .insert(roles)
      .values(roleRows)
      .onConflictDoNothing();
  }

  console.log(`4.3/7 تم إدخال ${roleRows.length} دور`);

  const rolePermissionRows = Object.entries(roleCatalog).flatMap(
    ([roleId, role]) =>
      role.permissions.map((permissionId) => ({
        roleId,
        permissionId,
      })),
  );

  if (rolePermissionRows.length > 0) {
    await tx
      .insert(rolePermissions)
      .values(rolePermissionRows)
      .onConflictDoNothing();
  }

  console.log(
    `4.4/7 تم إدخال ${rolePermissionRows.length} ارتباط دور/صلاحية`,
  );
});

console.log("5/7 الأدوار والصلاحيات جاهزة");

console.log("5/7 الأدوار والصلاحيات جاهزة");

await seedEventConfiguration();

console.log("6/7 إعدادات الفعاليات جاهزة");

const { seedPeopleConfiguration } = await import(
  "../src/lib/people/contribution.service"
);

await seedPeopleConfiguration();

console.log("7/7 إعدادات People جاهزة");

console.log(
  "اكتملت الهجرات وتهيئة الأدوار وقواعد المساهمة. لم تُنشأ حسابات أو بيانات تجريبية.",
);

process.exit(0);