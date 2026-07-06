import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";

import * as schema from "~/db/schema";

import { createTeam, type AppDb } from "../teams/teams.server";
import { createTicket } from "../tickets/tickets.server";
import { listTicketActivity, recordTicketActivity } from "./ticket-activity.server";

const now = new Date("2026-07-06T10:00:00.000Z");

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

    CREATE TABLE ticket_activity (
      id text PRIMARY KEY NOT NULL,
      ticket_id text NOT NULL,
      actor_id text NOT NULL,
      action_type text NOT NULL,
      detail text,
      created_at text NOT NULL,
      FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE ON UPDATE CASCADE,
      FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE
    );

    INSERT INTO users (id, email, password_hash, created_at)
    VALUES ('user-1', 'user@example.com', 'hash', ${now.getTime()});
  `);
  database = drizzle(sqlite, { schema });
});

function createTeamForTest(name = "Platform") {
  return createTeam(database, { name }, { now: () => now })._unsafeUnwrap();
}

function createTicketForTest(teamId: string) {
  return createTicket(
    database,
    {
      teamId,
      createdBy: "user-1",
      title: "Create service",
      body: "Create a focused backend service",
      type: "feature",
      state: "backlog",
    },
    { now: () => now },
  )._unsafeUnwrap();
}

describe("recordTicketActivity", () => {
  it("rejects an unknown action type", () => {
    const team = createTeamForTest();
    const ticket = createTicketForTest(team.id);

    expect(
      recordTicketActivity(database, {
        ticketId: ticket.id,
        actorId: "user-1",
        actionType: "not-a-real-action",
      })._unsafeUnwrapErr(),
    ).toBe("invalid-action-type");
  });

  it("rejects activity for a missing ticket", () => {
    expect(
      recordTicketActivity(database, {
        ticketId: "missing-ticket",
        actorId: "user-1",
        actionType: "created",
      })._unsafeUnwrapErr(),
    ).toBe("ticket-not-found");
  });

  it("rejects activity from a missing actor", () => {
    const team = createTeamForTest();
    const ticket = createTicketForTest(team.id);

    expect(
      recordTicketActivity(database, {
        ticketId: ticket.id,
        actorId: "missing-user",
        actionType: "created",
      })._unsafeUnwrapErr(),
    ).toBe("actor-not-found");
  });

  it("assigns the caller-supplied actor id and server timestamp", () => {
    const team = createTeamForTest();
    const ticket = createTicketForTest(team.id);

    const activity = recordTicketActivity(
      database,
      {
        ticketId: ticket.id,
        actorId: "user-1",
        actionType: "state-changed",
        detail: "backlog -> todo",
      },
      { now: () => now },
    )._unsafeUnwrap();

    expect(activity).toMatchObject({
      ticketId: ticket.id,
      actorId: "user-1",
      actionType: "state-changed",
      detail: "backlog -> todo",
      createdAt: now.toISOString(),
    });
    expect(database.select().from(schema.ticketActivity).all()).toEqual([activity]);
  });

  it("defaults detail to null when not provided", () => {
    const team = createTeamForTest();
    const ticket = createTicketForTest(team.id);

    const activity = recordTicketActivity(database, {
      ticketId: ticket.id,
      actorId: "user-1",
      actionType: "created",
    })._unsafeUnwrap();

    expect(activity.detail).toBeNull();
  });
});

describe("listTicketActivity", () => {
  it("returns an empty list for a ticket without activity", () => {
    const team = createTeamForTest();
    const ticket = createTicketForTest(team.id);

    expect(listTicketActivity(database, { ticketId: ticket.id })).toEqual([]);
  });

  it("returns entries oldest first", () => {
    const team = createTeamForTest();
    const ticket = createTicketForTest(team.id);

    const first = recordTicketActivity(
      database,
      { ticketId: ticket.id, actorId: "user-1", actionType: "created" },
      { now: () => new Date("2026-07-06T10:00:00.000Z") },
    )._unsafeUnwrap();

    const second = recordTicketActivity(
      database,
      { ticketId: ticket.id, actorId: "user-1", actionType: "state-changed" },
      { now: () => new Date("2026-07-06T11:00:00.000Z") },
    )._unsafeUnwrap();

    expect(listTicketActivity(database, { ticketId: ticket.id })).toEqual([
      first,
      second,
    ]);
  });

  it("isolates activity by ticket", () => {
    const team = createTeamForTest();
    const ticketOne = createTicketForTest(team.id);
    const ticketTwo = createTicketForTest(team.id);

    recordTicketActivity(database, {
      ticketId: ticketOne.id,
      actorId: "user-1",
      actionType: "created",
    })._unsafeUnwrap();

    recordTicketActivity(database, {
      ticketId: ticketTwo.id,
      actorId: "user-1",
      actionType: "created",
    })._unsafeUnwrap();

    const activityForTicketOne = listTicketActivity(database, {
      ticketId: ticketOne.id,
    });

    expect(activityForTicketOne).toHaveLength(1);
    expect(activityForTicketOne[0]?.ticketId).toBe(ticketOne.id);
  });
});
