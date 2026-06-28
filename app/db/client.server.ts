import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema";

export type AppDatabase = BetterSQLite3Database<typeof schema>;

export function createSqliteConnection(path = process.env.DATABASE_URL ?? "local.db") {
  const sqlite = new Database(path);
  sqlite.pragma("foreign_keys = ON");

  return sqlite;
}

export function createDatabaseClient(sqlite: Database.Database): AppDatabase {
  return drizzle(sqlite, { schema });
}

const sqlite = createSqliteConnection();

export const db = createDatabaseClient(sqlite);
