import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const databaseUrl = process.env.DATABASE_URL ?? "local.db";
const sqlite = new Database(databaseUrl);
const db = drizzle(sqlite);

migrate(db, { migrationsFolder: "drizzle" });
sqlite.close();
