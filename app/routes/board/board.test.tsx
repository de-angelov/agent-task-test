import Database from "better-sqlite3";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as schema from "~/db/schema";
import { createEpic } from "~/services/epics/epics.server";
import { createTicket } from "~/services/tickets/tickets.server";
import { createTeam, type AppDb } from "~/services/teams/teams.server";

type BoardModule = typeof import("./board");

const now = new Date("2026-06-30T10:00:00.000Z");
const sessionId = "session-1";
const userId = "user-1";
const userEmail = "user@example.com";

const tempDirectory = mkdtempSync(join(tmpdir(), "board-loader-"));
const databasePath = join(tempDirectory, "board.sqlite");

let sqlite: Database.Database;
let database: AppDb;
let board: BoardModule;
let sessionCookieHeader: string;

function createAuthenticatedRequest(url = "http://example.com/board") {
  return new Request(url, {
    headers: {
      cookie: sessionCookieHeader,
    },
  });
}

function seedAuthentication() {
  const timestamp = now.getTime();

  database.insert(schema.users).values({
    id: userId,
    email: userEmail,
    passwordHash: "hash",
    emailVerifiedAt: timestamp,
    createdAt: timestamp,
  }).run();

  database.insert(schema.sessions).values({
    id: sessionId,
    userId,
    createdAt: timestamp,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  }).run();
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
  process.env.DATABASE_URL = databasePath;

  sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE app_metadata (
      id integer PRIMARY KEY AUTOINCREMENT,
      key text NOT NULL UNIQUE,
      value text NOT NULL
    );

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
  const { db: appDb } = await import("~/db/client.server");
  database = appDb as AppDb;
  const { createSessionCookie } = await import(
    "~/services/session/session.server"
  );
  sessionCookieHeader = (await createSessionCookie(sessionId)).split(";")[0];
  board = await import("./board");
});

beforeEach(() => {
  database.delete(schema.sessions).run();
  database.delete(schema.tickets).run();
  database.delete(schema.epics).run();
  database.delete(schema.users).run();
  database.delete(schema.teams).run();

  seedAuthentication();
});

describe("board route", () => {
  it("redirects unauthenticated requests to login", async () => {
    const request = new Request("http://example.com/board");

    await expect(board.loader({ request })).rejects.toMatchObject({
      status: 302,
    });
  });

  it("selects the first team when no team is requested", async () => {
    const platform = createTeamForTest("Platform");
    const product = createTeamForTest("Product");
    const platformEpic = createEpicForTest(platform.id, "Platform Launch");
    const platformTicket = createTicketForTest({
      teamId: platform.id,
      title: "Platform ticket",
      type: "feature",
      state: "backlog",
    });
    createEpicForTest(product.id, "Product Launch");
    createTicketForTest({
      teamId: product.id,
      title: "Product ticket",
      type: "bug",
      state: "todo",
    });

    const data = await board.loader({
      request: createAuthenticatedRequest(),
    });

    expect(data.userEmail).toBe(userEmail);
    expect(data.teams).toMatchObject([
      { id: platform.id, name: "Platform" },
      { id: product.id, name: "Product" },
    ]);
    expect(data.selectedTeamId).toBe(platform.id);
    expect(data.epics).toEqual([platformEpic]);
    expect(data.tickets).toMatchObject([
      {
        id: platformTicket.id,
        teamId: platform.id,
        teamName: "Platform",
        epicTitle: null,
        createdByEmail: userEmail,
        title: "Platform ticket",
        type: "feature",
        state: "backlog",
      },
    ]);
  });

  it("selects an explicitly requested valid team", async () => {
    const platform = createTeamForTest("Platform");
    const product = createTeamForTest("Product");
    createEpicForTest(platform.id, "Platform Launch");
    createTicketForTest({
      teamId: platform.id,
      title: "Platform ticket",
      type: "feature",
      state: "backlog",
    });
    const productEpic = createEpicForTest(product.id, "Product Discovery");
    const productTicket = createTicketForTest({
      teamId: product.id,
      title: "Product ticket",
      type: "task",
      state: "todo",
    });

    const data = await board.loader({
      request: createAuthenticatedRequest(`http://example.com/board?teamId=${product.id}`),
    });

    expect(data.selectedTeamId).toBe(product.id);
    expect(data.userEmail).toBe(userEmail);
    expect(data.epics).toEqual([productEpic]);
    expect(data.tickets).toMatchObject([
      {
        id: productTicket.id,
        teamId: product.id,
        teamName: "Product",
        epicTitle: null,
        createdByEmail: userEmail,
        title: "Product ticket",
        type: "task",
        state: "todo",
      },
    ]);
  });

  it("falls back to the first team when the requested team is invalid", async () => {
    const platform = createTeamForTest("Platform");
    const product = createTeamForTest("Product");
    const platformEpic = createEpicForTest(platform.id, "Platform Launch");
    const platformTicket = createTicketForTest({
      teamId: platform.id,
      title: "Platform ticket",
      type: "feature",
      state: "backlog",
    });
    createEpicForTest(product.id, "Product Discovery");
    createTicketForTest({
      teamId: product.id,
      title: "Product ticket",
      type: "bug",
      state: "todo",
    });

    const data = await board.loader({
      request: createAuthenticatedRequest("http://example.com/board?teamId=missing-team"),
    });

    expect(data.selectedTeamId).toBe(platform.id);
    expect(data.epics).toEqual([platformEpic]);
    expect(data.tickets).toMatchObject([
      {
        id: platformTicket.id,
        teamId: platform.id,
        teamName: "Platform",
        epicTitle: null,
        createdByEmail: userEmail,
        title: "Platform ticket",
        type: "feature",
        state: "backlog",
      },
    ]);
  });

  it("returns an empty board state when no teams exist", async () => {
    const data = await board.loader({
      request: createAuthenticatedRequest(),
    });

    expect(data).toMatchObject({
      teams: [],
      selectedTeamId: "",
      epics: [],
      tickets: [],
      userEmail,
    });
  });

  it("loads epics for the selected team only", async () => {
    const platform = createTeamForTest("Platform");
    const product = createTeamForTest("Product");
    const platformEpic = createEpicForTest(platform.id, "Platform Launch");
    createEpicForTest(product.id, "Product Discovery");

    const data = await board.loader({
      request: createAuthenticatedRequest(`http://example.com/board?teamId=${platform.id}`),
    });

    expect(data.epics).toEqual([platformEpic]);
  });

  it("loads tickets for the selected team only", async () => {
    const platform = createTeamForTest("Platform");
    const product = createTeamForTest("Product");
    const platformTicket = createTicketForTest({
      teamId: platform.id,
      title: "Platform ticket",
      type: "feature",
      state: "backlog",
    });
    createTicketForTest({
      teamId: product.id,
      title: "Product ticket",
      type: "bug",
      state: "todo",
    });

    const data = await board.loader({
      request: createAuthenticatedRequest(`http://example.com/board?teamId=${platform.id}`),
    });

    expect(data.tickets).toMatchObject([
      {
        id: platformTicket.id,
        teamId: platform.id,
        teamName: "Platform",
        epicTitle: null,
        createdByEmail: userEmail,
        title: "Platform ticket",
        type: "feature",
        state: "backlog",
      },
    ]);
  });
});
