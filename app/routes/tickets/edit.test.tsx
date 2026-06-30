import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "~/db/schema";
import { createEpic, listEpics } from "~/services/epics/epics.server";
import { createTicket } from "~/services/tickets/tickets.server";
import { createTeam, type AppDb } from "~/services/teams/teams.server";
import { createSessionCookie } from "~/services/session/session.server";

import { loader, TicketEditView } from "./edit";

const now = new Date("2026-06-30T10:00:00.000Z");
const userId = "user-1";
const sessionId = "session-1";

let sqlite: Database.Database;
let database: AppDb;

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

  database
    .insert(schema.users)
    .values({
      id: userId,
      email: "user@example.com",
      passwordHash: "hash",
      emailVerifiedAt: now.getTime(),
      createdAt: now.getTime(),
    })
    .run();
  database
    .insert(schema.sessions)
    .values({
      id: sessionId,
      userId,
      expiresAt: now.getTime() + 7 * 24 * 60 * 60 * 1000,
      createdAt: now.getTime(),
    })
    .run();
});

async function createAuthedRequest(ticketId?: string) {
  const cookie = await createSessionCookie(sessionId);

  return new Request(`http://example.com/tickets/${ticketId ?? ""}/edit`, {
    headers: {
      Cookie: cookie,
    },
  });
}

function renderEdit(data: Parameters<typeof TicketEditView>[0]["data"]) {
  return renderToString(
    <MemoryRouter>
      <TicketEditView data={data} />
    </MemoryRouter>,
  );
}

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

describe("ticket edit route", () => {
  it("loads the ticket, teams, and team-scoped epics for an authenticated request", async () => {
    const platform = createTeamForTest("Platform");
    const product = createTeamForTest("Product");
    const platformEpic = createEpicForTest(platform.id, "Launch Plan");
    createEpicForTest(platform.id, "Platform Release");
    createEpicForTest(product.id, "Product Discovery");
    const ticket = createTicket(
      database,
      {
        teamId: platform.id,
        epicId: platformEpic.id,
        createdBy: userId,
        title: "Create service",
        body: "Create a focused backend service",
        type: "feature",
        state: "backlog",
      },
      { now: () => now },
    )._unsafeUnwrap();

    await expect(
      loader({
        request: await createAuthedRequest(ticket.id),
        params: {
          ticketId: ticket.id,
        },
      }),
    ).resolves.toEqual({
      status: "found",
      ticket: {
        ...ticket,
        teamName: "Platform",
        epicTitle: "Launch Plan",
        createdByEmail: "user@example.com",
      },
      teams: [platform, product],
      epics: [platformEpic, expect.objectContaining({ id: expect.any(String) })],
      userEmail: "user@example.com",
    });
  });

  it("renders the edit form fields and team-scoped epic options", () => {
    const html = renderEdit({
      status: "found",
      ticket: {
        id: "ticket-1",
        title: "Create service",
        body: "Create a focused backend service",
        type: "feature",
        state: "backlog",
        teamId: "team-1",
        teamName: "Platform",
        epicId: "epic-1",
        epicTitle: "Launch Plan",
        createdBy: userId,
        createdByEmail: "user@example.com",
        createdAt: "2026-06-30T10:00:00.000Z",
        modifiedAt: "2026-06-30T10:30:00.000Z",
      },
      teams: [
        {
          id: "team-1",
          name: "Platform",
          normalizedName: "platform",
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
        {
          id: "team-2",
          name: "Product",
          normalizedName: "product",
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      ],
      epics: [
        {
          id: "epic-1",
          teamId: "team-1",
          title: "Launch Plan",
          description: null,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      ],
      userEmail: "user@example.com",
    });

    expect(html).toContain("Edit ticket");
    expect(html).toContain('name="teamId"');
    expect(html).toContain('name="epicId"');
    expect(html).toContain('name="type"');
    expect(html).toContain('name="state"');
    expect(html).toContain('name="title"');
    expect(html).toContain('name="body"');
    expect(html).toContain("Platform");
    expect(html).toContain("Product");
    expect(html).toContain("Launch Plan");
    expect(html).toContain("Save ticket");
  });

  it("renders a not-found message for missing ticket ids", () => {
    const html = renderEdit({
      status: "not-found",
      ticketId: "missing-ticket",
      teams: [],
      userEmail: "user@example.com",
    });

    expect(html).toContain("Ticket");
    expect(html).toContain("missing-ticket");
    expect(html).toContain("was not found.");
  });

  it("returns not-found for unknown ticket ids after authentication", async () => {
    const team = createTeamForTest();
    createEpicForTest(team.id);

    await expect(
      loader({
        request: await createAuthedRequest("missing-ticket"),
        params: {
          ticketId: "missing-ticket",
        },
      }),
    ).resolves.toEqual({
      status: "not-found",
      ticketId: "missing-ticket",
      teams: [team],
      userEmail: "user@example.com",
    });
  });

  it("shows only epics for the ticket's selected team", async () => {
    const platform = createTeamForTest("Platform");
    const product = createTeamForTest("Product");
    const platformEpics = [
      createEpicForTest(platform.id, "Platform Launch"),
      createEpicForTest(platform.id, "Platform Release"),
    ];
    createEpicForTest(product.id, "Product Discovery");
    const ticket = createTicket(
      database,
      {
        teamId: platform.id,
        epicId: platformEpics[0].id,
        createdBy: userId,
        title: "Create service",
        body: "Create a focused backend service",
        type: "feature",
        state: "backlog",
      },
      { now: () => now },
    )._unsafeUnwrap();

    const data = await loader({
      request: await createAuthedRequest(ticket.id),
      params: {
        ticketId: ticket.id,
      },
    });

    if (data.status !== "found") {
      throw new Error("Expected ticket to be found.");
    }

    expect(data.epics).toEqual(platformEpics);
    expect(data.teams).toEqual([platform, product]);
  });

  it("requires authentication for reads", async () => {
    const request = new Request("http://example.com/tickets/ticket-1/edit");

    await expect(
      loader({
        request,
        params: {
          ticketId: "ticket-1",
        },
      }),
    ).rejects.toMatchObject({
      status: 302,
    });
  });
});
