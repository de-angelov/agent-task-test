import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";

import * as schema from "~/db/schema";

import { createEpic } from "../epics/epics.server";
import { createTeam, type AppDb } from "../teams/teams.server";
import {
  createTicket,
  mapTicketCreateError,
  normalizeTicketBody,
  normalizeTicketTitle,
} from "./tickets.server";

const now = new Date("2026-06-30T10:00:00.000Z");

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

function createTeamForTest(name = "Platform") {
  return createTeam(database, { name }, { now: () => now })._unsafeUnwrap();
}

function createEpicForTest(teamId: string, title = "Launch Plan") {
  return createEpic(
    database,
    {
      teamId,
      title,
      description: "Coordinate the MVP launch",
    },
    { now: () => now },
  )._unsafeUnwrap();
}

describe("ticket service", () => {
  it("requires non-empty trimmed titles and bodies", () => {
    const team = createTeamForTest();

    expect(normalizeTicketTitle("  Ticket  ")._unsafeUnwrap()).toBe("Ticket");
    expect(normalizeTicketTitle("   ")._unsafeUnwrapErr()).toBe("empty-title");
    expect(normalizeTicketBody("  Body  ")._unsafeUnwrap()).toBe("Body");
    expect(normalizeTicketBody("   ")._unsafeUnwrapErr()).toBe("empty-body");

    expect(
      createTicket(database, {
        teamId: team.id,
        createdBy: "user-1",
        title: "   ",
        body: "Create a focused backend service",
        type: "feature",
        state: "backlog",
      })._unsafeUnwrapErr(),
    ).toBe("empty-title");
    expect(
      createTicket(database, {
        teamId: team.id,
        createdBy: "user-1",
        title: "Create service",
        body: "   ",
        type: "feature",
        state: "backlog",
      })._unsafeUnwrapErr(),
    ).toBe("empty-body");
  });

  it("rejects invalid ticket type and state values", () => {
    const team = createTeamForTest();

    expect(
      createTicket(database, {
        teamId: team.id,
        createdBy: "user-1",
        title: "Create service",
        body: "Create a focused backend service",
        type: "story",
        state: "backlog",
      })._unsafeUnwrapErr(),
    ).toBe("invalid-type");
    expect(
      createTicket(database, {
        teamId: team.id,
        createdBy: "user-1",
        title: "Create service",
        body: "Create a focused backend service",
        type: "feature",
        state: "ready",
      })._unsafeUnwrapErr(),
    ).toBe("invalid-state");
  });

  it("rejects missing team, missing epic, and missing creator references", () => {
    const team = createTeamForTest();

    expect(
      createTicket(database, {
        teamId: "missing-team",
        createdBy: "user-1",
        title: "Create service",
        body: "Create a focused backend service",
        type: "feature",
        state: "backlog",
      })._unsafeUnwrapErr(),
    ).toBe("team-not-found");
    expect(
      createTicket(database, {
        teamId: team.id,
        epicId: "missing-epic",
        createdBy: "user-1",
        title: "Create service",
        body: "Create a focused backend service",
        type: "feature",
        state: "backlog",
      })._unsafeUnwrapErr(),
    ).toBe("epic-not-found");
    expect(
      createTicket(database, {
        teamId: team.id,
        createdBy: "missing-user",
        title: "Create service",
        body: "Create a focused backend service",
        type: "feature",
        state: "backlog",
      })._unsafeUnwrapErr(),
    ).toBe("created-by-not-found");
  });

  it("allows null epics and epics from the same team", () => {
    const team = createTeamForTest();
    const epic = createEpicForTest(team.id);

    const standaloneTicket = createTicket(
      database,
      {
        teamId: team.id,
        epicId: null,
        createdBy: "user-1",
        title: "  Create service  ",
        body: "  Create a focused backend service  ",
        type: "feature",
        state: "backlog",
      },
      { now: () => now },
    )._unsafeUnwrap();
    const epicTicket = createTicket(
      database,
      {
        teamId: team.id,
        epicId: epic.id,
        createdBy: "user-1",
        title: "Wire routes",
        body: "Connect the service later",
        type: "task",
        state: "todo",
      },
      { now: () => now },
    )._unsafeUnwrap();

    expect(standaloneTicket).toMatchObject({
      title: "Create service",
      body: "Create a focused backend service",
      type: "feature",
      state: "backlog",
      teamId: team.id,
      epicId: null,
    });
    expect(epicTicket).toMatchObject({
      teamId: team.id,
      epicId: epic.id,
    });
  });

  it("rejects epics from another team", () => {
    const platform = createTeamForTest("Platform");
    const product = createTeamForTest("Product");
    const productEpic = createEpicForTest(product.id, "Discovery");

    expect(
      createTicket(database, {
        teamId: platform.id,
        epicId: productEpic.id,
        createdBy: "user-1",
        title: "Create service",
        body: "Create a focused backend service",
        type: "feature",
        state: "backlog",
      })._unsafeUnwrapErr(),
    ).toBe("epic-team-mismatch");
  });

  it("assigns server timestamps and created-by from the caller", () => {
    const team = createTeamForTest();

    const ticket = createTicket(
      database,
      {
        teamId: team.id,
        createdBy: "user-1",
        title: "Create service",
        body: "Create a focused backend service",
        type: "feature",
        state: "backlog",
      },
      { now: () => now },
    )._unsafeUnwrap();

    expect(ticket).toMatchObject({
      createdBy: "user-1",
      createdAt: now.toISOString(),
      modifiedAt: now.toISOString(),
    });
    expect(database.select().from(schema.tickets).all()).toEqual([ticket]);
  });

  it("maps create errors to user-facing messages", () => {
    expect(mapTicketCreateError("empty-title")).toBe("Ticket title is required.");
    expect(mapTicketCreateError("empty-body")).toBe("Ticket body is required.");
    expect(mapTicketCreateError("invalid-type")).toBe("Ticket type is invalid.");
    expect(mapTicketCreateError("invalid-state")).toBe("Ticket state is invalid.");
    expect(mapTicketCreateError("team-not-found")).toBe("Team not found.");
    expect(mapTicketCreateError("epic-not-found")).toBe("Epic not found.");
    expect(mapTicketCreateError("epic-team-mismatch")).toBe(
      "Epic must belong to the ticket team.",
    );
    expect(mapTicketCreateError("created-by-not-found")).toBe(
      "Ticket creator not found.",
    );
  });
});
