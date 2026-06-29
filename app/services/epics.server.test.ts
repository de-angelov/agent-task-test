import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";

import * as schema from "~/db/schema";

import {
  createEpic,
  deleteEpic,
  editEpic,
  listEpicManagementRows,
  listEpics,
  mapEpicMutationError,
  normalizeEpicTitle,
  type Epic,
} from "./epics.server";
import { createTeam, type AppDb } from "./teams.server";

const now = new Date("2026-06-28T10:00:00.000Z");
const later = new Date("2026-06-28T11:00:00.000Z");

let sqlite: Database.Database;
let database: AppDb;

beforeEach(() => {
  sqlite = new Database(":memory:");
  sqlite.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE teams (
      id text PRIMARY KEY NOT NULL,
      name text NOT NULL,
      normalized_name text NOT NULL UNIQUE,
      created_at text NOT NULL,
      updated_at text NOT NULL
    );

    CREATE TABLE epics (
      id text PRIMARY KEY NOT NULL,
      team_id text NOT NULL,
      title text NOT NULL,
      description text,
      created_at text NOT NULL,
      updated_at text NOT NULL,
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE RESTRICT ON UPDATE CASCADE
    );

    CREATE TABLE users (
      id text PRIMARY KEY NOT NULL,
      email text NOT NULL UNIQUE,
      password_hash text NOT NULL,
      email_verified_at integer,
      created_at integer NOT NULL
    );

    CREATE TABLE tickets (
      id text PRIMARY KEY NOT NULL,
      title text NOT NULL,
      body text NOT NULL,
      type text NOT NULL,
      state text NOT NULL,
      team_id text NOT NULL,
      epic_id text,
      created_by text NOT NULL,
      created_at text NOT NULL,
      modified_at text NOT NULL,
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      FOREIGN KEY (epic_id) REFERENCES epics(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE
    );

    INSERT INTO users (id, email, password_hash, created_at)
    VALUES ('user-1', 'user@example.com', 'hash', ${now.getTime()});
  `);
  database = drizzle(sqlite, { schema });
});

function createTicketValues(id: string, teamId: string, epicId: string | null = null) {
  return {
    id,
    title: `Ticket ${id}`,
    body: "",
    type: "task",
    state: "backlog",
    teamId,
    epicId,
    createdBy: "user-1",
    createdAt: now.toISOString(),
    modifiedAt: now.toISOString(),
  } as const;
}

function createTeamForTest(name = "Platform") {
  return createTeam(database, { name }, { now: () => now })._unsafeUnwrap();
}

function createEpicForTest(input: Partial<Pick<Epic, "teamId" | "title">> = {}) {
  const team = input.teamId ? undefined : createTeamForTest();

  return createEpic(
    database,
    {
      teamId: input.teamId ?? team?.id ?? "",
      title: input.title ?? "Launch Plan",
      description: "Coordinate the MVP launch",
    },
    { now: () => now },
  )._unsafeUnwrap();
}

describe("epic service", () => {
  it("requires non-empty titles after trimming", () => {
    expect(normalizeEpicTitle("  Roadmap  ")._unsafeUnwrap()).toBe("Roadmap");
    expect(normalizeEpicTitle("   ")._unsafeUnwrapErr()).toBe("empty-title");

    const team = createTeamForTest();

    expect(
      createEpic(database, { teamId: team.id, title: "   " })._unsafeUnwrapErr(),
    ).toBe("empty-title");
  });

  it("creates and lists team-scoped epics with timestamps", () => {
    const platform = createTeamForTest("Platform");
    const product = createTeamForTest("Product");

    const platformEpic = createEpic(
      database,
      {
        teamId: platform.id,
        title: "  Launch Plan  ",
        description: "Coordinate the MVP launch",
      },
      { now: () => now },
    )._unsafeUnwrap();
    createEpic(
      database,
      {
        teamId: product.id,
        title: "Product Discovery",
      },
      { now: () => now },
    )._unsafeUnwrap();

    expect(platformEpic).toMatchObject({
      teamId: platform.id,
      title: "Launch Plan",
      description: "Coordinate the MVP launch",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    expect(listEpics(database, { teamId: platform.id })).toEqual([platformEpic]);
  });

  it("lists management rows with ticket counts ordered by team and epic title", () => {
    const platform = createTeamForTest("Platform");
    const product = createTeamForTest("Product");
    const migration = createEpic(
      database,
      {
        teamId: platform.id,
        title: "Migration",
        description: null,
      },
      { now: () => now },
    )._unsafeUnwrap();
    const launch = createEpic(
      database,
      {
        teamId: platform.id,
        title: "Launch",
        description: "Coordinate the MVP launch",
      },
      { now: () => now },
    )._unsafeUnwrap();
    const discovery = createEpic(
      database,
      {
        teamId: product.id,
        title: "Discovery",
        description: null,
      },
      { now: () => now },
    )._unsafeUnwrap();

    database
      .insert(schema.tickets)
      .values([
        createTicketValues("ticket-1", platform.id, migration.id),
        createTicketValues("ticket-2", platform.id, migration.id),
        createTicketValues("ticket-3", platform.id),
      ])
      .run();

    expect(listEpicManagementRows(database)).toEqual([
      {
        ...launch,
        teamName: "Platform",
        ticketCount: 0,
      },
      {
        ...migration,
        teamName: "Platform",
        ticketCount: 2,
      },
      {
        ...discovery,
        teamName: "Product",
        ticketCount: 0,
      },
    ]);
  });

  it("rejects epics for missing teams", () => {
    expect(
      createEpic(database, {
        teamId: "missing-team",
        title: "Launch Plan",
      })._unsafeUnwrapErr(),
    ).toBe("team-not-found");
  });

  it("edits title and description while preserving team and created timestamp", () => {
    const epic = createEpicForTest();

    const result = editEpic(
      database,
      {
        id: epic.id,
        teamId: epic.teamId,
        title: "  Updated Launch  ",
        description: null,
      },
      { now: () => later },
    )._unsafeUnwrap();

    expect(result).toEqual({
      ...epic,
      title: "Updated Launch",
      description: null,
      updatedAt: later.toISOString(),
    });
  });

  it("prevents changing an epic team after creation", () => {
    const epic = createEpicForTest();
    const otherTeam = createTeamForTest("Product");

    expect(
      editEpic(database, {
        id: epic.id,
        teamId: otherTeam.id,
        title: "Updated Launch",
      })._unsafeUnwrapErr(),
    ).toBe("immutable-team");

    expect(listEpics(database, { teamId: epic.teamId })).toEqual([epic]);
  });

  it("deletes epics without ticket references", () => {
    const epic = createEpicForTest();

    expect(deleteEpic(database, { id: epic.id }).isOk()).toBe(true);
    expect(listEpics(database, { teamId: epic.teamId })).toEqual([]);
  });

  it("prevents deleting epics referenced by tickets", () => {
    const epic = createEpicForTest();

    database
      .insert(schema.tickets)
      .values(createTicketValues("ticket-1", epic.teamId, epic.id))
      .run();

    expect(deleteEpic(database, { id: epic.id })._unsafeUnwrapErr()).toBe(
      "blocked-by-tickets",
    );
    expect(listEpics(database, { teamId: epic.teamId })).toEqual([epic]);
  });

  it("reports missing epics on edit and delete", () => {
    expect(
      editEpic(database, { id: "missing", title: "Launch Plan" })._unsafeUnwrapErr(),
    ).toBe("not-found");
    expect(deleteEpic(database, { id: "missing" })._unsafeUnwrapErr()).toBe(
      "not-found",
    );
  });

  it("maps mutation errors to user-facing messages", () => {
    expect(mapEpicMutationError("empty-title")).toBe("Epic title is required.");
    expect(mapEpicMutationError("team-not-found")).toBe("Team not found.");
    expect(mapEpicMutationError("immutable-team")).toBe(
      "Epics cannot be moved between teams.",
    );
    expect(mapEpicMutationError("blocked-by-tickets")).toBe(
      "Remove the epic from referenced tickets before deleting it.",
    );
    expect(mapEpicMutationError("not-found")).toBe("Epic not found.");
  });
});
