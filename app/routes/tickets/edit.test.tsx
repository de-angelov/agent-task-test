import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "~/db/schema";
import { createEpic } from "~/services/epics/epics.server";
import { createSessionCookie } from "~/services/session/session.server";
import { createTicket } from "~/services/tickets/tickets.server";
import { createTeam, type AppDb } from "~/services/teams/teams.server";

import { loader } from "./edit";

const now = new Date("2026-06-30T10:00:00.000Z");
const sessionId = "session-1";
const userId = "user-1";
const userEmail = "user@example.com";

const clientServerState = vi.hoisted(() => ({
  db: undefined as AppDb | undefined,
}));

vi.mock("~/db/client.server", () => ({
  get db() {
    if (!clientServerState.db) {
      throw new Error("Test database has not been initialized.");
    }

    return clientServerState.db;
  },
}));

let sqlite: Database.Database;
let database: AppDb;
let sessionCookieHeader = "";

function createAuthenticatedRequest(url = "http://example.com/tickets/ticket-1/edit") {
  return new Request(url, {
    headers: {
      cookie: sessionCookieHeader,
    },
  });
}

function seedAuthentication() {
  const timestamp = now.getTime();

  database
    .insert(schema.users)
    .values({
      id: userId,
      email: userEmail,
      passwordHash: "hash",
      emailVerifiedAt: timestamp,
      createdAt: timestamp,
    })
    .run();

  database
    .insert(schema.sessions)
    .values({
      id: sessionId,
      userId,
      createdAt: timestamp,
      expiresAt: timestamp + 24 * 60 * 60 * 1000,
    })
    .run();
}

function createTeamForTest(name: string) {
  return createTeam(database, { name }, { now: () => now })._unsafeUnwrap();
}

function createEpicForTest(teamId: string, title: string) {
  return createEpic(
    database,
    {
      teamId,
      title,
      description: null,
    },
    { now: () => now },
  )._unsafeUnwrap();
}

function createTicketForTest(input: {
  teamId: string;
  epicId?: string | null;
  title: string;
  type: "feature" | "bug" | "task";
  state: "backlog" | "todo" | "in-progress" | "done";
}) {
  return createTicket(
    database,
    {
      teamId: input.teamId,
      epicId: input.epicId ?? null,
      createdBy: userId,
      title: input.title,
      body: "Ticket body",
      type: input.type,
      state: input.state,
    },
    { now: () => now },
  )._unsafeUnwrap();
}

beforeAll(async () => {
  sessionCookieHeader = (await createSessionCookie(sessionId)).split(";")[0];
});

beforeEach(() => {
  sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
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

    CREATE TABLE email_verification_tokens (
      id text PRIMARY KEY NOT NULL,
      user_id text NOT NULL REFERENCES users(id) ON DELETE cascade,
      token_hash text NOT NULL UNIQUE,
      expires_at integer NOT NULL,
      used_at integer,
      invalidated_at integer,
      created_at integer NOT NULL
    );

    CREATE TABLE password_reset_tokens (
      id text PRIMARY KEY NOT NULL,
      user_id text NOT NULL REFERENCES users(id) ON DELETE cascade,
      token_hash text NOT NULL UNIQUE,
      expires_at integer NOT NULL,
      used_at integer,
      invalidated_at integer,
      created_at integer NOT NULL
    );

    CREATE TABLE sessions (
      id text PRIMARY KEY NOT NULL,
      user_id text NOT NULL REFERENCES users(id) ON DELETE cascade,
      expires_at integer NOT NULL,
      created_at integer NOT NULL
    );
  `);
  database = drizzle(sqlite, { schema });
  clientServerState.db = database;
  seedAuthentication();
});

describe("ticket edit route", () => {
  it("loads the ticket, teams, and selected-team epics for an authenticated request", async () => {
    const platform = createTeamForTest("Platform");
    const product = createTeamForTest("Product");
    const platformEpic = createEpicForTest(platform.id, "Platform Launch");
    createEpicForTest(product.id, "Product Discovery");
    const ticket = createTicketForTest({
      teamId: platform.id,
      epicId: platformEpic.id,
      title: "Create service",
      type: "feature",
      state: "backlog",
    });

    await expect(
      loader({
        request: createAuthenticatedRequest(`http://example.com/tickets/${ticket.id}/edit`),
        params: {
          ticketId: ticket.id,
        },
      }),
    ).resolves.toEqual({
      status: "found",
      ticket: {
        ...ticket,
        teamName: "Platform",
        epicTitle: "Platform Launch",
        createdByEmail: userEmail,
      },
      teams: [
        {
          id: platform.id,
          name: "Platform",
          normalizedName: "platform",
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
        {
          id: product.id,
          name: "Product",
          normalizedName: "product",
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      ],
      epics: [
        {
          id: platformEpic.id,
          teamId: platform.id,
          title: "Platform Launch",
          description: null,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      ],
      userEmail,
    });
  });

  it("returns not-found for unknown ticket ids after authentication", async () => {
    await expect(
      loader({
        request: createAuthenticatedRequest("http://example.com/tickets/missing-ticket/edit"),
        params: {
          ticketId: "missing-ticket",
        },
      }),
    ).resolves.toEqual({
      status: "not-found",
      ticketId: "missing-ticket",
      userEmail,
      teams: [],
    });
  });

  it("loads selected-team epics only for the ticket team", async () => {
    const platform = createTeamForTest("Platform");
    const product = createTeamForTest("Product");
    createEpicForTest(platform.id, "Platform Launch");
    createEpicForTest(platform.id, "Platform Discovery");
    const productEpic = createEpicForTest(product.id, "Product Discovery");
    const ticket = createTicketForTest({
      teamId: product.id,
      epicId: productEpic.id,
      title: "Product ticket",
      type: "feature",
      state: "todo",
    });

    const data = await loader({
      request: createAuthenticatedRequest(`http://example.com/tickets/${ticket.id}/edit`),
      params: {
        ticketId: ticket.id,
      },
    });

    expect(data.status).toBe("found");
    if (data.status !== "found") {
      throw new Error("Expected a found ticket edit loader response.");
    }

    expect(data.epics).toEqual([
      {
        id: productEpic.id,
        teamId: product.id,
        title: "Product Discovery",
        description: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    ]);
    expect(data.ticket.teamId).toBe(product.id);
  });

  it("loads the teams list for authenticated requests", async () => {
    const platform = createTeamForTest("Platform");
    const product = createTeamForTest("Product");
    const ticket = createTicketForTest({
      teamId: platform.id,
      title: "Create service",
      type: "feature",
      state: "backlog",
    });

    const data = await loader({
      request: createAuthenticatedRequest(`http://example.com/tickets/${ticket.id}/edit`),
      params: {
        ticketId: ticket.id,
      },
    });

    expect(data.status).toBe("found");
    if (data.status !== "found") {
      throw new Error("Expected a found ticket edit loader response.");
    }

    expect(data.teams).toEqual([
      {
        id: platform.id,
        name: "Platform",
        normalizedName: "platform",
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
      {
        id: product.id,
        name: "Product",
        normalizedName: "product",
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    ]);
  });

  it("redirects unauthenticated requests to login", async () => {
    await expect(
      loader({
        request: new Request("http://example.com/tickets/ticket-1/edit"),
        params: {
          ticketId: "ticket-1",
        },
      }),
    ).rejects.toMatchObject({
      status: 302,
    });
  });
});
