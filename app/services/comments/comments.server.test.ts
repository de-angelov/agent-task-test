import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";

import * as schema from "~/db/schema";

import { createTeam, type AppDb } from "../teams/teams.server";
import { createTicket } from "../tickets/tickets.server";
import { addTicketComment, normalizeCommentBody } from "./comments.server";

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

    CREATE TABLE comments (
      id text PRIMARY KEY NOT NULL,
      ticket_id text NOT NULL,
      author_id text NOT NULL,
      body text NOT NULL,
      created_at text NOT NULL,
      FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE ON UPDATE CASCADE,
      FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE
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

describe("comment service", () => {
  it("requires a non-empty trimmed comment body", () => {
    expect(normalizeCommentBody("  Looks good  ")._unsafeUnwrap()).toBe(
      "Looks good",
    );
    expect(normalizeCommentBody("   ")._unsafeUnwrapErr()).toBe("empty-body");

    const team = createTeamForTest();
    const ticket = createTicketForTest(team.id);

    expect(
      addTicketComment(database, {
        ticketId: ticket.id,
        authorId: "user-1",
        body: "   ",
      })._unsafeUnwrapErr(),
    ).toBe("empty-body");
  });

  it("rejects comments on a missing ticket", () => {
    expect(
      addTicketComment(database, {
        ticketId: "missing-ticket",
        authorId: "user-1",
        body: "Looks good",
      })._unsafeUnwrapErr(),
    ).toBe("ticket-not-found");
  });

  it("rejects comments from a missing author", () => {
    const team = createTeamForTest();
    const ticket = createTicketForTest(team.id);

    expect(
      addTicketComment(database, {
        ticketId: ticket.id,
        authorId: "missing-user",
        body: "Looks good",
      })._unsafeUnwrapErr(),
    ).toBe("author-not-found");
  });

  it("assigns the caller-supplied author id and server timestamp", () => {
    const team = createTeamForTest();
    const ticket = createTicketForTest(team.id);

    const comment = addTicketComment(
      database,
      {
        ticketId: ticket.id,
        authorId: "user-1",
        body: "  Looks good  ",
      },
      { now: () => now },
    )._unsafeUnwrap();

    expect(comment).toMatchObject({
      ticketId: ticket.id,
      authorId: "user-1",
      body: "Looks good",
      createdAt: now.toISOString(),
    });
    expect(database.select().from(schema.comments).all()).toEqual([comment]);
  });

  it("does not update the ticket modified timestamp when adding a comment", () => {
    const team = createTeamForTest();
    const ticket = createTicketForTest(team.id);

    addTicketComment(
      database,
      {
        ticketId: ticket.id,
        authorId: "user-1",
        body: "Looks good",
      },
      { now: () => new Date("2026-06-30T11:00:00.000Z") },
    )._unsafeUnwrap();

    const persistedTicket = database
      .select()
      .from(schema.tickets)
      .where(eq(schema.tickets.id, ticket.id))
      .get();

    expect(persistedTicket?.modifiedAt).toBe(ticket.modifiedAt);
  });
});
