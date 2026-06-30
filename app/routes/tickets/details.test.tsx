import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";

import * as schema from "~/db/schema";
import { createEpic } from "~/services/epics/epics.server";
import { createTicket } from "~/services/tickets/tickets.server";
import { createTeam, type AppDb } from "~/services/teams/teams.server";

import { loader, TicketDetailsView } from "./details";
import { readTicketDetails } from "./details.server";

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

    CREATE TABLE sessions (
      id text PRIMARY KEY NOT NULL,
      user_id text NOT NULL,
      expires_at integer NOT NULL,
      created_at integer NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
    );

    INSERT INTO users (id, email, password_hash, email_verified_at, created_at)
    VALUES ('user-1', 'user@example.com', 'hash', ${now.getTime()}, ${now.getTime()});
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

function createTicketForTest(input: {
  teamId: string;
  epicId?: string | null;
  state: "backlog" | "todo" | "in-progress" | "done";
}) {
  return createTicket(
    database,
    {
      teamId: input.teamId,
      epicId: input.epicId ?? null,
      createdBy: "user-1",
      title: "Create service",
      body: "Create a focused backend service",
      type: "feature",
      state: input.state,
    },
    { now: () => now },
  )._unsafeUnwrap();
}

describe("ticket details route", () => {
  it("renders the ticket fields, state labels, null epic text, and edit navigation", () => {
    const team = createTeamForTest();
    const epic = createEpicForTest(team.id);
    const ticket = createTicketForTest({
      teamId: team.id,
      epicId: epic.id,
      state: "in-progress",
    });

    const html = renderToString(
      <TicketDetailsView data={readTicketDetails(database, ticket.id)} />,
    );

    expect(html).toContain("Create service");
    expect(html).toContain("Create a focused backend service");
    expect(html).toContain("feature");
    expect(html).toContain("Platform");
    expect(html).toContain("Launch Plan");
    expect(html).toContain("in-progress");
    expect(html).toContain("user@example.com");
    expect(html).toContain(ticket.createdAt);
    expect(html).toContain(ticket.modifiedAt);
    expect(html).toContain(`href="/tickets/${ticket.id}/edit"`);
    expect(
      html.match(new RegExp(`/tickets/${ticket.id}/edit`, "g")) ?? [],
    ).toHaveLength(1);
  });

  it("renders the state labels for all current ticket states", () => {
    const team = createTeamForTest();

    const tickets = [
      createTicketForTest({ teamId: team.id, state: "backlog" }),
      createTicketForTest({ teamId: team.id, state: "todo" }),
      createTicketForTest({ teamId: team.id, state: "in-progress" }),
      createTicketForTest({ teamId: team.id, state: "done" }),
    ];

    const html = tickets
      .map((ticket) =>
        renderToString(
          <TicketDetailsView data={readTicketDetails(database, ticket.id)} />,
        ),
      )
      .join("\n");

    expect(html).toContain("backlog");
    expect(html).toContain("todo");
    expect(html).toContain("in-progress");
    expect(html).toContain("done");
  });

  it("renders the missing ticket message when the ticket id is unknown", () => {
    const loaderData = readTicketDetails(database, "missing-ticket");

    expect(loaderData).toEqual({
      status: "not-found",
      ticketId: "missing-ticket",
    });

    const html = renderToString(<TicketDetailsView data={loaderData} />);

    expect(html).toContain("Ticket");
    expect(html).toContain("missing-ticket");
    expect(html).toContain("was not found.");
    expect(html).not.toContain("Edit ticket");
  });

  it("requires authentication before loading ticket details", async () => {
    const request = new Request("http://example.com/tickets/ticket-1");

    await expect(loader({ request, params: { ticketId: "ticket-1" } })).rejects.toMatchObject(
      {
        status: 302,
      },
    );
  });
});
