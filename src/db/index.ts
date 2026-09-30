import { PGlite } from "@electric-sql/pglite";
import { drizzle as localDrizzle } from "drizzle-orm/pglite";
import { drizzle as pgDrizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
const globals = globalThis as unknown as {
  clubDb?: ReturnType<typeof localDrizzle<typeof schema>>;
};
function createDb() {
  if (process.env.DATABASE_URL)
    return pgDrizzle(new Pool({ connectionString: process.env.DATABASE_URL }), {
      schema,
    }) as unknown as ReturnType<typeof localDrizzle<typeof schema>>;
  if (
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  )
    throw new Error("DATABASE_URL is required in production");
  return localDrizzle(new PGlite(process.env.PGLITE_DIR || ".data/club"), {
    schema,
  });
}
// Do not open local database files in Next.js build workers.
export const db = new Proxy(
  {} as ReturnType<typeof localDrizzle<typeof schema>>,
  {
    get(_target, key) {
      const instance = (globals.clubDb ??= createDb());
      const value = Reflect.get(instance, key);
      return typeof value === "function" ? value.bind(instance) : value;
    },
  },
);
