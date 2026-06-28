import { randomUUID } from "node:crypto";

import { and, count, eq, ne } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { err, ok, type Result } from "neverthrow";

import * as schema from "~/db/schema";

export interface Team {
  id: string;
  name: string;
  normalizedName: string;
  createdAt: string;
  updatedAt: string;
}

export type TeamMutationError =
  | "blocked-by-epics"
  | "blocked-by-tickets"
  | "duplicate-name"
  | "empty-name"
  | "not-found";

export type AppDb = BetterSQLite3Database<typeof schema>;

interface Clock {
  now: () => Date;
}

const systemClock: Clock = {
  now: () => new Date(),
};

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

  const timestamp = clock.now().toISOString();
  const team: Team = {
    id: randomUUID(),
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
    updatedAt: clock.now().toISOString(),
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
  switch (error) {
    case "empty-name":
      return "Team name is required.";
    case "duplicate-name":
      return "A team with that name already exists.";
    case "blocked-by-tickets":
      return "Delete the team's tickets before deleting the team.";
    case "blocked-by-epics":
      return "Delete the team's epics before deleting the team.";
    case "not-found":
      return "Team not found.";
  }
}
