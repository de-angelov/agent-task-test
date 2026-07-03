import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";

import * as schema from "~/db/schema";
import { listTeams, type AppDb } from "~/services/teams/teams.server";

import { action, loader, TeamsView } from "./teams";
import { handleTeamAction } from "./teams-action.server";

let sqlite: Database.Database;
let database: AppDb;

beforeEach(() => {
  sqlite = new Database(":memory:");
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

function unwrapActionData(result: ReturnType<typeof handleTeamAction>) {
  return result as unknown as {
    data: { message: string; status: "error" | "success" };
    init: { status: number };
  };
}

describe("teams route", () => {
  it("renders the team management table, create dialog, edit form, and validation messages", () => {
    const html = renderToString(
      <TeamsView
        actionData={{
          message: "Delete the team's tickets before deleting the team.",
          status: "error",
        }}
        teams={[
          {
            id: "team-1",
            name: "Platform",
            normalizedName: "platform",
            createdAt: "2026-06-28T10:00:00.000Z",
            updatedAt: "2026-06-28T11:00:00.000Z",
            epicCount: 2,
            ticketCount: 4,
          },
        ]}
      />,
    );

    expect(html).toContain("<dialog");
    expect(html).toContain("Create team");
    expect(html).toContain('id="create-team-form"');
    expect(html).toContain('name="intent"');
    expect(html).toContain('value="create"');
    expect(html).toContain('form="create-team-form"');
    expect(html).toContain("Cancel");
    expect(html).toContain("Teams");
    expect(html).toContain("Platform");
    expect(html).toContain("Tickets");
    expect(html).toContain("Epics");
    expect(html).toContain("4");
    expect(html).toContain("2");
    expect(html).toContain("2026-06-28T11:00:00.000Z");
    expect(html).toContain("Save team");
    expect(html).toContain("Delete");
    expect(html).toContain("Delete blocked until this team has no tickets or epics.");
    expect(html).toContain("Delete the team&#x27;s tickets before deleting the team.");
  });

  it("renders dialog actions for opening, cancelling, and submitting team creation", () => {
    const html = renderToString(<TeamsView teams={[]} />);

    expect(html).toContain('<button class="_button_');
    expect(html).toContain('type="button"');
    expect(html).toContain("Create team");
    expect(html).toContain("Cancel");
    expect(html).toContain('form="create-team-form"');
    expect(html).toContain('type="submit"');
    expect(html).not.toContain("<h2>Create team</h2><input");
  });

  it("enables delete for unreferenced teams and disables it for referenced teams", () => {
    const html = renderToString(
      <TeamsView
        teams={[
          {
            id: "team-1",
            name: "Platform",
            normalizedName: "platform",
            createdAt: "2026-06-28T10:00:00.000Z",
            updatedAt: "2026-06-28T11:00:00.000Z",
            epicCount: 0,
            ticketCount: 0,
          },
          {
            id: "team-2",
            name: "Product",
            normalizedName: "product",
            createdAt: "2026-06-28T10:00:00.000Z",
            updatedAt: "2026-06-28T12:00:00.000Z",
            epicCount: 1,
            ticketCount: 0,
          },
        ]}
      />,
    );

    expect(html).toContain("Product");
    expect(html).toContain(
      '<button aria-describedby="team-2-delete-blocked" class="_button_',
    );
    expect(html).toContain("disabled=\"\"");
    expect(html).toContain("Delete blocked until this team has no tickets or epics.");
    expect(html).toContain('name="teamId" value="team-1"');
  });

  it("renders the empty state when no teams exist", () => {
    const html = renderToString(<TeamsView teams={[]} />);

    expect(html).toContain("No teams have been created.");
  });

  it("requires authentication for reads and writes", async () => {
    const request = new Request("http://example.com/teams");

    await expect(loader({ request })).rejects.toMatchObject({
      status: 302,
    });
    await expect(action({ request })).rejects.toMatchObject({
      status: 302,
    });
  });

  it("submits create intent without changing team service behavior", () => {
    const result = unwrapActionData(
      handleTeamAction(
        database,
        createFormData({
          intent: "create",
          name: "  Platform  ",
        }),
      ),
    );

    expect(result.init.status).toBe(200);
    expect(result.data).toEqual({
      message: "Team changes saved.",
      status: "success",
    });
    expect(listTeams(database)).toMatchObject([
      {
        name: "Platform",
        normalizedName: "platform",
      },
    ]);
  });

  it("returns existing validation copy for create errors", () => {
    const result = unwrapActionData(
      handleTeamAction(
        database,
        createFormData({
          intent: "create",
          name: "  ",
        }),
      ),
    );

    expect(result.init.status).toBe(400);
    expect(result.data).toEqual({
      message: "Team name is required.",
      status: "error",
    });
  });
});
