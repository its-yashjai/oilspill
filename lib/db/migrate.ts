import { resolve } from "node:path";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { closeDb, getDb } from "./index";
import { seedHistoricalIncidents } from "./seed";

export async function migrateDatabase(): Promise<void> {
  const connection = getDb();
  const config = { migrationsFolder: resolve(process.cwd(), "drizzle") };
  if (connection.mode === "pg") await migratePostgres(connection.db, config);
  else await migratePglite(connection.db, config);
}

async function main(): Promise<void> {
  try {
    await migrateDatabase();
    const count = await seedHistoricalIncidents();
    console.log(`[migrate] mode=${getDb().mode}; migrations applied; inserted ${count} synthetic demo scenarios`);
  } catch {
    console.error("[migrate] failed; connection details withheld");
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

if (process.argv[1] && /(?:^|[/\\])migrate\.(?:ts|js)$/.test(process.argv[1])) {
  void main().catch(() => {
    console.error("[migrate] shutdown failed");
    process.exitCode = 1;
  });
}
