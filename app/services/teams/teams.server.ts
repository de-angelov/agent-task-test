import { and, count, countDistinct, eq, ne } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { err, ok, type Result } from "neverthrow";
import { match } from "ts-pattern";

import * as schema from "~/db/schema";
import { createIdentifier } from "~/lib/identifiers.server";
import {
  systemClock,
  toUtcIsoTimestamp,
  type Clock,
} from "~/lib/timestamps.server";

export interface Team {
  id: string;
  name: string;
  normalizedName: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeamManagementRow extends Team {
  epicCount: number;
  ticketCount: number;
}

export type TeamMutationError =
  | "blocked-by-epics"
  | "blocked-by-tickets"
  | "duplicate-name"
  | "empty-name"
  | "not-found";

export type AppDb = BetterSQLite3Database<typeof schema>;

export function normalizeTeamName(name: string): Result<string, "empty-name"> {
  const trimmedName = name.trim();

  if (trimmedName.length === 0) {
    return err("empty-name");
  }

  return ok(trimmedName);
}

export function normalizeTeamNameForUniqueness(name: string) {
  return name.trim().toLocaleLowerCase();
}

export function listTeams(database: AppDb): Team[] {
  return database.select().from(schema.teams).orderBy(schema.teams.name).all();
}

export function listTeamManagementRows(database: AppDb): TeamManagementRow[] {
  return database
    .select({
      id: schema.teams.id,
      name: schema.teams.name,
      normalizedName: schema.teams.normalizedName,
      createdAt: schema.teams.createdAt,
      updatedAt: schema.teams.updatedAt,
      epicCount: countDistinct(schema.epics.id),
      ticketCount: countDistinct(schema.tickets.id),
    })
    .from(schema.teams)
    .leftJoin(schema.epics, eq(schema.epics.teamId, schema.teams.id))
    .leftJoin(schema.tickets, eq(schema.tickets.teamId, schema.teams.id))
    .groupBy(schema.teams.id)
    .orderBy(schema.teams.name)
    .all();
}

export function createTeam(
  database: AppDb,
  input: { name: string },
  clock: Clock = systemClock,
): Result<Team, TeamMutationError> {
  const name = normalizeTeamName(input.name);

  if (name.isErr()) {
    return err(name.error);
  }

  const normalizedName = normalizeTeamNameForUniqueness(name.value);
  const existingTeam = database
    .select({ id: schema.teams.id })
    .from(schema.teams)
    .where(eq(schema.teams.normalizedName, normalizedName))
    .get();

  if (existingTeam) {
    return err("duplicate-name");
  }

  const timestamp = toUtcIsoTimestamp(clock.now());
  const team: Team = {
    id: createIdentifier(),
    name: name.value,
    normalizedName,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  database.insert(schema.teams).values(team).run();

  return ok(team);
}

export function renameTeam(
  database: AppDb,
  input: { id: string; name: string },
  clock: Clock = systemClock,
): Result<Team, TeamMutationError> {
  const name = normalizeTeamName(input.name);

  if (name.isErr()) {
    return err(name.error);
  }

  const team = database
    .select()
    .from(schema.teams)
    .where(eq(schema.teams.id, input.id))
    .get();

  if (!team) {
    return err("not-found");
  }

  const normalizedName = normalizeTeamNameForUniqueness(name.value);
  const duplicateTeam = database
    .select({ id: schema.teams.id })
    .from(schema.teams)
    .where(
      and(
        eq(schema.teams.normalizedName, normalizedName),
        ne(schema.teams.id, input.id),
      ),
    )
    .get();

  if (duplicateTeam) {
    return err("duplicate-name");
  }

  const updatedTeam: Team = {
    ...team,
    name: name.value,
    normalizedName,
    updatedAt: toUtcIsoTimestamp(clock.now()),
  };

  database
    .update(schema.teams)
    .set({
      name: updatedTeam.name,
      normalizedName: updatedTeam.normalizedName,
      updatedAt: updatedTeam.updatedAt,
    })
    .where(eq(schema.teams.id, input.id))
    .run();

  return ok(updatedTeam);
}

export function deleteTeam(
  database: AppDb,
  input: { id: string },
): Result<void, TeamMutationError> {
  const team = database
    .select({ id: schema.teams.id })
    .from(schema.teams)
    .where(eq(schema.teams.id, input.id))
    .get();

  if (!team) {
    return err("not-found");
  }

  const ticketCount = database
    .select({ value: count() })
    .from(schema.tickets)
    .where(eq(schema.tickets.teamId, input.id))
    .get()?.value;

  if (ticketCount && ticketCount > 0) {
    return err("blocked-by-tickets");
  }

  const epicCount = database
    .select({ value: count() })
    .from(schema.epics)
    .where(eq(schema.epics.teamId, input.id))
    .get()?.value;

  if (epicCount && epicCount > 0) {
    return err("blocked-by-epics");
  }

  database.delete(schema.teams).where(eq(schema.teams.id, input.id)).run();

  return ok(undefined);
}

export function mapTeamMutationError(error: TeamMutationError) {
  return match(error)
    .with("empty-name", () => "Team name is required.")
    .with("duplicate-name", () => "A team with that name already exists.")
    .with(
      "blocked-by-tickets",
      () => "Delete the team's tickets before deleting the team.",
    )
    .with(
      "blocked-by-epics",
      () => "Delete the team's epics before deleting the team.",
    )
    .with("not-found", () => "Team not found.")
    .exhaustive();
}
