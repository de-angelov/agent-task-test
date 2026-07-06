import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { renderToString } from "react-dom/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "~/db/schema";
import { createEpic } from "~/services/epics/epics.server";
import type { TicketState, TicketType } from "~/services/tickets/ticket-workflow";
import { createTicket } from "~/services/tickets/tickets.server";
import type { TicketReadModel } from "~/services/tickets/tickets.server";
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

function createAuthenticatedFormRequest(formData: FormData) {
  return new Request("http://example.com/board", {
    body: formData,
    headers: {
      cookie: sessionCookieHeader,
    },
    method: "POST",
  });
}

function createFormData(entries: Record<string, string>) {
  const formData = new FormData();

  Object.entries(entries).forEach(([key, value]) => {
    formData.set(key, value);
  });

  return formData;
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

function makeTicketReadModel(input: {
  id: string;
  title: string;
  state: TicketState;
  epicTitle?: string | null;
  modifiedAt?: string;
  type?: TicketType;
}): TicketReadModel {
  return {
    id: input.id,
    title: input.title,
    body: "Ticket body",
    type: input.type ?? "feature",
    state: input.state,
    teamId: "team-1",
    teamName: "Platform",
    epicId: input.epicTitle ? "epic-1" : null,
    epicTitle: input.epicTitle ?? null,
    createdBy: userId,
    createdByEmail: userEmail,
    createdAt: "2026-06-30T09:00:00.000Z",
    modifiedAt: input.modifiedAt ?? "2026-06-30T10:00:00.000Z",
  };
}

function unwrapActionData<TStatus extends string = "error">(
  result: Awaited<ReturnType<BoardModule["action"]>>,
) {
  return result as unknown as {
    data: { message: string; status: TStatus };
    init: { status: number };
  };
}

function stubBoardFetch() {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const result = unwrapActionData<"success" | "error">(
      await board.action({
        request: createAuthenticatedFormRequest(init?.body as FormData),
      }),
    );

    return new Response(JSON.stringify(result.data), {
      status: result.init.status,
    });
  });

  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

