import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, describe, expect, it } from "vitest";

const applicationTables = [
  "app_metadata",
  "teams",
  "epics",
  "tickets",
  "users",
  "email_verification_tokens",
  "sessions",
  "comments",
] as const;

let tempDirectory: string | undefined;

afterEach(async () => {
  if (tempDirectory) {
    await rm(tempDirectory, { recursive: true, force: true });
    tempDirectory = undefined;
  }
});

function countRowsIfTableExists(sqlite: Database.Database, tableName: string) {
  const table = sqlite
    .prepare(
      "SELECT name FROM sqlite_schema WHERE type = 'table' AND name = ?",
    )
    .get(tableName);

  if (!table) {
    return 0;
  }

  const result = sqlite
    .prepare(`SELECT COUNT(*) AS count FROM ${tableName}`)
    .get() as { count: number };

  return result.count;
}

describe("fresh database initialization", () => {
  it("creates schema through migrations without application data", async () => {
    tempDirectory = await mkdtemp(join(tmpdir(), "repo-agent-db-"));
    const databasePath = join(tempDirectory, "fresh.db");
    const sqlite = new Database(databasePath);
    sqlite.pragma("foreign_keys = ON");

    try {
      migrate(drizzle(sqlite), { migrationsFolder: "drizzle" });

      const tables = sqlite
        .prepare(
          "SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name",
        )
        .all() as Array<{ name: string }>;

      expect(tables.map((table) => table.name)).toEqual(
        expect.arrayContaining([
          "app_metadata",
          "teams",
          "epics",
          "tickets",
          "users",
          "email_verification_tokens",
          "sessions",
        ]),
      );

      for (const tableName of applicationTables) {
        const rowCount = countRowsIfTableExists(sqlite, tableName);
        expect(rowCount).toBe(0);
      }
    } finally {
      sqlite.close();
    }
  });
});
