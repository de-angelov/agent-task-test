import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "~/db/schema";
import { addTicketComment } from "~/services/comments/comments.server";
import { createEpic } from "~/services/epics/epics.server";
import { createTicket } from "~/services/tickets/tickets.server";
import { createTeam, type AppDb } from "~/services/teams/teams.server";
import { createSessionCookie } from "~/services/session/session.server";

import { action, loader, TicketDetailsView } from "./details";
import {
  handleTicketAddCommentAction,
  handleTicketDeleteAction,
} from "./details.server";

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

    CREATE TABLE comments (
      id text PRIMARY KEY NOT NULL,
      ticket_id text NOT NULL,
      author_id text NOT NULL,
      body text NOT NULL,
      created_at text NOT NULL,
      FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE ON UPDATE CASCADE,
      FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE
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

  return new Request(`http://example.com/tickets/${ticketId ?? ""}`, {
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

  return new Request(`http://example.com/tickets/${ticketId}`, {
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

function renderDetails(
  data: Parameters<typeof TicketDetailsView>[0]["data"],
  actionData?: Parameters<typeof TicketDetailsView>[0]["actionData"],
) {
  return renderToString(
    <MemoryRouter>
      <TicketDetailsView actionData={actionData} data={data} />
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

function unwrapActionData(result: ReturnType<typeof handleTicketDeleteAction>) {
  return result as unknown as {
    data: { message: string; status: "error" };
    init: { status: number };
  };
}

function unwrapCommentActionData(
  result: ReturnType<typeof handleTicketAddCommentAction>,
) {
  return result as unknown as {
    data: { message: string; status: "error" };
    init: { status: number };
  };
}

describe("ticket details route", () => {
  it("loads ticket details for an authenticated request", async () => {
    const team = createTeamForTest();
    const epic = createEpicForTest(team.id);
    const ticket = createTicket(
      database,
      {
        teamId: team.id,
        epicId: epic.id,
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
      comments: [],
    });
  });

  it("loads ticket comments oldest first with author display data", async () => {
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

    database
      .insert(schema.users)
      .values({
        id: "user-2",
        email: "reviewer@example.com",
        passwordHash: "hash",
        createdAt: now.getTime(),
      })
      .run();

    const first = addTicketComment(
      database,
      { ticketId: ticket.id, authorId: userId, body: "First" },
      { now: () => new Date("2026-06-30T10:15:00.000Z") },
    )._unsafeUnwrap();

    const second = addTicketComment(
      database,
      { ticketId: ticket.id, authorId: "user-2", body: "Second" },
      { now: () => new Date("2026-06-30T10:30:00.000Z") },
    )._unsafeUnwrap();

    const result = await loader({
      request: await createAuthedRequest(ticket.id),
      params: {
        ticketId: ticket.id,
      },
    });

    expect(result).toMatchObject({
      status: "found",
      comments: [
        {
          id: first.id,
          authorId: userId,
          authorEmail: "user@example.com",
          body: "First",
          createdAt: first.createdAt,
        },
        {
          id: second.id,
          authorId: "user-2",
          authorEmail: "reviewer@example.com",
          body: "Second",
          createdAt: second.createdAt,
        },
      ],
    });
  });

  it("renders ticket fields, navigation, and delete confirmation", () => {
    const html = renderDetails({
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
      comments: [],
    });

    expect(html).toContain("Create service");
    expect(html).toContain("Create a focused backend service");
    expect(html).toContain("<dt>Type</dt><dd>feature</dd>");
    expect(html).toContain("<dt>Team</dt><dd>Platform</dd>");
    expect(html).toContain("<dt>Epic</dt><dd>Launch Plan</dd>");
    expect(html).toContain("<dt>Created by</dt><dd>user@example.com</dd>");
    expect(html).toContain("<dt>Created timestamp</dt><dd><time");
    expect(html).toContain("2026-06-30T10:00:00.000Z</time></dd>");
    expect(html).toContain("<dt>Modified timestamp</dt><dd><time");
    expect(html).toContain("2026-06-30T10:30:00.000Z</time></dd>");
    expect(html).toContain('href="/tickets/ticket-1/edit"');
    expect(html.match(/href="\/tickets\/ticket-1\/edit"/g)).toHaveLength(1);
    expect(html).toContain('method="post"');
    expect(html).toContain('name="confirmDelete"');
    expect(html).toContain('value="yes"');
    expect(html).toContain("Confirm deletion");
    expect(html).toContain("Delete ticket");
  });

  it("renders No epic when the ticket has no epic", () => {
    const html = renderDetails({
      status: "found",
      ticket: {
        id: "ticket-1",
        title: "Create service",
        body: "Create a focused backend service",
        type: "feature",
        state: "todo",
        teamId: "team-1",
        teamName: "Platform",
        epicId: null,
        epicTitle: null,
        createdBy: userId,
        createdByEmail: "user@example.com",
        createdAt: "2026-06-30T10:00:00.000Z",
        modifiedAt: "2026-06-30T10:30:00.000Z",
      },
      comments: [],
    });

    expect(html).toContain("<dt>Epic</dt><dd>No epic</dd>");
  });

  it("renders delete validation errors returned by the action", () => {
    const html = renderDetails(
      {
        status: "found",
        ticket: {
          id: "ticket-1",
          title: "Create service",
          body: "Create a focused backend service",
          type: "feature",
          state: "todo",
          teamId: "team-1",
          teamName: "Platform",
          epicId: null,
          epicTitle: null,
          createdBy: userId,
          createdByEmail: "user@example.com",
          createdAt: "2026-06-30T10:00:00.000Z",
          modifiedAt: "2026-06-30T10:30:00.000Z",
        },
        comments: [],
      },
      {
        message: "Confirm deletion before deleting this ticket.",
        status: "error",
      },
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain("Confirm deletion before deleting this ticket.");
  });

  it("renders comments in chronological order with author and timestamp", () => {
    const html = renderDetails({
      status: "found",
      ticket: {
        id: "ticket-1",
        title: "Create service",
        body: "Create a focused backend service",
        type: "feature",
        state: "backlog",
        teamId: "team-1",
        teamName: "Platform",
        epicId: null,
        epicTitle: null,
        createdBy: userId,
        createdByEmail: "user@example.com",
        createdAt: "2026-06-30T10:00:00.000Z",
        modifiedAt: "2026-06-30T10:30:00.000Z",
      },
      comments: [
        {
          id: "comment-1",
          ticketId: "ticket-1",
          authorId: userId,
          authorEmail: "user@example.com",
          body: "First comment",
          createdAt: "2026-06-30T10:15:00.000Z",
        },
        {
          id: "comment-2",
          ticketId: "ticket-1",
          authorId: "user-2",
          authorEmail: "reviewer@example.com",
          body: "Second comment",
          createdAt: "2026-06-30T10:30:00.000Z",
        },
      ],
    });

    expect(html).toContain("Comments");
    expect(html.indexOf("First comment")).toBeLessThan(
      html.indexOf("Second comment"),
    );
    expect(html).toContain("user@example.com");
    expect(html).toContain("reviewer@example.com");
    expect(html).toContain('<time dateTime="2026-06-30T10:15:00.000Z">');
    expect(html).toContain('<time dateTime="2026-06-30T10:30:00.000Z">');
  });

  it("renders a message when there are no comments yet", () => {
    const html = renderDetails({
      status: "found",
      ticket: {
        id: "ticket-1",
        title: "Create service",
        body: "Create a focused backend service",
        type: "feature",
        state: "backlog",
        teamId: "team-1",
        teamName: "Platform",
        epicId: null,
        epicTitle: null,
        createdBy: userId,
        createdByEmail: "user@example.com",
        createdAt: "2026-06-30T10:00:00.000Z",
        modifiedAt: "2026-06-30T10:30:00.000Z",
      },
      comments: [],
    });

    expect(html).toContain("No comments yet.");
  });

  it("renders an add-comment form", () => {
    const html = renderDetails({
      status: "found",
      ticket: {
        id: "ticket-1",
        title: "Create service",
        body: "Create a focused backend service",
        type: "feature",
        state: "backlog",
        teamId: "team-1",
        teamName: "Platform",
        epicId: null,
        epicTitle: null,
        createdBy: userId,
        createdByEmail: "user@example.com",
        createdAt: "2026-06-30T10:00:00.000Z",
        modifiedAt: "2026-06-30T10:30:00.000Z",
      },
      comments: [],
    });

    expect(html).toContain("Add comment");
    expect(html).toContain('name="intent"');
    expect(html).toContain('value="add-comment"');
    expect(html).toContain('name="body"');
    expect(html).toMatch(/<textarea[^>]*name="body"/);
  });

  it("renders validation errors returned by the add-comment action", () => {
    const html = renderDetails(
      {
        status: "found",
        ticket: {
          id: "ticket-1",
          title: "Create service",
          body: "Create a focused backend service",
          type: "feature",
          state: "backlog",
          teamId: "team-1",
          teamName: "Platform",
          epicId: null,
          epicTitle: null,
          createdBy: userId,
          createdByEmail: "user@example.com",
          createdAt: "2026-06-30T10:00:00.000Z",
          modifiedAt: "2026-06-30T10:30:00.000Z",
        },
        comments: [],
      },
      {
        message: "Comment cannot be empty.",
        status: "error",
      },
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain("Comment cannot be empty.");
  });

  it.each([
    ["backlog", "Backlog"],
    ["todo", "Todo"],
    ["in-progress", "In progress"],
    ["done", "Done"],
] as const)("maps %s to %s", (state, label) => {
    const html = renderDetails({
      status: "found",
      ticket: {
        id: "ticket-1",
        title: "Create service",
        body: "Create a focused backend service",
        type: "feature",
        state,
        teamId: "team-1",
        teamName: "Platform",
        epicId: null,
        epicTitle: null,
        createdBy: userId,
        createdByEmail: "user@example.com",
        createdAt: "2026-06-30T10:00:00.000Z",
        modifiedAt: "2026-06-30T10:30:00.000Z",
      },
      comments: [],
    });

    expect(html).toContain(`<dt>State</dt><dd>${label}</dd>`);
  });

  it("renders a not-found message for missing ticket ids", () => {
    const html = renderDetails({
      status: "not-found",
      ticketId: "missing-ticket",
    });

    expect(html).toContain("Ticket");
    expect(html).toContain("missing-ticket");
    expect(html).toContain("was not found.");
    expect(html).not.toContain('/tickets/missing-ticket/edit');
  });

  it("returns not-found for unknown ticket ids after authentication", async () => {
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
    });
  });

  it("requires authentication before reading details", async () => {
    await expect(
      loader({
        request: new Request("http://example.com/tickets/ticket-1"),
        params: {
          ticketId: "ticket-1",
        },
      }),
    ).rejects.toMatchObject({
      status: 302,
    });
  });

  it("requires authentication before deleting tickets", async () => {
    await expect(
      action({
        request: new Request("http://example.com/tickets/ticket-1", {
          body: createFormData({ confirmDelete: "yes" }),
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

  it("returns a validation error when delete confirmation is missing", () => {
    const team = createTeamForTest();
    const ticket = createTicket(
      database,
      {
        teamId: team.id,
        createdBy: userId,
        title: "Keep ticket",
        body: "Do not delete without confirmation",
        type: "feature",
        state: "backlog",
      },
      { now: () => now },
    )._unsafeUnwrap();

    const result = unwrapActionData(
      handleTicketDeleteAction(database, ticket.id, createFormData({})),
    );

    expect(result.init.status).toBe(400);
    expect(result.data).toEqual({
      message: "Confirm deletion before deleting this ticket.",
      status: "error",
    });
    expect(
      database
        .select({ id: schema.tickets.id })
        .from(schema.tickets)
        .get(),
    ).toEqual({ id: ticket.id });
  });

  it("deletes a confirmed ticket and redirects to the board", () => {
    const team = createTeamForTest();
    const ticket = createTicket(
      database,
      {
        teamId: team.id,
        createdBy: userId,
        title: "Delete ticket",
        body: "Delete after confirmation",
        type: "feature",
        state: "backlog",
      },
      { now: () => now },
    )._unsafeUnwrap();

    const result = handleTicketDeleteAction(
      database,
      ticket.id,
      createFormData({ confirmDelete: "yes" }),
    ) as Response;

    expect(result.status).toBe(302);
    expect(result.headers.get("Location")).toBe("/board");
    expect(database.select().from(schema.tickets).get()).toBeUndefined();
  });

  it("returns a validation error when the confirmed ticket is missing", () => {
    const result = unwrapActionData(
      handleTicketDeleteAction(
        database,
        "missing-ticket",
        createFormData({ confirmDelete: "yes" }),
      ),
    );

    expect(result.init.status).toBe(400);
    expect(result.data).toEqual({
      message: "Ticket not found.",
      status: "error",
    });
  });

  it("redirects from the authenticated delete route action after deletion", async () => {
    const team = createTeamForTest();
    const ticket = createTicket(
      database,
      {
        teamId: team.id,
        createdBy: userId,
        title: "Delete through route",
        body: "Invoke the authenticated route action",
        type: "feature",
        state: "backlog",
      },
      { now: () => now },
    )._unsafeUnwrap();

    const result = (await action({
      request: await createAuthedFormRequest(ticket.id, {
        confirmDelete: "yes",
      }),
      params: {
        ticketId: ticket.id,
      },
    })) as Response;

    expect(result.status).toBe(302);
    expect(result.headers.get("Location")).toBe("/board");
    expect(database.select().from(schema.tickets).get()).toBeUndefined();
  });

  it("requires authentication before adding a comment", async () => {
    await expect(
      action({
        request: new Request("http://example.com/tickets/ticket-1", {
          body: createFormData({ body: "Looks good", intent: "add-comment" }),
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

  it("adds a comment for a valid submission", () => {
    const team = createTeamForTest();
    const ticket = createTicket(
      database,
      {
        teamId: team.id,
        createdBy: userId,
        title: "Review ticket",
        body: "Needs a second pair of eyes",
        type: "feature",
        state: "backlog",
      },
      { now: () => now },
    )._unsafeUnwrap();

    const result = handleTicketAddCommentAction(
      database,
      ticket.id,
      userId,
      createFormData({ body: "Looks good to me" }),
    ) as Response;

    expect(result.status).toBe(302);
    expect(result.headers.get("Location")).toBe(`/tickets/${ticket.id}`);
    expect(
      database.select().from(schema.comments).get(),
    ).toMatchObject({ authorId: userId, body: "Looks good to me" });
  });

  it("returns a validation error when the comment body is empty", () => {
    const team = createTeamForTest();
    const ticket = createTicket(
      database,
      {
        teamId: team.id,
        createdBy: userId,
        title: "Review ticket",
        body: "Needs a second pair of eyes",
        type: "feature",
        state: "backlog",
      },
      { now: () => now },
    )._unsafeUnwrap();

    const result = unwrapCommentActionData(
      handleTicketAddCommentAction(
        database,
        ticket.id,
        userId,
        createFormData({ body: "   " }),
      ),
    );

    expect(result.init.status).toBe(400);
    expect(result.data).toEqual({
      message: "Comment cannot be empty.",
      status: "error",
    });
    expect(database.select().from(schema.comments).get()).toBeUndefined();
  });

  it("returns a validation error when the commented ticket is missing", () => {
    const result = unwrapCommentActionData(
      handleTicketAddCommentAction(
        database,
        "missing-ticket",
        userId,
        createFormData({ body: "Looks good to me" }),
      ),
    );

    expect(result.init.status).toBe(400);
    expect(result.data).toEqual({
      message: "Ticket not found.",
      status: "error",
    });
  });

  it("adds a comment through the authenticated route action and redirects", async () => {
    const team = createTeamForTest();
    const ticket = createTicket(
      database,
      {
        teamId: team.id,
        createdBy: userId,
        title: "Review ticket",
        body: "Needs a second pair of eyes",
        type: "feature",
        state: "backlog",
      },
      { now: () => now },
    )._unsafeUnwrap();

    const result = (await action({
      request: await createAuthedFormRequest(ticket.id, {
        body: "Looks good to me",
        intent: "add-comment",
      }),
      params: {
        ticketId: ticket.id,
      },
    })) as Response;

    expect(result.status).toBe(302);
    expect(result.headers.get("Location")).toBe(`/tickets/${ticket.id}`);
    expect(
      database.select().from(schema.comments).get(),
    ).toMatchObject({ authorId: userId, body: "Looks good to me" });
  });
});
