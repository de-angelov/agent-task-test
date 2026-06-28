import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";

import * as schema from "~/db/schema";

import {
  createTeam,
  deleteTeam,
  listTeams,
  normalizeTeamName,
  normalizeTeamNameForUniqueness,
  renameTeam,
  type AppDb,
} from "./teams.server";

const now = new Date("2026-06-28T10:00:00.000Z");
const later = new Date("2026-06-28T11:00:00.000Z");

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

    CREATE TABLE tickets (
      id text PRIMARY KEY NOT NULL,
      team_id text NOT NULL,
      epic_id text,
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      FOREIGN KEY (epic_id) REFERENCES epics(id) ON DELETE RESTRICT ON UPDATE CASCADE
    );
  `);
  database = drizzle(sqlite, { schema });
});

describe("team service", () => {
  it("normalizes names for display and uniqueness", () => {
    expect(normalizeTeamName("  Platform  ")._unsafeUnwrap()).toBe("Platform");
    expect(normalizeTeamName("   ")._unsafeUnwrapErr()).toBe("empty-name");
    expect(normalizeTeamNameForUniqueness("  PLATFORM  ")).toBe("platform");
  });

  it("creates and lists teams with timestamps", () => {
    const result = createTeam(
      database,
      { name: "  Platform  " },
      { now: () => now },
    );

    expect(result.isOk()).toBe(true);
    expect(listTeams(database)).toMatchObject([
      {
        name: "Platform",
        normalizedName: "platform",
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    ]);
  });

  it("enforces case-insensitive team-name uniqueness on create and rename", () => {
    const platform = createTeam(
      database,
      { name: "Platform" },
      { now: () => now },
    )._unsafeUnwrap();
    const product = createTeam(
      database,
      { name: "Product" },
      { now: () => now },
    )._unsafeUnwrap();

    expect(createTeam(database, { name: " platform " })._unsafeUnwrapErr()).toBe(
      "duplicate-name",
    );
    expect(
      renameTeam(database, { id: product.id, name: "PLATFORM" })._unsafeUnwrapErr(),
    ).toBe("duplicate-name");
    expect(renameTeam(database, { id: platform.id, name: "platform" }).isOk()).toBe(
      true,
    );
  });

  it("renames teams and updates the modified timestamp", () => {
    const team = createTeam(
      database,
      { name: "Platform" },
      { now: () => now },
    )._unsafeUnwrap();
    const result = renameTeam(
      database,
      { id: team.id, name: "  Core Platform  " },
      { now: () => later },
    )._unsafeUnwrap();

    expect(result).toMatchObject({
      id: team.id,
      name: "Core Platform",
      normalizedName: "core platform",
      createdAt: now.toISOString(),
      updatedAt: later.toISOString(),
    });
  });

  it("deletes empty teams", () => {
    const team = createTeam(
      database,
      { name: "Platform" },
      { now: () => now },
    )._unsafeUnwrap();

    expect(deleteTeam(database, { id: team.id }).isOk()).toBe(true);
    expect(listTeams(database)).toEqual([]);
  });

  it("prevents deleting teams that contain tickets or epics", () => {
    const ticketTeam = createTeam(
      database,
      { name: "Tickets" },
      { now: () => now },
    )._unsafeUnwrap();
    const epicTeam = createTeam(
      database,
      { name: "Epics" },
      { now: () => now },
    )._unsafeUnwrap();

    database.insert(schema.tickets).values({ id: "ticket-1", teamId: ticketTeam.id }).run();
    database
      .insert(schema.epics)
      .values({
        id: "epic-1",
        teamId: epicTeam.id,
        title: "Launch Plan",
        description: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      })
      .run();

    expect(deleteTeam(database, { id: ticketTeam.id })._unsafeUnwrapErr()).toBe(
      "blocked-by-tickets",
    );
    expect(deleteTeam(database, { id: epicTeam.id })._unsafeUnwrapErr()).toBe(
      "blocked-by-epics",
    );
  });
});
