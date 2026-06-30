import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";

import * as schema from "~/db/schema";
import { createEpic, listEpics } from "~/services/epics/epics.server";
import { createTeam, type AppDb } from "~/services/teams/teams.server";

import { handleTicketCreateAction } from "./new-action.server";
import {
  action,
  loader,
  TicketCreateView,
} from "./new";

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
    VALUES ('user-1', 'user@example.com', 'hash', ${now.getTime()});
  `);
  database = drizzle(sqlite, { schema });
});

function createFormData(entries: Record<string, string>) {
  const formData = new FormData();

  Object.entries(entries).forEach(([key, value]) => {
    formData.set(key, value);
  });

  return formData;
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

function unwrapActionData(result: ReturnType<typeof handleTicketCreateAction>) {
  return result as unknown as {
    data: { message: string; status: "error" };
    init: { status: number };
  };
}

describe("ticket create route", () => {
  it("renders the create form fields with team-scoped epic options", () => {
    const html = renderToString(
      <TicketCreateView
        epics={[
          {
            id: "epic-1",
            teamId: "team-1",
            title: "Launch Plan",
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

    expect(html).toContain("Create ticket");
    expect(html).toContain("Ticket details");
    expect(html).toContain('name="teamId"');
    expect(html).toContain('name="epicId"');
    expect(html).toContain('name="type"');
    expect(html).toContain('name="state"');
    expect(html).toContain('name="title"');
    expect(html).toContain('name="body"');
    expect(html).toContain("Platform");
    expect(html).toContain("Product");
    expect(html).toContain("Launch Plan");
    expect(html).toContain("feature");
    expect(html).toContain("backlog");
  });

  it("creates a ticket and redirects to its details route", () => {
    const team = createTeamForTest();
    const epic = createEpicForTest(team.id);
    const result = handleTicketCreateAction(
      database,
      "user-1",
      createFormData({
        teamId: team.id,
        epicId: epic.id,
        title: "  Create route  ",
        body: "  Persist tickets through the service  ",
        type: "feature",
        state: "backlog",
      }),
    ) as Response;
    const ticket = database.select().from(schema.tickets).get();

    expect(result.status).toBe(302);
    expect(result.headers.get("Location")).toBe(`/tickets/${ticket?.id}`);
    expect(ticket).toMatchObject({
      teamId: team.id,
      epicId: epic.id,
      createdBy: "user-1",
      title: "Create route",
      body: "Persist tickets through the service",
      type: "feature",
      state: "backlog",
    });
  });

  it("returns service validation errors without creating a ticket", () => {
    const team = createTeamForTest();
    const result = unwrapActionData(
      handleTicketCreateAction(
        database,
        "user-1",
        createFormData({
          teamId: team.id,
          epicId: "",
          title: "   ",
          body: "Persist tickets through the service",
          type: "feature",
          state: "backlog",
        }),
      ),
    );

    expect(result.init.status).toBe(400);
    expect(result.data).toEqual({
      message: "Ticket title is required.",
      status: "error",
    });
    expect(database.select().from(schema.tickets).all()).toEqual([]);
  });

  it("shows only epics for the selected team", () => {
    const platform = createTeamForTest("Platform");
    const product = createTeamForTest("Product");
    const platformEpic = createEpicForTest(platform.id, "Platform Launch");
    createEpicForTest(product.id, "Product Discovery");
    const selectedEpics = listEpics(database, { teamId: platform.id });
    const html = renderToString(
      <TicketCreateView
        epics={selectedEpics}
        selectedTeamId={platform.id}
        teams={[platform, product]}
      />,
    );

    expect(selectedEpics).toEqual([platformEpic]);
    expect(html).toContain("Platform Launch");
    expect(html).not.toContain("Product Discovery");
  });

  it("requires authentication for reads and writes", async () => {
    const request = new Request("http://example.com/tickets/new");

    await expect(loader({ request })).rejects.toMatchObject({
      status: 302,
    });
    await expect(action({ request })).rejects.toMatchObject({
      status: 302,
    });
  });
});
