import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "~/db/schema";
import { createEpic } from "~/services/epics/epics.server";
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

function createTicketForTest(input: { teamId: string; epicId?: string | null }) {
  return createTicket(
    database,
    {
      teamId: input.teamId,
      epicId: input.epicId ?? null,
      createdBy: userId,
      title: "Create service",
      body: "Create a focused backend service",
      type: "feature",
      state: "backlog",
    },
    { now: () => now },
  )._unsafeUnwrap();
}

function renderEdit(data: Parameters<typeof TicketEditView>[0]["data"]) {
  return renderToString(
    <MemoryRouter>
      <TicketEditView data={data} />
    </MemoryRouter>,
  );
}

describe("ticket edit route", () => {
  it("loads the ticket, team list, and selected-team epics for an authenticated request", async () => {
    const platform = createTeamForTest("Platform");
    const product = createTeamForTest("Product");
    const platformEpic = createEpicForTest(platform.id, "Platform Launch");
    createEpicForTest(product.id, "Product Discovery");
    const ticket = createTicketForTest({
      teamId: platform.id,
      epicId: platformEpic.id,
    });

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
        epicTitle: "Platform Launch",
        createdByEmail: "user@example.com",
      },
      teams: [platform, product],
      epics: [platformEpic],
      userEmail: "user@example.com",
    });
  });

  it("returns a not-found state for unknown ticket ids", async () => {
    const platform = createTeamForTest("Platform");
    createTeamForTest("Product");

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
      teams: [platform, expect.anything()],
      userEmail: "user@example.com",
    });
  });

  it("renders the edit form with loaded ticket data", () => {
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
      ],
      epics: [
        {
          id: "epic-1",
          teamId: "team-1",
          title: "Launch Plan",
          description: "Coordinate the MVP launch",
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      ],
      userEmail: "user@example.com",
    });

    expect(html).toContain("Edit ticket");
    expect(html).toContain("Ticket details");
    expect(html).toContain('name="teamId"');
    expect(html).toContain('name="epicId"');
    expect(html).toContain('name="title"');
    expect(html).toContain('name="body"');
    expect(html).toContain("Platform");
    expect(html).toContain("Launch Plan");
    expect(html).toContain("Create service");
  });

  it("loads only the selected ticket team epics", async () => {
    const platform = createTeamForTest("Platform");
    const product = createTeamForTest("Product");
    const platformEpic = createEpicForTest(platform.id, "Platform Launch");
    createEpicForTest(product.id, "Product Discovery");
    const ticket = createTicketForTest({
      teamId: platform.id,
      epicId: null,
    });

    const data = await loader({
      request: await createAuthedRequest(ticket.id),
      params: {
        ticketId: ticket.id,
      },
    });

    if (data.status !== "found") {
      throw new Error("Expected the ticket to be found.");
    }

    expect(data.epics).toEqual([platformEpic]);
    expect(data.teams).toHaveLength(2);
    expect(data.teams.map((team) => team.name)).toEqual(["Platform", "Product"]);
  });

  it("requires authentication before loading the edit screen", async () => {
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
