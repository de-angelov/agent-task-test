import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "~/db/schema";
import { createEpic } from "~/services/epics/epics.server";
import { createTicket } from "~/services/tickets/tickets.server";
import { createTeam, type AppDb } from "~/services/teams/teams.server";
import { createSessionCookie } from "~/services/session/session.server";

import { handleTicketEditAction, type TicketEditFound } from "./edit.server";
import { action, loader, TicketEditView } from "./edit";

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

async function createAuthedFormRequest(
  ticketId: string,
  values: Record<string, string> = {},
) {
  const cookie = await createSessionCookie(sessionId);

  return new Request(`http://example.com/tickets/${ticketId}/edit`, {
    body: createFormData(values),
    headers: {
      Cookie: cookie,
    },
    method: "POST",
  });
}

function createFormData(values: Record<string, string>) {
  const formData = new FormData();

  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }

  return formData;
}

function unwrapActionData(result: ReturnType<typeof handleTicketEditAction>) {
  return result as unknown as {
    data: { message: string; status: "error" };
    init: { status: number };
  };
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

function buildFoundEditData(
  overrides: Partial<TicketEditFound> = {},
): TicketEditFound {
  return {
    status: "found",
    userEmail: "user@example.com",
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
        createdAt: "2026-06-30T10:00:00.000Z",
        updatedAt: "2026-06-30T10:00:00.000Z",
      },
    ],
    epics: [
      {
        id: "epic-1",
        teamId: "team-1",
        title: "Launch Plan",
        description: "Coordinate the MVP launch",
        createdAt: "2026-06-30T10:00:00.000Z",
        updatedAt: "2026-06-30T10:00:00.000Z",
      },
    ],
    ...overrides,
  };
}