function stubSuccessfulBoardFetch() {
  return vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(
        JSON.stringify({ message: "Ticket state updated.", status: "success" }),
        { status: 200 },
      ),
  );
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("board route", () => {
  it("renders exactly four workflow columns in order", () => {
    const html = renderToString(<board.BoardView tickets={[]} />);

    expect(html.match(/class="kanban-column"/g)).toHaveLength(4);
    expect(html.indexOf("<h2>backlog</h2>")).toBeLessThan(
      html.indexOf("<h2>todo</h2>"),
    );
    expect(html.indexOf("<h2>todo</h2>")).toBeLessThan(
      html.indexOf("<h2>in-progress</h2>"),
    );
    expect(html.indexOf("<h2>in-progress</h2>")).toBeLessThan(
      html.indexOf("<h2>done</h2>"),
    );
  });

  it("renders the authenticated shell navigation with the signed-in user's email", () => {
    const html = renderToString(
      <board.BoardView tickets={[]} userEmail="member@example.com" />,
    );

    expect(html).toContain("TICKET TRACKER");
    expect(html).toContain('href="/board"');
    expect(html).toContain('href="/teams"');
    expect(html).toContain('href="/epics"');
    expect(html).toContain("member@example.com");
  });

  it("includes empty columns when no tickets are loaded", () => {
    expect(board.getBoardColumns([])).toEqual([
      { state: "backlog", tickets: [] },
      { state: "todo", tickets: [] },
      { state: "in-progress", tickets: [] },
      { state: "done", tickets: [] },
    ]);
  });

  it("groups loaded tickets by workflow state", () => {
    const backlogTicket = makeTicketReadModel({
      id: "ticket-1",
      title: "Backlog ticket",
      state: "backlog",
    });
    const doneTicket = makeTicketReadModel({
      id: "ticket-2",
      title: "Done ticket",
      state: "done",
    });

    expect(board.getBoardColumns([doneTicket, backlogTicket])).toEqual([
      { state: "backlog", tickets: [backlogTicket] },
      { state: "todo", tickets: [] },
      { state: "in-progress", tickets: [] },
      { state: "done", tickets: [doneTicket] },
    ]);
  });

  it("renders selected-team tickets as cards in their workflow columns", () => {
    const backlogTicket = makeTicketReadModel({
      id: "ticket-1",
      title: "Backlog ticket",
      state: "backlog",
      type: "bug",
      epicTitle: "Platform Launch",
    });
    const doneTicket = makeTicketReadModel({
      id: "ticket-2",
      title: "Done ticket",
      state: "done",
      type: "task",
    });

    const html = renderToString(
      <board.BoardView tickets={[doneTicket, backlogTicket]} />,
    );

    expect(html).toContain('<a aria-label="Open ticket Backlog ticket"');
    expect(html).toContain('<strong>Backlog ticket</strong>');
    expect(html).toContain("<span>bug</span>");
    expect(html).toContain("<span>Platform Launch</span>");
    expect(html.indexOf("<h2>backlog</h2>")).toBeLessThan(
      html.indexOf("<strong>Backlog ticket</strong>"),
    );
    expect(html.indexOf("<h2>done</h2>")).toBeLessThan(
      html.indexOf("<strong>Done ticket</strong>"),
    );
  });

  it("renders a missing epic fallback on ticket cards", () => {
    const ticket = makeTicketReadModel({
      id: "ticket-1",
      title: "Unplanned ticket",
      state: "todo",
    });

    const html = renderToString(<board.BoardView tickets={[ticket]} />);

    expect(html).toContain("<span>No epic</span>");
  });

  describe("board drag interaction", () => {
    it("marks ticket cards as native HTML5 draggable elements", () => {
      const ticket = makeTicketReadModel({
        id: "ticket-1",
        title: "Backlog ticket",
        state: "backlog",
      });

      const html = renderToString(<board.BoardView tickets={[ticket]} />);

      expect(html).toContain('draggable="true"');
    });

    describe("moveTicketState", () => {
      it("moves a ticket to the column it was dropped on", () => {
        const ticket = makeTicketReadModel({
          id: "ticket-1",
          title: "Backlog ticket",
          state: "backlog",
        });

        expect(board.moveTicketState([ticket], "ticket-1", "done")).toEqual([
          { ...ticket, state: "done" },
        ]);
      });

      it("is a no-op when dropped back on its own column", () => {
        const ticket = makeTicketReadModel({
          id: "ticket-1",
          title: "Backlog ticket",
          state: "backlog",
        });

        const moved = board.moveTicketState([ticket], "ticket-1", "backlog");

        expect(moved[0]).toBe(ticket);
      });

      it("leaves tickets other than the dragged one untouched", () => {
        const movedTicket = makeTicketReadModel({
          id: "ticket-1",
          title: "Moved ticket",
          state: "backlog",
        });
        const otherTicket = makeTicketReadModel({
          id: "ticket-2",
          title: "Other ticket",
          state: "todo",
        });

        const moved = board.moveTicketState(
          [movedTicket, otherTicket],
          movedTicket.id,
          "done",
        );

        expect(moved[1]).toBe(otherTicket);
      });
    });

    // This repo has no jsdom, so a real HTML5 dragstart/dragover/drop sequence
    // can't be dispatched here. The column's onDrop handler drives a card move
    // by calling the same moveTicketState update this exercises directly, so
    // this renders the result, matching this file's existing SSR-only test
    // pattern.
    it("renders a card under its target column after a cross-column drop completes", () => {
      const ticket = makeTicketReadModel({
        id: "ticket-1",
        title: "Backlog ticket",
        state: "backlog",
      });

      const ticketsAfterDrop = board.moveTicketState([ticket], ticket.id, "done");

      const html = renderToString(<board.BoardView tickets={ticketsAfterDrop} />);

      expect(html.indexOf("<h2>done</h2>")).toBeLessThan(
        html.indexOf("<strong>Backlog ticket</strong>"),
      );
    });

    it("does not render the drag-and-drop placeholder notice", () => {
      const html = renderToString(<board.BoardView tickets={[]} />);

      expect(html).not.toContain(
        "Drag-and-drop persistence will connect to backend services later.",
      );
    });

    describe("persistTicketDrop", () => {
      it("submits the update-state intent with the target state and expected timestamp", async () => {
        const fetchMock = stubSuccessfulBoardFetch();
        vi.stubGlobal("fetch", fetchMock);

        const outcome = await board.persistTicketDrop({
          ticketId: "ticket-1",
          targetState: "done",
          previousState: "backlog",
          expectedModifiedAt: "2026-06-30T10:00:00.000Z",
        });

        expect(outcome).toEqual({ outcome: "persisted" });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("/board");
        expect(init?.method).toBe("POST");
        const body = init?.body as FormData;
        expect(body.get("intent")).toBe("update-state");
        expect(body.get("ticketId")).toBe("ticket-1");
        expect(body.get("state")).toBe("done");
        expect(body.get("expectedModifiedAt")).toBe("2026-06-30T10:00:00.000Z");
      });

      it("omits expectedModifiedAt from the request when none is known", async () => {
        const fetchMock = stubSuccessfulBoardFetch();
        vi.stubGlobal("fetch", fetchMock);

        await board.persistTicketDrop({
          ticketId: "ticket-1",
          targetState: "done",
          previousState: "backlog",
          expectedModifiedAt: null,
        });

        const [, init] = fetchMock.mock.calls[0];
        const body = init?.body as FormData;
        expect(body.has("expectedModifiedAt")).toBe(false);
      });

      it("persists a successful drag through the real board state-update action", async () => {
        const team = createTeamForTest("Platform");
        const ticket = createTicketForTest({
          teamId: team.id,
          title: "Backlog ticket",
          type: "feature",
          state: "backlog",
        });
        stubBoardFetch();

        const outcome = await board.persistTicketDrop({
          ticketId: ticket.id,
          targetState: "done",
          previousState: "backlog",
          expectedModifiedAt: ticket.modifiedAt,
        });

        expect(outcome).toEqual({ outcome: "persisted" });
        expect(
          database.select().from(schema.tickets).where(eq(schema.tickets.id, ticket.id)).get(),
        ).toMatchObject({ state: "done" });
      });

      it("returns a rollback outcome with the server error message when the action rejects the move", async () => {
        const team = createTeamForTest("Platform");
        const ticket = createTicketForTest({
          teamId: team.id,
          title: "Backlog ticket",
          type: "feature",
          state: "backlog",
        });
        stubBoardFetch();

        const outcome = await board.persistTicketDrop({
          ticketId: ticket.id,
          targetState: "done",
          previousState: "backlog",
          expectedModifiedAt: "2020-01-01T00:00:00.000Z",
        });

        expect(outcome).toEqual({
          outcome: "rolled-back",
          ticketId: ticket.id,
          previousState: "backlog",
          message: "Ticket was updated elsewhere. Reload and try again.",
        });
        expect(
          database.select().from(schema.tickets).where(eq(schema.tickets.id, ticket.id)).get(),
        ).toMatchObject({ state: "backlog" });
      });

      it("returns a generic rollback outcome when the persistence request itself fails", async () => {
        vi.stubGlobal(
          "fetch",
          vi.fn(async () => {
            throw new Error("network down");
          }),
        );

        const outcome = await board.persistTicketDrop({
          ticketId: "ticket-1",
          targetState: "done",
          previousState: "backlog",
          expectedModifiedAt: null,
        });

        expect(outcome).toEqual({
          outcome: "rolled-back",
          ticketId: "ticket-1",
          previousState: "backlog",
          message: "Unable to save the ticket move. Try again.",
        });
      });
    });

    it("reflects a persisted drag move in the board loader after a refresh", async () => {
      const team = createTeamForTest("Platform");
      const ticket = createTicketForTest({
        teamId: team.id,
        title: "Backlog ticket",
        type: "feature",
        state: "backlog",
      });

      await board.action({
        request: createAuthenticatedFormRequest(
          createFormData({
            intent: "update-state",
            ticketId: ticket.id,
            state: "done",
          }),
        ),
      });

      const data = await board.loader({
        request: createAuthenticatedRequest(`http://example.com/board?teamId=${team.id}`),
      });

      expect(data.tickets).toMatchObject([{ id: ticket.id, state: "done" }]);
    });
  });

  describe("board filter controls", () => {
    const epicOption = {
      id: "epic-1",
      teamId: "team-1",
      title: "Platform Launch",
      description: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    it("renders ticket type, epic, and search controls with no active filters", () => {
      const html = renderToString(
        <board.BoardView epics={[epicOption]} selectedTeamId="team-1" />,
      );

      expect(html).toContain('name="type"');
      expect(html).toContain('name="epicId"');
      expect(html).toContain('name="search"');
      expect(html).toContain('<option value="" selected="">All types</option>');
      expect(html).toContain('<option value="feature">feature</option>');
      expect(html).toContain('<option value="bug">bug</option>');
      expect(html).toContain('<option value="task">task</option>');
      expect(html).toContain('<option value="" selected="">All epics</option>');
      expect(html).toContain('<option value="epic-1">Platform Launch</option>');
    });

    it("reflects active filter values from the current URL query", () => {
      const html = renderToString(
        <board.BoardView
          epics={[epicOption]}
          filters={{ type: "bug", epicId: "epic-1", search: "login" }}
          selectedTeamId="team-1"
        />,
      );

      expect(html).toContain('<option value="bug" selected="">bug</option>');
      expect(html).toContain(
        '<option value="epic-1" selected="">Platform Launch</option>',
      );
      expect(html).toContain('value="login"');
    });

    it("renders a clear-filters action that resets the query for the selected team", () => {
      const html = renderToString(
        <board.BoardView selectedTeamId="team-1" />,
      );

      expect(html).toContain('href="/board?teamId=team-1"');
      expect(html).toContain("Clear filters");
    });

    it("renders a clear-filters action without a team query when no team is selected", () => {
      const html = renderToString(<board.BoardView />);

      expect(html).toContain('href="/board"');
      expect(html).toContain("Clear filters");
    });

    it("renders only the filtered tickets passed to the view in their columns", () => {
      const bugTicket = makeTicketReadModel({
        id: "ticket-1",
        title: "Fix login redirect",
        state: "todo",
        type: "bug",
      });

      const html = renderToString(
        <board.BoardView
          filters={{ type: "bug", epicId: null, search: "" }}
          tickets={[bugTicket]}
        />,
      );

      expect(html).toContain("<strong>Fix login redirect</strong>");
      expect(html.match(/class="ticket-card"/g)).toHaveLength(1);
    });
  });

  it("renders the create-ticket dialog entry instead of a primary link", () => {
    const html = renderToString(<board.BoardView selectedTeamId="team-1" />);

    expect(html).toContain("<button");
    expect(html).toContain("Create ticket");
    expect(html).toContain("<dialog");
    expect(html).toContain('id="board-create-ticket-form"');
    expect(html).toContain('method="post"');
    expect(html).not.toContain('href="/tickets/new?teamId=team-1"');
  });

  it("renders the create fields in the board dialog with same-team epic options", () => {
    const html = renderToString(
      <board.BoardView
        epics={[
          {
            id: "epic-1",
            teamId: "team-1",
            title: "Platform Launch",
            description: null,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          },
        ]}
        selectedTeamId="team-1"
        teams={[
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
        ]}
      />,
    );

    expect(html).toContain('name="teamId"');
    expect(html).toContain('name="epicId"');
    expect(html).toContain('name="type"');
    expect(html).toContain('name="state"');
    expect(html).toContain('name="title"');
    expect(html).toContain('name="body"');
    expect(html).toContain("Platform");
    expect(html).toContain("Product");
    expect(html).toContain("Platform Launch");
    expect(html).not.toContain("Product Discovery");
  });

  it("preserves board content behind the create dialog", () => {
    const ticket = makeTicketReadModel({
      id: "ticket-1",
      title: "Visible board ticket",
      state: "todo",
    });
    const html = renderToString(<board.BoardView tickets={[ticket]} />);

    expect(html).toContain("<dialog");
    expect(html).toContain("<strong>Visible board ticket</strong>");
    expect(html).toContain('aria-label="Ticket workflow"');
  });

  it("renders create validation errors in the board dialog", () => {
    const html = renderToString(
      <board.BoardView
        actionData={{
          message: "Ticket title is required.",
          status: "error",
        }}
      />,
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain("Ticket title is required.");
  });

  it("renders an open-ticket affordance for each card", () => {
    const firstTicket = makeTicketReadModel({
      id: "ticket-1",
      title: "First ticket",
      state: "todo",
    });
    const secondTicket = makeTicketReadModel({
      id: "ticket-2",
      title: "Second ticket",
      state: "todo",
    });

    const html = renderToString(
      <board.BoardView tickets={[firstTicket, secondTicket]} />,
    );

    expect(html).toContain('href="/tickets/ticket-1"');
    expect(html).toContain('aria-label="Open ticket First ticket"');
    expect(html).toContain('href="/tickets/ticket-2"');
    expect(html).toContain('aria-label="Open ticket Second ticket"');
    expect(html.match(/<span>Open ticket<\/span>/g)).toHaveLength(2);
  });

  it("preserves loader-provided ticket ordering within each column", () => {
    const newerTodoTicket = makeTicketReadModel({
      id: "ticket-1",
      title: "Newer todo ticket",
      state: "todo",
      modifiedAt: "2026-06-30T12:00:00.000Z",
    });
    const backlogTicket = makeTicketReadModel({
      id: "ticket-2",
      title: "Backlog ticket",
      state: "backlog",
      modifiedAt: "2026-06-30T11:00:00.000Z",
    });
    const olderTodoTicket = makeTicketReadModel({
      id: "ticket-3",
      title: "Older todo ticket",
      state: "todo",
      modifiedAt: "2026-06-30T10:00:00.000Z",
    });

    const todoColumn = board
      .getBoardColumns([newerTodoTicket, backlogTicket, olderTodoTicket])
      .find((column) => column.state === "todo");

    expect(todoColumn?.tickets).toEqual([newerTodoTicket, olderTodoTicket]);
  });

  it("groups and renders a large ticket set without error", () => {
    const states: TicketState[] = ["backlog", "todo", "in-progress", "done"];
    const tickets = Array.from({ length: 2000 }, (_, index) =>
      makeTicketReadModel({
        id: `ticket-${index}`,
        title: `Ticket ${index}`,
        state: states[index % states.length],
      }),
    );

    const columns = board.getBoardColumns(tickets);

    expect(columns.every((column) => column.tickets.length === 500)).toBe(true);

    const html = renderToString(<board.BoardView tickets={tickets} />);

    expect(html.match(/class="ticket-card"/g)).toHaveLength(2000);
  });

  it("redirects unauthenticated requests to login", async () => {
    const request = new Request("http://example.com/board");

    await expect(board.loader({ request })).rejects.toMatchObject({
      status: 302,
    });
    await expect(board.action({ request })).rejects.toMatchObject({
      status: 302,
    });
  });

  describe("parseBoardFilters", () => {
    it("returns no active filters for an empty query", () => {
      expect(board.parseBoardFilters(new URLSearchParams())).toEqual({
        type: null,
        epicId: null,
        search: "",
      });
    });

    it("parses a valid ticket type", () => {
      expect(
        board.parseBoardFilters(new URLSearchParams({ type: "bug" })),
      ).toMatchObject({ type: "bug" });
    });

    it("ignores an invalid ticket type value", () => {
      expect(
        board.parseBoardFilters(new URLSearchParams({ type: "not-a-type" })),
      ).toMatchObject({ type: null });
    });

    it("treats a blank epic id as no filter", () => {
      expect(
        board.parseBoardFilters(new URLSearchParams({ epicId: "   " })),
      ).toMatchObject({ epicId: null });
    });

    it("trims search text", () => {
      expect(
        board.parseBoardFilters(new URLSearchParams({ search: "  ticket  " })),
      ).toMatchObject({ search: "ticket" });
    });
  });

  describe("filterTickets", () => {
    const featureTicket = makeTicketReadModel({
      id: "ticket-1",
      title: "Add login page",
      state: "backlog",
      type: "feature",
      epicTitle: "Platform Launch",
    });
    const bugTicket = makeTicketReadModel({
      id: "ticket-2",
      title: "Fix login redirect",
      state: "todo",
      type: "bug",
    });

    it("filters by ticket type", () => {
      expect(
        board.filterTickets([featureTicket, bugTicket], {
          type: "bug",
          epicId: null,
          search: "",
        }),
      ).toEqual([bugTicket]);
    });

    it("filters by epic", () => {
      expect(
        board.filterTickets([featureTicket, bugTicket], {
          type: null,
          epicId: "epic-1",
          search: "",
        }),
      ).toEqual([featureTicket]);
    });

    it("filters by a case-insensitive title search", () => {
      expect(
        board.filterTickets([featureTicket, bugTicket], {
          type: null,
          epicId: null,
          search: "LOGIN",
        }),
      ).toEqual([featureTicket, bugTicket]);
    });

    it("combines active filters using AND logic", () => {
      expect(
        board.filterTickets([featureTicket, bugTicket], {
          type: "bug",
          epicId: null,
          search: "login",
        }),
      ).toEqual([bugTicket]);

      expect(
        board.filterTickets([featureTicket, bugTicket], {
          type: "feature",
          epicId: null,
          search: "redirect",
        }),
      ).toEqual([]);
    });

    it("returns no tickets for an epic id that does not match any ticket", () => {
      expect(
        board.filterTickets([featureTicket, bugTicket], {
          type: null,
          epicId: "missing-epic",
          search: "",
        }),
      ).toEqual([]);
    });

    it("preserves ticket ordering from the loader when filtering", () => {
      expect(
        board.filterTickets([bugTicket, featureTicket], {
          type: null,
          epicId: null,
          search: "login",
        }),
      ).toEqual([bugTicket, featureTicket]);
    });

    it("returns all tickets unfiltered for default/clear query state", () => {
      expect(
        board.filterTickets([featureTicket, bugTicket], {
          type: null,
          epicId: null,
          search: "",
        }),
      ).toEqual([featureTicket, bugTicket]);
    });
  });

  it("applies the ticket type query filter in the board loader", async () => {
    const team = createTeamForTest("Platform");
    createTicketForTest({
      teamId: team.id,
      title: "Feature ticket",
      type: "feature",
      state: "backlog",
    });
    const bugTicket = createTicketForTest({
      teamId: team.id,
      title: "Bug ticket",
      type: "bug",
      state: "todo",
    });

    const data = await board.loader({
      request: createAuthenticatedRequest(
        `http://example.com/board?teamId=${team.id}&type=bug`,
      ),
    });

    expect(data.tickets).toMatchObject([{ id: bugTicket.id, type: "bug" }]);
  });

  it("applies the epic query filter in the board loader", async () => {
    const team = createTeamForTest("Platform");
    const epic = createEpicForTest(team.id, "Platform Launch");
    const epicTicket = createTicketForTest({
      teamId: team.id,
      epicId: epic.id,
      title: "Epic ticket",
      type: "feature",
      state: "backlog",
    });
    createTicketForTest({
      teamId: team.id,
      title: "Unplanned ticket",
      type: "feature",
      state: "backlog",
    });

    const data = await board.loader({
      request: createAuthenticatedRequest(
        `http://example.com/board?teamId=${team.id}&epicId=${epic.id}`,
      ),
    });

    expect(data.tickets).toMatchObject([{ id: epicTicket.id }]);
  });

  it("applies the search query filter case-insensitively in the board loader", async () => {
    const team = createTeamForTest("Platform");
    const matchingTicket = createTicketForTest({
      teamId: team.id,
      title: "Fix login redirect",
      type: "bug",
      state: "todo",
    });
    createTicketForTest({
      teamId: team.id,
      title: "Unrelated ticket",
      type: "bug",
      state: "todo",
    });

    const data = await board.loader({
      request: createAuthenticatedRequest(
        `http://example.com/board?teamId=${team.id}&search=LOGIN`,
      ),
    });

    expect(data.tickets).toMatchObject([{ id: matchingTicket.id }]);
  });

  it("ignores an invalid ticket type query value in the board loader", async () => {
    const team = createTeamForTest("Platform");
    const ticket = createTicketForTest({
      teamId: team.id,
      title: "Feature ticket",
      type: "feature",
      state: "backlog",
    });

    const data = await board.loader({
      request: createAuthenticatedRequest(
        `http://example.com/board?teamId=${team.id}&type=not-a-type`,
      ),
    });

    expect(data.tickets).toMatchObject([{ id: ticket.id }]);
  });

  it("returns all selected-team tickets when no filter query is present", async () => {
    const team = createTeamForTest("Platform");
    const firstTicket = createTicketForTest({
      teamId: team.id,
      title: "First ticket",
      type: "feature",
      state: "backlog",
    });
    const secondTicket = createTicketForTest({
      teamId: team.id,
      title: "Second ticket",
      type: "bug",
      state: "todo",
    });

    const data = await board.loader({
      request: createAuthenticatedRequest(`http://example.com/board?teamId=${team.id}`),
    });

    expect(data.tickets).toMatchObject([
      { id: firstTicket.id },
      { id: secondTicket.id },
    ]);
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

  it("creates a ticket through the board action", async () => {
    const team = createTeamForTest("Platform");
    const epic = createEpicForTest(team.id, "Platform Launch");
    const result = (await board.action({
      request: createAuthenticatedFormRequest(
        createFormData({
          teamId: team.id,
          epicId: epic.id,
          title: "  Board dialog ticket  ",
          body: "  Create from the board dialog  ",
          type: "feature",
          state: "backlog",
        }),
      ),
    })) as Response;
    const ticket = database.select().from(schema.tickets).get();

    expect(result.status).toBe(302);
    expect(result.headers.get("Location")).toBe(`/tickets/${ticket?.id}`);
    expect(ticket).toMatchObject({
      teamId: team.id,
      epicId: epic.id,
      createdBy: userId,
      title: "Board dialog ticket",
      body: "Create from the board dialog",
      type: "feature",
      state: "backlog",
    });
  });

  it("returns create validation errors through the board action", async () => {
    const team = createTeamForTest("Platform");
    const result = unwrapActionData(
      await board.action({
        request: createAuthenticatedFormRequest(
          createFormData({
            teamId: team.id,
            epicId: "",
            title: "   ",
            body: "Create from the board dialog",
            type: "feature",
            state: "backlog",
          }),
        ),
      }),
    );

    expect(result.init.status).toBe(400);
    expect(result.data).toEqual({
      message: "Ticket title is required.",
      status: "error",
    });
    expect(database.select().from(schema.tickets).all()).toEqual([]);
  });

  it("persists a direct move between any two ticket states through the board action", async () => {
    const team = createTeamForTest("Platform");
    const ticket = createTicketForTest({
      teamId: team.id,
      title: "Backlog ticket",
      type: "feature",
      state: "backlog",
    });

    const result = unwrapActionData<"success">(
      await board.action({
        request: createAuthenticatedFormRequest(
          createFormData({
            intent: "update-state",
            ticketId: ticket.id,
            state: "done",
          }),
        ),
      }),
    );

    expect(result.init.status).toBe(200);
    expect(result.data).toEqual({
      message: "Ticket state updated.",
      status: "success",
    });
    expect(
      database.select().from(schema.tickets).where(eq(schema.tickets.id, ticket.id)).get(),
    ).toMatchObject({ state: "done" });
  });

  it("rejects an invalid ticket state value through the board state-update action", async () => {
    const team = createTeamForTest("Platform");
    const ticket = createTicketForTest({
      teamId: team.id,
      title: "Backlog ticket",
      type: "feature",
      state: "backlog",
    });

    const result = unwrapActionData(
      await board.action({
        request: createAuthenticatedFormRequest(
          createFormData({
            intent: "update-state",
            ticketId: ticket.id,
            state: "archived",
          }),
        ),
      }),
    );

    expect(result.init.status).toBe(400);
    expect(result.data).toEqual({
      message: "Ticket state is invalid.",
      status: "error",
    });
    expect(
      database.select().from(schema.tickets).where(eq(schema.tickets.id, ticket.id)).get(),
    ).toMatchObject({ state: "backlog" });
  });

  it("returns a not-found response when updating the state of a missing ticket", async () => {
    const result = unwrapActionData(
      await board.action({
        request: createAuthenticatedFormRequest(
          createFormData({
            intent: "update-state",
            ticketId: "missing-ticket",
            state: "done",
          }),
        ),
      }),
    );

    expect(result.init.status).toBe(404);
    expect(result.data).toEqual({
      message: "Ticket not found.",
      status: "error",
    });
  });

  it("returns a conflict response when the ticket changed since it was last loaded", async () => {
    const team = createTeamForTest("Platform");
    const ticket = createTicketForTest({
      teamId: team.id,
      title: "Backlog ticket",
      type: "feature",
      state: "backlog",
    });

    const result = unwrapActionData(
      await board.action({
        request: createAuthenticatedFormRequest(
          createFormData({
            intent: "update-state",
            ticketId: ticket.id,
            state: "done",
            expectedModifiedAt: "2020-01-01T00:00:00.000Z",
          }),
        ),
      }),
    );

    expect(result.init.status).toBe(409);
    expect(result.data).toEqual({
      message: "Ticket was updated elsewhere. Reload and try again.",
      status: "error",
    });
    expect(
      database.select().from(schema.tickets).where(eq(schema.tickets.id, ticket.id)).get(),
    ).toMatchObject({ state: "backlog" });
  });

  it("redirects unauthenticated state-update requests to login", async () => {
    const request = new Request("http://example.com/board", {
      body: createFormData({
        intent: "update-state",
        ticketId: "ticket-1",
        state: "done",
      }),
      method: "POST",
    });

    await expect(board.action({ request })).rejects.toMatchObject({
      status: 302,
    });
  });
});
