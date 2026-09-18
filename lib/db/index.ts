import { loadEnvConfig } from "@next/env";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { PgDatabase, PgQueryResultHKT, PgTransaction, PgTransactionConfig } from "drizzle-orm/pg-core";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import postgres from "postgres";
import { resolve } from "node:path";
import * as schema from "./schema";

export type DbMode = "pg" | "pglite";
export type DbExecutor = PgDatabase<PgQueryResultHKT, typeof schema>;
export type DbTransaction = PgTransaction<PgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;
export type DbTransactionConfig = PgTransactionConfig;
export type TransactionFn<T> = (tx: DbTransaction) => Promise<T>;

export type DatabaseConnection =
  | { db: PostgresJsDatabase<typeof schema>; mode: "pg"; client: postgres.Sql }
  | { db: PgliteDatabase<typeof schema>; mode: "pglite"; client: PGlite };

const shared = globalThis as typeof globalThis & {
  __blueSentinelDb?: DatabaseConnection;
};

export function getDb(): DatabaseConnection {
  if (typeof window !== "undefined") throw new Error("Database access is server-only");
  if (shared.__blueSentinelDb) return shared.__blueSentinelDb;

  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production", {
    info: () => {},
    error: () => { throw new Error("Database environment loading failed"); },
  });
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl) {
    const client = postgres(databaseUrl, {
      prepare: false,
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      onnotice: () => {},
    });
    shared.__blueSentinelDb = { db: drizzlePostgres(client, { schema }), mode: "pg", client };
  } else {
    const client = new PGlite(process.env.PGLITE_DATA_DIR || resolve(process.cwd(), ".pglite"));
    shared.__blueSentinelDb = { db: drizzlePglite(client, { schema }), mode: "pglite", client };
  }

  return shared.__blueSentinelDb;
}

export function getMode(): DbMode {
  return getDb().mode;
}

export function getPgliteClient(): PGlite | null {
  const connection = getDb();
  return connection.mode === "pglite" ? connection.client : null;
}

export function getPgClient(): postgres.Sql | null {
  const connection = getDb();
  return connection.mode === "pg" ? connection.client : null;
}

export async function withTransaction<T>(
  fn: TransactionFn<T>,
  config?: DbTransactionConfig
): Promise<T> {
  return getDb().db.transaction(fn, config);
}

export async function closeDb(): Promise<void> {
  const connection = shared.__blueSentinelDb;
  if (!connection) return;
  try {
    if (connection.mode === "pg") await connection.client.end({ timeout: 5 });
    else await connection.client.close();
  } finally {
    if (shared.__blueSentinelDb === connection) delete shared.__blueSentinelDb;
  }
}
