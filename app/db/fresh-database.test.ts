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
  "password_reset_tokens",
  "sessions",
  "comments",
  "ticket_activity",
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
          "password_reset_tokens",
          "sessions",
          "comments",
          "ticket_activity",
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
          { name: "title", required: true },
          { name: "body", required: true },
          { name: "type", required: true },
          { name: "state", required: true },
          { name: "team_id", required: true },
          { name: "epic_id", required: false },
          { name: "created_by", required: true },
          { name: "created_at", required: true },
          { name: "modified_at", required: true },
        ]),
      );

      const ticketForeignKeys = sqlite
        .prepare("PRAGMA foreign_key_list(tickets)")
        .all() as Array<{
          from: string;
          on_delete: string;
          on_update: string;
          table: string;
          to: string;
        }>;

      expect(
        ticketForeignKeys.map((foreignKey) => ({
          from: foreignKey.from,
          onDelete: foreignKey.on_delete,
          onUpdate: foreignKey.on_update,
          table: foreignKey.table,
          to: foreignKey.to,
        })),
      ).toEqual(
        expect.arrayContaining([
          {
            from: "team_id",
            onDelete: "RESTRICT",
            onUpdate: "CASCADE",
            table: "teams",
            to: "id",
          },
          {
            from: "epic_id",
            onDelete: "RESTRICT",
            onUpdate: "CASCADE",
            table: "epics",
            to: "id",
          },
          {
            from: "created_by",
            onDelete: "RESTRICT",
            onUpdate: "CASCADE",
            table: "users",
            to: "id",
          },
        ]),
      );

      const commentColumns = sqlite
        .prepare("PRAGMA table_info(comments)")
        .all() as Array<{ name: string; notnull: 0 | 1 }>;

      expect(
        commentColumns.map((column) => ({
          name: column.name,
          required: column.notnull === 1,
        })),
      ).toEqual(
        expect.arrayContaining([
          { name: "id", required: true },
          { name: "ticket_id", required: true },
          { name: "author_id", required: true },
          { name: "body", required: true },
          { name: "created_at", required: true },
        ]),
      );

      const commentForeignKeys = sqlite
        .prepare("PRAGMA foreign_key_list(comments)")
        .all() as Array<{
          from: string;
          on_delete: string;
          on_update: string;
          table: string;
          to: string;
        }>;

      expect(
        commentForeignKeys.map((foreignKey) => ({
          from: foreignKey.from,
          onDelete: foreignKey.on_delete,
          onUpdate: foreignKey.on_update,
          table: foreignKey.table,
          to: foreignKey.to,
        })),
      ).toEqual(
        expect.arrayContaining([
          {
            from: "ticket_id",
            onDelete: "CASCADE",
            onUpdate: "CASCADE",
            table: "tickets",
            to: "id",
          },
          {
            from: "author_id",
            onDelete: "RESTRICT",
            onUpdate: "CASCADE",
            table: "users",
            to: "id",
          },
        ]),
      );

      const ticketActivityColumns = sqlite
        .prepare("PRAGMA table_info(ticket_activity)")
        .all() as Array<{ name: string; notnull: 0 | 1 }>;

      expect(
        ticketActivityColumns.map((column) => ({
          name: column.name,
          required: column.notnull === 1,
        })),
      ).toEqual(
        expect.arrayContaining([
          { name: "id", required: true },
          { name: "ticket_id", required: true },
          { name: "actor_id", required: true },
          { name: "action_type", required: true },
          { name: "detail", required: false },
          { name: "created_at", required: true },
        ]),
      );

      const ticketActivityForeignKeys = sqlite
        .prepare("PRAGMA foreign_key_list(ticket_activity)")
        .all() as Array<{
          from: string;
          on_delete: string;
          on_update: string;
          table: string;
          to: string;
        }>;

      expect(
        ticketActivityForeignKeys.map((foreignKey) => ({
          from: foreignKey.from,
          onDelete: foreignKey.on_delete,
          onUpdate: foreignKey.on_update,
          table: foreignKey.table,
          to: foreignKey.to,
        })),
      ).toEqual(
        expect.arrayContaining([
          {
            from: "ticket_id",
            onDelete: "CASCADE",
            onUpdate: "CASCADE",
            table: "tickets",
            to: "id",
          },
          {
            from: "actor_id",
            onDelete: "RESTRICT",
            onUpdate: "CASCADE",
            table: "users",
            to: "id",
          },
        ]),
      );
    } finally {
      sqlite.close();
    }
  });

  it("inserts ticket activity rows and enforces required columns and foreign keys", async () => {
    tempDirectory = await mkdtemp(join(tmpdir(), "repo-agent-db-"));
    const databasePath = join(tempDirectory, "ticket-activity.db");
    const sqlite = new Database(databasePath);
    sqlite.pragma("foreign_keys = ON");

    try {
      migrate(drizzle(sqlite), { migrationsFolder: "drizzle" });

      sqlite
        .prepare(
          "INSERT INTO teams (id, name, normalized_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        )
        .run("team-1", "Team One", "team one", "2026-07-06T00:00:00.000Z", "2026-07-06T00:00:00.000Z");

      sqlite
        .prepare(
          "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
        )
        .run("user-1", "user@example.com", "hash", 1751760000000);

      sqlite
        .prepare(
          "INSERT INTO tickets (id, title, body, type, state, team_id, created_by, created_at, modified_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          "ticket-1",
          "Ticket One",
          "Body",
          "task",
          "backlog",
          "team-1",
          "user-1",
          "2026-07-06T00:00:00.000Z",
          "2026-07-06T00:00:00.000Z",
        );

      sqlite
        .prepare(
          "INSERT INTO ticket_activity (id, ticket_id, actor_id, action_type, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(
          "activity-1",
          "ticket-1",
          "user-1",
          "state-changed",
          null,
          "2026-07-06T00:00:00.000Z",
        );

      const insertedRow = sqlite
        .prepare("SELECT * FROM ticket_activity WHERE id = ?")
        .get("activity-1");

      expect(insertedRow).toMatchObject({
        id: "activity-1",
        ticket_id: "ticket-1",
        actor_id: "user-1",
        action_type: "state-changed",
        detail: null,
        created_at: "2026-07-06T00:00:00.000Z",
      });

      expect(() =>
        sqlite
          .prepare(
            "INSERT INTO ticket_activity (id, ticket_id, actor_id, created_at) VALUES (?, ?, ?, ?)",
          )
          .run("activity-2", "ticket-1", "user-1", "2026-07-06T00:00:00.000Z"),
      ).toThrow(/NOT NULL constraint failed: ticket_activity.action_type/);

      expect(() =>
        sqlite
          .prepare(
            "INSERT INTO ticket_activity (id, ticket_id, actor_id, action_type, created_at) VALUES (?, ?, ?, ?, ?)",
          )
          .run(
            "activity-3",
            "missing-ticket",
            "user-1",
            "state-changed",
            "2026-07-06T00:00:00.000Z",
          ),
      ).toThrow(/FOREIGN KEY constraint failed/);
    } finally {
      sqlite.close();
    }
  });
});
