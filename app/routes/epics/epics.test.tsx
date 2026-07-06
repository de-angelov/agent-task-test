import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";

import * as schema from "~/db/schema";
import { createEpic } from "~/services/epics/epics.server";
import { createTeam, type AppDb } from "~/services/teams/teams.server";

import { handleEpicAction } from "./epics-action.server";
import { action, EpicsView, loader } from "./epics";

const now = new Date("2026-06-28T10:00:00.000Z");

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

function createTicketValues(id: string, teamId: string, epicId: string | null = null) {
  return {
    id,
    title: `Ticket ${id}`,
    body: "",
    type: "task",
    state: "backlog",
    teamId,
    epicId,
    createdBy: "user-1",
    createdAt: now.toISOString(),
    modifiedAt: now.toISOString(),
  } as const;
}

function createFormData(entries: Record<string, string>) {
  const formData = new FormData();

  Object.entries(entries).forEach(([key, value]) => {
    formData.set(key, value);
  });

  return formData;
}

function unwrapActionData(result: ReturnType<typeof handleEpicAction>) {
  return result as unknown as {
    data: { message: string; status: "error" | "success" };
    init: { status: number };
  };
}

function createTeamForTest(name = "Platform") {
  return createTeam(database, { name }, { now: () => now })._unsafeUnwrap();
}

function createEpicForTest(teamId: string) {
  return createEpic(
    database,
    {
      teamId,
      title: "Launch Plan",
      description: "Coordinate the MVP launch",
    },
    { now: () => now },
  )._unsafeUnwrap();
}

