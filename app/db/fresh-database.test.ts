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

      const ticketColumns = sqlite
        .prepare("PRAGMA table_info(tickets)")
        .all() as Array<{ name: string; notnull: 0 | 1 }>;

      expect(
        ticketColumns.map((column) => ({
          name: column.name,
          required: column.notnull === 1,
        })),
      ).toEqual(
        expect.arrayContaining([
          { name: "id", required: true },
          { name: "team_id", required: true },
          { name: "epic_id", required: false },
          { name: "title", required: true },
          { name: "body", required: true },
          { name: "type", required: true },
          { name: "state", required: true },
          { name: "created_by_user_id", required: true },
          { name: "created_at", required: true },
          { name: "modified_at", required: true },
        ]),
      );

      const ticketForeignKeys = sqlite
        .prepare("PRAGMA foreign_key_list(tickets)")
        .all() as Array<{ from: string; table: string; on_delete: string }>;

      expect(
        ticketForeignKeys.map((foreignKey) => ({
          from: foreignKey.from,
          table: foreignKey.table,
          onDelete: foreignKey.on_delete,
        })),
      ).toEqual(
        expect.arrayContaining([
          { from: "team_id", table: "teams", onDelete: "RESTRICT" },
          { from: "epic_id", table: "epics", onDelete: "RESTRICT" },
          { from: "created_by_user_id", table: "users", onDelete: "RESTRICT" },
        ]),
      );
    } finally {
      sqlite.close();
    }
  });
});