describe("ticket edit route", () => {
  it("loads the ticket, team list, and team-scoped epics for an authenticated request", async () => {
    const platform = createTeamForTest("Platform");
    const product = createTeamForTest("Product");
    const platformEpic = createEpicForTest(platform.id, "Platform Launch");
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
        epicTitle: "Platform Launch",
        createdByEmail: "user@example.com",
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
          description: "Coordinate the MVP launch",
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      ],
      userEmail: "user@example.com",
    });
  });

  it("returns not-found for missing tickets", async () => {
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
      teams: [],
      userEmail: "user@example.com",
    });
  });

  it("renders the loaded ticket edit form fields", () => {
    const html = renderToString(<TicketEditView data={buildFoundEditData()} />);

    expect(html).toContain("Edit ticket");
    expect(html).toContain('name="teamId"');
    expect(html).toContain('name="epicId"');
    expect(html).toContain('name="type"');
    expect(html).toContain('name="state"');
    expect(html).toContain('name="title"');
    expect(html).toContain('name="body"');
    expect(html).toContain("Platform");
    expect(html).toContain("Launch Plan");
    expect(html).toContain("Save ticket");
  });

  it("populates form fields with the loaded ticket's initial values", () => {
    const html = renderToString(<TicketEditView data={buildFoundEditData()} />);

    expect(html).toContain('value="team-1" selected');
    expect(html).toContain('value="epic-1" selected');
    expect(html).toContain('value="feature" selected');
    expect(html).toContain('value="backlog" selected');
    expect(html).toContain('value="Create service"');
    expect(html).toContain('Create a focused backend service');
  });

  it("shows only the epic options for the ticket's own team", () => {
    const html = renderToString(
      <TicketEditView
        data={buildFoundEditData({
          epics: [
            {
              id: "epic-1",
              teamId: "team-1",
              title: "Launch Plan",
              description: "Coordinate the MVP launch",
              createdAt: "2026-06-30T10:00:00.000Z",
              updatedAt: "2026-06-30T10:00:00.000Z",
            },
            {
              id: "epic-2",
              teamId: "team-1",
              title: "Rollout Plan",
              description: "Coordinate the rollout",
              createdAt: "2026-06-30T10:00:00.000Z",
              updatedAt: "2026-06-30T10:00:00.000Z",
            },
          ],
        })}
      />,
    );

    expect(html).toContain("Launch Plan");
    expect(html).toContain("Rollout Plan");
    expect(html).not.toContain("Product Discovery");
  });

  it("shows the action validation error message", () => {
    const html = renderToString(
      <TicketEditView
        actionData={{ message: "Ticket title is required.", status: "error" }}
        data={buildFoundEditData()}
      />,
    );

    expect(html).toContain("Ticket title is required.");
  });

  it("preserves navigation back to ticket details", () => {
    const html = renderToString(<TicketEditView data={buildFoundEditData()} />);

    expect(html).toContain('href="/tickets/ticket-1"');
    expect(html).toContain("Back to ticket details");
  });

  it("redirects unauthenticated users away from the edit route", async () => {
    await expect(
      loader({ request: new Request("http://example.com/tickets/ticket-1/edit"), params: {} }),
    ).rejects.toMatchObject({
      status: 302,
    });
  });

  it("requires authentication before saving ticket edits", async () => {
    await expect(
      action({
        request: new Request("http://example.com/tickets/ticket-1/edit", {
          body: createFormData({}),
          method: "POST",
        }),
        params: {
          ticketId: "ticket-1",
        },
      }),
    ).rejects.toMatchObject({
      status: 302,
    });
  });

  it("updates a ticket and redirects to ticket details on success", () => {
    const team = createTeamForTest();
    const epic = createEpicForTest(team.id);
    const ticket = createTicket(
      database,
      {
        teamId: team.id,
        createdBy: userId,
        title: "Create service",
        body: "Create a focused backend service",
        type: "feature",
        state: "backlog",
      },
      { now: () => now },
    )._unsafeUnwrap();

    const result = handleTicketEditAction(
      database,
      ticket.id,
      createFormData({
        body: "Updated body",
        epicId: epic.id,
        state: "todo",
        teamId: team.id,
        title: "Updated title",
        type: "bug",
      }),
    ) as Response;

    expect(result.status).toBe(302);
    expect(result.headers.get("Location")).toBe(`/tickets/${ticket.id}`);
    expect(
      database.select().from(schema.tickets).get(),
    ).toMatchObject({
      body: "Updated body",
      epicId: epic.id,
      state: "todo",
      title: "Updated title",
      type: "bug",
    });
  });

  it("returns a validation error when the ticket title is empty", () => {
    const team = createTeamForTest();
    const ticket = createTicket(
      database,
      {
        teamId: team.id,
        createdBy: userId,
        title: "Create service",
        body: "Create a focused backend service",
        type: "feature",
        state: "backlog",
      },
      { now: () => now },
    )._unsafeUnwrap();

    const result = unwrapActionData(
      handleTicketEditAction(
        database,
        ticket.id,
        createFormData({
          body: "Updated body",
          state: "backlog",
          teamId: team.id,
          title: "   ",
          type: "feature",
        }),
      ),
    );

    expect(result.init.status).toBe(400);
    expect(result.data).toEqual({
      message: "Ticket title is required.",
      status: "error",
    });
  });

  it("returns a validation error when the ticket is missing", () => {
    const team = createTeamForTest();

    const result = unwrapActionData(
      handleTicketEditAction(
        database,
        "missing-ticket",
        createFormData({
          body: "Updated body",
          state: "backlog",
          teamId: team.id,
          title: "Updated title",
          type: "feature",
        }),
      ),
    );

    expect(result.init.status).toBe(400);
    expect(result.data).toEqual({
      message: "Ticket not found.",
      status: "error",
    });
  });

  it("returns a validation error when the epic belongs to a different team", () => {
    const team = createTeamForTest("Platform");
    const otherTeam = createTeamForTest("Product");
    const otherTeamEpic = createEpicForTest(otherTeam.id, "Product Discovery");
    const ticket = createTicket(
      database,
      {
        teamId: team.id,
        createdBy: userId,
        title: "Create service",
        body: "Create a focused backend service",
        type: "feature",
        state: "backlog",
      },
      { now: () => now },
    )._unsafeUnwrap();

    const result = unwrapActionData(
      handleTicketEditAction(
        database,
        ticket.id,
        createFormData({
          body: "Updated body",
          epicId: otherTeamEpic.id,
          state: "backlog",
          teamId: team.id,
          title: "Updated title",
          type: "feature",
        }),
      ),
    );

    expect(result.init.status).toBe(400);
    expect(result.data).toEqual({
      message: "Epic must belong to the ticket team.",
      status: "error",
    });
  });

  it("redirects from the authenticated edit route action after saving", async () => {
    const team = createTeamForTest();
    const ticket = createTicket(
      database,
      {
        teamId: team.id,
        createdBy: userId,
        title: "Create service",
        body: "Create a focused backend service",
        type: "feature",
        state: "backlog",
      },
      { now: () => now },
    )._unsafeUnwrap();

    const result = (await action({
      request: await createAuthedFormRequest(ticket.id, {
        body: "Updated through route",
        state: "backlog",
        teamId: team.id,
        title: "Updated through route",
        type: "feature",
      }),
      params: {
        ticketId: ticket.id,
      },
    })) as Response;

    expect(result.status).toBe(302);
    expect(result.headers.get("Location")).toBe(`/tickets/${ticket.id}`);
  });
});