describe("epics route", () => {
  it("renders the authenticated shell navigation with the signed-in user's email", () => {
    const html = renderToString(
      <EpicsView epics={[]} teams={[]} userEmail="member@example.com" />,
    );

    expect(html).toContain("TICKET TRACKER");
    expect(html).toContain('href="/board"');
    expect(html).toContain('href="/teams"');
    expect(html).toContain('href="/epics"');
    expect(html).toContain("member@example.com");
  });

  it("renders epic management controls, rows, and validation messages", () => {
    const html = renderToString(
      <EpicsView
        actionData={{
          message:
            "Remove the epic from referenced tickets before deleting it.",
          status: "error",
        }}
        epics={[
          {
            id: "epic-1",
            teamId: "team-1",
            teamName: "Platform",
            title: "Launch Plan",
            description: "Coordinate the MVP launch",
            createdAt: "2026-06-28T10:00:00.000Z",
            updatedAt: "2026-06-28T11:00:00.000Z",
            ticketCount: 2,
          },
        ]}
        teams={[
          {
            id: "team-1",
            name: "Platform",
            normalizedName: "platform",
            createdAt: "2026-06-28T10:00:00.000Z",
            updatedAt: "2026-06-28T10:00:00.000Z",
          },
        ]}
      />,
    );

    expect(html).toContain("<dialog");
    expect(html).toContain("Create epic");
    expect(html).toContain('id="create-epic-form"');
    expect(html).toContain('name="intent"');
    expect(html).toContain('value="create"');
    expect(html).toContain('form="create-epic-form"');
    expect(html).toContain("Cancel");
    expect(html).toContain("Platform");
    expect(html).toContain("Launch Plan");
    expect(html).toContain("Coordinate the MVP launch");
    expect(html).toContain('<th scope="col">Tickets</th>');
    expect(html).toContain("<td>2</td>");
    expect(html).toContain("2026-06-28T11:00:00.000Z");
    expect(html).toContain("Save epic");
    expect(html).toContain("Delete");
    expect(html).toContain('disabled=""');
    expect(html).toContain(
      "Delete unavailable while 2 tickets reference this epic.",
    );
    expect(html).toContain(
      "Remove the epic from referenced tickets before deleting it.",
    );
  });

  it("renders dialog actions for opening, cancelling, and submitting epic creation", () => {
    const html = renderToString(
      <EpicsView
        epics={[]}
        teams={[
          {
            id: "team-1",
            name: "Platform",
            normalizedName: "platform",
            createdAt: "2026-06-28T10:00:00.000Z",
            updatedAt: "2026-06-28T10:00:00.000Z",
          },
          {
            id: "team-2",
            name: "Product",
            normalizedName: "product",
            createdAt: "2026-06-28T10:00:00.000Z",
            updatedAt: "2026-06-28T10:00:00.000Z",
          },
        ]}
      />,
    );

    expect(html).toContain('<button class="_button_');
    expect(html).toContain('type="button"');
    expect(html).toContain("Create epic");
    expect(html).toContain("Cancel");
    expect(html).toContain('form="create-epic-form"');
    expect(html).toContain('type="submit"');
    expect(html).toContain('<select name="teamId">');
    expect(html).toContain('<option value="team-1">Platform</option>');
    expect(html).toContain('<option value="team-2">Product</option>');
    expect(html).toContain('name="title"');
    expect(html).toContain('name="description"');
    expect(html).not.toContain("<h2>Create epic</h2><input");
  });

  it("renders an enabled delete action for epics without tickets", () => {
    const html = renderToString(
      <EpicsView
        epics={[
          {
            id: "epic-1",
            teamId: "team-1",
            teamName: "Platform",
            title: "Launch Plan",
            description: null,
            createdAt: "2026-06-28T10:00:00.000Z",
            updatedAt: "2026-06-28T11:00:00.000Z",
            ticketCount: 0,
          },
        ]}
        teams={[
          {
            id: "team-1",
            name: "Platform",
            normalizedName: "platform",
            createdAt: "2026-06-28T10:00:00.000Z",
            updatedAt: "2026-06-28T10:00:00.000Z",
          },
        ]}
      />,
    );

    expect(html).toContain("<td>0</td>");
    expect(html).not.toContain('disabled=""');
    expect(html).not.toContain("Delete unavailable while");
  });

  it("requires authentication for reads and writes", async () => {
    const request = new Request("http://example.com/epics");

    await expect(loader({ request })).rejects.toMatchObject({
      status: 302,
    });
    await expect(action({ request })).rejects.toMatchObject({
      status: 302,
    });
  });

  it("creates epics for the selected team", () => {
    const team = createTeamForTest();
    const result = unwrapActionData(
      handleEpicAction(
        database,
        createFormData({
          intent: "create",
          teamId: team.id,
          title: "  Launch Plan  ",
          description: "Coordinate the MVP launch",
        }),
      ),
    );

    expect(result.init.status).toBe(200);
    expect(result.data).toEqual({
      message: "Epic changes saved.",
      status: "success",
    });
    expect(
      database
        .select()
        .from(schema.epics)
        .all()
        .map((epic) => ({
          teamId: epic.teamId,
          title: epic.title,
          description: epic.description,
        })),
    ).toEqual([
      {
        teamId: team.id,
        title: "Launch Plan",
        description: "Coordinate the MVP launch",
      },
    ]);
  });

  it("edits epics without moving them between teams", () => {
    const team = createTeamForTest();
    const epic = createEpicForTest(team.id);
    const result = unwrapActionData(
      handleEpicAction(
        database,
        createFormData({
          intent: "edit",
          epicId: epic.id,
          teamId: team.id,
          title: "Updated Launch",
          description: "",
        }),
      ),
    );

    expect(result.init.status).toBe(200);
    expect(database.select().from(schema.epics).get()).toMatchObject({
      id: epic.id,
      teamId: team.id,
      title: "Updated Launch",
      description: null,
    });
  });

  it("returns a validation message when the epic title is blank", () => {
    const team = createTeamForTest();
    const result = unwrapActionData(
      handleEpicAction(
        database,
        createFormData({
          intent: "create",
          teamId: team.id,
          title: "   ",
          description: "",
        }),
      ),
    );

    expect(result.init.status).toBe(400);
    expect(result.data).toEqual({
      message: "Epic title is required.",
      status: "error",
    });
  });

  it("deletes unreferenced epics", () => {
    const team = createTeamForTest();
    const epic = createEpicForTest(team.id);
    const result = unwrapActionData(
      handleEpicAction(
        database,
        createFormData({ intent: "delete", epicId: epic.id }),
      ),
    );

    expect(result.init.status).toBe(200);
    expect(database.select().from(schema.epics).all()).toEqual([]);
  });

  it("shows a blocked delete message when an epic has tickets", () => {
    const team = createTeamForTest();
    const epic = createEpicForTest(team.id);

    database
      .insert(schema.tickets)
      .values(createTicketValues("ticket-1", team.id, epic.id))
      .run();

    const result = unwrapActionData(
      handleEpicAction(
        database,
        createFormData({ intent: "delete", epicId: epic.id }),
      ),
    );

    expect(result.init.status).toBe(409);
    expect(result.data).toEqual({
      message: "Remove the epic from referenced tickets before deleting it.",
      status: "error",
    });
    expect(database.select().from(schema.epics).all()).toHaveLength(1);
  });
});
