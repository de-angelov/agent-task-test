import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";

import * as schema from "~/db/schema";

import { createEpic } from "../epics/epics.server";
import { createTeam, type AppDb } from "../teams/teams.server";
import {
  createTicket,
  getTicketById,
  listTicketsForTeam,
  mapTicketCreateError,
  mapTicketUpdateError,
  normalizeTicketBody,
  normalizeTicketTitle,
  updateTicket,
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

  it("returns not-found when reading a missing ticket", () => {
    expect(
      getTicketById(database, { id: "missing-ticket" })._unsafeUnwrapErr(),
    ).toBe("not-found");
  });

  it("reads a ticket with joined display data", () => {
    const team = createTeamForTest("Platform");
    const epic = createEpicForTest(team.id, "Launch Plan");
    const ticket = createTicket(
      database,
      {
        teamId: team.id,
        epicId: epic.id,
        createdBy: "user-1",
        title: "Create service",
        body: "Create a focused backend service",
        type: "feature",
        state: "backlog",
      },
      { now: () => now },
    )._unsafeUnwrap();

    expect(getTicketById(database, { id: ticket.id })._unsafeUnwrap()).toEqual({
      ...ticket,
      teamName: "Platform",
      epicTitle: "Launch Plan",
      createdByEmail: "user@example.com",
    });
  });

  it("preserves null epic display data when reading and listing tickets", () => {
    const team = createTeamForTest();
    const ticket = createTicket(
      database,
      {
        teamId: team.id,
        epicId: null,
        createdBy: "user-1",
        title: "Create service",
        body: "Create a focused backend service",
        type: "feature",
        state: "backlog",
      },
      { now: () => now },
    )._unsafeUnwrap();

    expect(
      getTicketById(database, { id: ticket.id })._unsafeUnwrap(),
    ).toMatchObject({
      epicId: null,
      epicTitle: null,
    });
    expect(listTicketsForTeam(database, { teamId: team.id })).toMatchObject([
      {
        id: ticket.id,
        epicId: null,
        epicTitle: null,
      },
    ]);
  });

  it("lists tickets only for the requested team", () => {
    const platform = createTeamForTest("Platform");
    const product = createTeamForTest("Product");
    const platformTicket = createTicket(
      database,
      {
        teamId: platform.id,
        createdBy: "user-1",
        title: "Platform ticket",
        body: "Create a focused backend service",
        type: "feature",
        state: "backlog",
      },
      { now: () => now },
    )._unsafeUnwrap();
    createTicket(
      database,
      {
        teamId: product.id,
        createdBy: "user-1",
        title: "Product ticket",
        body: "Create a focused frontend route",
        type: "task",
        state: "todo",
      },
      { now: () => now },
    )._unsafeUnwrap();

    expect(listTicketsForTeam(database, { teamId: platform.id })).toEqual([
      {
        ...platformTicket,
        teamName: "Platform",
        epicTitle: null,
        createdByEmail: "user@example.com",
      },
    ]);
  });

  it("orders listed tickets by most recently modified first", () => {
    const team = createTeamForTest();
    const oldest = createTicket(
      database,
      {
        teamId: team.id,
        createdBy: "user-1",
        title: "Oldest",
        body: "Create a focused backend service",
        type: "feature",
        state: "backlog",
      },
      { now: () => new Date("2026-06-30T10:00:00.000Z") },
    )._unsafeUnwrap();
    const newest = createTicket(
      database,
      {
        teamId: team.id,
        createdBy: "user-1",
        title: "Newest",
        body: "Create a focused frontend route",
        type: "task",
        state: "todo",
      },
      { now: () => new Date("2026-06-30T10:05:00.000Z") },
    )._unsafeUnwrap();
    const middle = createTicket(
      database,
      {
        teamId: team.id,
        createdBy: "user-1",
        title: "Middle",
        body: "Connect the service later",
        type: "task",
        state: "todo",
      },
      { now: () => new Date("2026-06-30T10:02:00.000Z") },
    )._unsafeUnwrap();

    sqlite
      .prepare("UPDATE tickets SET modified_at = ? WHERE id = ?")
      .run("2026-06-30T10:01:00.000Z", oldest.id);
    sqlite
      .prepare("UPDATE tickets SET modified_at = ? WHERE id = ?")
      .run("2026-06-30T10:03:00.000Z", middle.id);
    sqlite
      .prepare("UPDATE tickets SET modified_at = ? WHERE id = ?")
      .run("2026-06-30T10:06:00.000Z", newest.id);

    expect(
      listTicketsForTeam(database, { teamId: team.id }).map(
        (ticket) => ticket.title,
      ),
    ).toEqual(["Newest", "Middle", "Oldest"]);
  });

  it("updates editable ticket fields and advances modified-at when values change", () => {
    const platform = createTeamForTest("Platform");
    const product = createTeamForTest("Product");
    const productEpic = createEpicForTest(product.id, "Discovery");
    const ticket = createTicket(
      database,
      {
        teamId: platform.id,
        createdBy: "user-1",
        title: "Create service",
        body: "Create a focused backend service",
        type: "feature",
        state: "backlog",
      },
      { now: () => now },
    )._unsafeUnwrap();

    const updatedAt = new Date("2026-06-30T10:15:00.000Z");
    const updatedTicket = updateTicket(
      database,
      {
        id: ticket.id,
        teamId: product.id,
        epicId: productEpic.id,
        title: "  Fix workflow  ",
        body: "  Support direct updates  ",
        type: "bug",
        state: "in-progress",
      },
      { now: () => updatedAt },
    )._unsafeUnwrap();

    expect(updatedTicket).toEqual({
      ...ticket,
      title: "Fix workflow",
      body: "Support direct updates",
      type: "bug",
      state: "in-progress",
      teamId: product.id,
      epicId: productEpic.id,
      modifiedAt: updatedAt.toISOString(),
    });
    expect(getTicketById(database, { id: ticket.id })._unsafeUnwrap()).toEqual({
      ...updatedTicket,
      teamName: "Product",
      epicTitle: "Discovery",
      createdByEmail: "user@example.com",
    });
  });

  it("does not advance modified-at when submitted values match persisted values", () => {
    const team = createTeamForTest();
    const epic = createEpicForTest(team.id);
    const ticket = createTicket(
      database,
      {
        teamId: team.id,
        epicId: epic.id,
        createdBy: "user-1",
        title: "Create service",
        body: "Create a focused backend service",
        type: "feature",
        state: "backlog",
      },
      { now: () => now },
    )._unsafeUnwrap();

    const updatedTicket = updateTicket(
      database,
      {
        id: ticket.id,
        teamId: team.id,
        epicId: epic.id,
        title: "  Create service  ",
        body: "  Create a focused backend service  ",
        type: "feature",
        state: "backlog",
      },
      { now: () => new Date("2026-06-30T10:30:00.000Z") },
    )._unsafeUnwrap();

    expect(updatedTicket.modifiedAt).toBe(now.toISOString());
    expect(database.select().from(schema.tickets).all()).toEqual([ticket]);
  });

  it("validates update enum values and references", () => {
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

    expect(
      updateTicket(database, {
        id: ticket.id,
        teamId: team.id,
        title: "Create service",
        body: "Create a focused backend service",
        type: "story",
        state: "backlog",
      })._unsafeUnwrapErr(),
    ).toBe("invalid-type");
    expect(
      updateTicket(database, {
        id: ticket.id,
        teamId: team.id,
        title: "Create service",
        body: "Create a focused backend service",
        type: "feature",
        state: "ready",
      })._unsafeUnwrapErr(),
    ).toBe("invalid-state");
    expect(
      updateTicket(database, {
        id: "missing-ticket",
        teamId: team.id,
        title: "Create service",
        body: "Create a focused backend service",
        type: "feature",
        state: "backlog",
      })._unsafeUnwrapErr(),
    ).toBe("not-found");
    expect(
      updateTicket(database, {
        id: ticket.id,
        teamId: "missing-team",
        title: "Create service",
        body: "Create a focused backend service",
        type: "feature",
        state: "backlog",
      })._unsafeUnwrapErr(),
    ).toBe("team-not-found");
    expect(
      updateTicket(database, {
        id: ticket.id,
        teamId: team.id,
        epicId: "missing-epic",
        title: "Create service",
        body: "Create a focused backend service",
        type: "feature",
        state: "backlog",
      })._unsafeUnwrapErr(),
    ).toBe("epic-not-found");
  });

  it("requires the selected update epic to be null or from the updated ticket team", () => {
    const platform = createTeamForTest("Platform");
    const product = createTeamForTest("Product");
    const platformEpic = createEpicForTest(platform.id, "Platform Plan");
    const productEpic = createEpicForTest(product.id, "Product Plan");
    const ticket = createTicket(
      database,
      {
        teamId: platform.id,
        epicId: platformEpic.id,
        createdBy: "user-1",
        title: "Create service",
        body: "Create a focused backend service",
        type: "feature",
        state: "backlog",
      },
      { now: () => now },
    )._unsafeUnwrap();

    expect(
      updateTicket(database, {
        id: ticket.id,
        teamId: product.id,
        epicId: platformEpic.id,
        title: "Create service",
        body: "Create a focused backend service",
        type: "feature",
        state: "backlog",
      })._unsafeUnwrapErr(),
    ).toBe("epic-team-mismatch");

    expect(
      updateTicket(database, {
        id: ticket.id,
        teamId: product.id,
        epicId: productEpic.id,
        title: "Create service",
        body: "Create a focused backend service",
        type: "feature",
        state: "backlog",
      })._unsafeUnwrap(),
    ).toMatchObject({
      teamId: product.id,
      epicId: productEpic.id,
    });

    expect(
      updateTicket(database, {
        id: ticket.id,
        teamId: product.id,
        epicId: null,
        title: "Create service",
        body: "Create a focused backend service",
        type: "feature",
        state: "backlog",
      })._unsafeUnwrap(),
    ).toMatchObject({
      teamId: product.id,
      epicId: null,
    });
  });

  it("allows direct state updates between any valid states", () => {
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

    expect(
      updateTicket(database, {
        id: ticket.id,
        teamId: team.id,
        title: "Create service",
        body: "Create a focused backend service",
        type: "feature",
        state: "done",
      })._unsafeUnwrap(),
    ).toMatchObject({ state: "done" });

    expect(
      updateTicket(database, {
        id: ticket.id,
        teamId: team.id,
        title: "Create service",
        body: "Create a focused backend service",
        type: "feature",
        state: "backlog",
      })._unsafeUnwrap(),
    ).toMatchObject({ state: "backlog" });
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

  it("maps update errors to user-facing messages", () => {
    expect(mapTicketUpdateError("empty-title")).toBe("Ticket title is required.");
    expect(mapTicketUpdateError("empty-body")).toBe("Ticket body is required.");
    expect(mapTicketUpdateError("invalid-type")).toBe("Ticket type is invalid.");
    expect(mapTicketUpdateError("invalid-state")).toBe("Ticket state is invalid.");
    expect(mapTicketUpdateError("team-not-found")).toBe("Team not found.");
    expect(mapTicketUpdateError("epic-not-found")).toBe("Epic not found.");
    expect(mapTicketUpdateError("epic-team-mismatch")).toBe(
      "Epic must belong to the ticket team.",
    );
    expect(mapTicketUpdateError("not-found")).toBe("Ticket not found.");
  });
});
