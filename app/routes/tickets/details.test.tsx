import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";

import * as schema from "~/db/schema";
import { createEpic } from "~/services/epics/epics.server";
import { createTeam, type AppDb } from "~/services/teams/teams.server";
import { createTicket } from "~/services/tickets/tickets.server";

import {
  formatTicketState,
  loader,
  TicketDetailsView,
} from "./details";
import { loadTicketDetails } from "./details-loader.server";

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

    INSERT INTO users (id, email, password_hash, created_at)
    VALUES ('user-1', 'creator@example.com', 'hash', ${now.getTime()});
  `);
  database = drizzle(sqlite, { schema });
});

function createTeamForTest(name = "Platform") {
  return createTeam(database, { name }, { now: () => now })._unsafeUnwrap();
}

function createEpicForTest(teamId: string, title = "Authentication") {
  return createEpic(
    database,
    {
      teamId,
      title,
      description: "Coordinate authentication work",
    },
    { now: () => now },
  )._unsafeUnwrap();
}

function createTicketForTest({
  epicId,
  state = "in-progress",
}: {
  epicId?: string | null;
  state?: string;
}) {
  const team = createTeamForTest();

  return createTicket(
    database,
    {
      teamId: team.id,
      epicId,
      createdBy: "user-1",
      title: "Set up account verification",
      body: "Send verification emails after signup.",
      type: "feature",
      state,
    },
    { now: () => now },
  )._unsafeUnwrap();
}

describe("ticket details route", () => {
  it("loads and renders ticket fields through the read service", () => {
    const team = createTeamForTest();
    const epic = createEpicForTest(team.id);
    const ticket = createTicket(
      database,
      {
        teamId: team.id,
        epicId: epic.id,
        createdBy: "user-1",
        title: "Set up account verification",
        body: "Send verification emails after signup.",
        type: "feature",
        state: "in-progress",
      },
      { now: () => now },
    )._unsafeUnwrap();
    const data = loadTicketDetails(database, {
      ticketId: ticket.id,
      userEmail: "signed-in@example.com",
    });
    const html = renderToString(<TicketDetailsView data={data} />);

    expect(data.status).toBe("found");
    expect(html).toContain("Ticket details");
    expect(html).toContain("Set up account verification");
    expect(html).toContain("Send verification emails after signup.");
    expect(html).toContain("Feature");
    expect(html).toContain("Platform");
    expect(html).toContain("Authentication");
    expect(html).toContain("In progress");
    expect(html).toContain("creator@example.com");
    expect(html).toContain("2026-06-30T10:00:00.000Z");
  });

  it("uses human-readable state labels", () => {
    expect(formatTicketState("backlog")).toBe("Backlog");
    expect(formatTicketState("todo")).toBe("Todo");
    expect(formatTicketState("in-progress")).toBe("In progress");
    expect(formatTicketState("done")).toBe("Done");
  });

  it("displays a null epic as no epic", () => {
    const ticket = createTicketForTest({ epicId: null });
    const data = loadTicketDetails(database, {
      ticketId: ticket.id,
      userEmail: "signed-in@example.com",
    });
    const html = renderToString(<TicketDetailsView data={data} />);

    expect(html).toContain("No epic");
  });

  it("shows a missing-record response for unknown ticket ids", () => {
    const data = loadTicketDetails(database, {
      ticketId: "missing-ticket",
      userEmail: "signed-in@example.com",
    });
    const html = renderToString(<TicketDetailsView data={data} />);

    expect(data).toEqual({
      status: "not-found",
      ticketId: "missing-ticket",
      userEmail: "signed-in@example.com",
    });
    expect(html).toContain("Ticket not found.");
    expect(html).not.toContain("Edit ticket");
  });

  it("links to the edit route for the loaded ticket", () => {
    const ticket = createTicketForTest({ epicId: null });
    const data = loadTicketDetails(database, {
      ticketId: ticket.id,
      userEmail: "signed-in@example.com",
    });
    const html = renderToString(<TicketDetailsView data={data} />);

    expect(html).toContain(`href="/tickets/${ticket.id}/edit"`);
    expect(html).toContain("Edit ticket");
  });

  it("requires authentication", async () => {
    const request = new Request("http://example.com/tickets/ticket-1");

    await expect(
      loader({ request, params: { ticketId: "ticket-1" } }),
    ).rejects.toMatchObject({
      status: 302,
    });
  });
});
