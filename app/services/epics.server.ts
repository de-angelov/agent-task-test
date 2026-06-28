import { randomUUID } from "node:crypto";

import { asc, count, eq } from "drizzle-orm";
import { err, ok, type Result } from "neverthrow";

import * as schema from "~/db/schema";

import type { AppDb } from "./teams.server";

export interface Epic {
  id: string;
  teamId: string;
  title: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export type EpicMutationError =
  | "blocked-by-tickets"
  | "empty-title"
  | "not-found"
  | "team-change-not-allowed"
  | "team-not-found";

export type TicketEpicReferenceError =
  | "epic-not-found"
  | "epic-team-mismatch"
  | "team-not-found";

interface Clock {
  now: () => Date;
}

const systemClock: Clock = {
  now: () => new Date(),
};

export function normalizeEpicTitle(title: string): Result<string, "empty-title"> {
  const trimmedTitle = title.trim();

  if (trimmedTitle.length === 0) {
    return err("empty-title");
  }

  return ok(trimmedTitle);
}

export function normalizeEpicDescription(description: string) {
  const trimmedDescription = description.trim();

  return trimmedDescription.length > 0 ? trimmedDescription : null;
}

export function listEpics(database: AppDb): Epic[] {
  return database
    .select()
    .from(schema.epics)
    .orderBy(asc(schema.epics.title))
    .all();
}

export function listEpicsForTeam(database: AppDb, teamId: string): Epic[] {
  return database
    .select()
    .from(schema.epics)
    .where(eq(schema.epics.teamId, teamId))
    .orderBy(asc(schema.epics.title))
    .all();
}

export function createEpic(
  database: AppDb,
  input: { teamId: string; title: string; description?: string },
  clock: Clock = systemClock,
): Result<Epic, EpicMutationError> {
  const team = database
    .select({ id: schema.teams.id })
    .from(schema.teams)
    .where(eq(schema.teams.id, input.teamId))
    .get();

  if (!team) {
    return err("team-not-found");
  }

  const title = normalizeEpicTitle(input.title);

  if (title.isErr()) {
    return err(title.error);
  }

  const timestamp = clock.now().toISOString();
  const epic: Epic = {
    id: randomUUID(),
    teamId: input.teamId,
    title: title.value,
    description: normalizeEpicDescription(input.description ?? ""),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  database.insert(schema.epics).values(epic).run();

  return ok(epic);
}

export function updateEpic(
  database: AppDb,
  input: {
    id: string;
    title: string;
    description?: string;
    teamId?: string;
  },
  clock: Clock = systemClock,
): Result<Epic, EpicMutationError> {
  const epic = database
    .select()
    .from(schema.epics)
    .where(eq(schema.epics.id, input.id))
    .get();

  if (!epic) {
    return err("not-found");
  }

  if (input.teamId !== undefined && input.teamId !== epic.teamId) {
    return err("team-change-not-allowed");
  }

  const title = normalizeEpicTitle(input.title);

  if (title.isErr()) {
    return err(title.error);
  }

  const updatedEpic: Epic = {
    ...epic,
    title: title.value,
    description: normalizeEpicDescription(input.description ?? ""),
    updatedAt: clock.now().toISOString(),
  };

  database
    .update(schema.epics)
    .set({
      title: updatedEpic.title,
      description: updatedEpic.description,
      updatedAt: updatedEpic.updatedAt,
    })
    .where(eq(schema.epics.id, input.id))
    .run();

  return ok(updatedEpic);
}

export function deleteEpic(
  database: AppDb,
  input: { id: string },
): Result<void, EpicMutationError> {
  const epic = database
    .select({ id: schema.epics.id })
    .from(schema.epics)
    .where(eq(schema.epics.id, input.id))
    .get();

  if (!epic) {
    return err("not-found");
  }

  const ticketCount = database
    .select({ value: count() })
    .from(schema.tickets)
    .where(eq(schema.tickets.epicId, input.id))
    .get()?.value;

  if (ticketCount && ticketCount > 0) {
    return err("blocked-by-tickets");
  }

  database.delete(schema.epics).where(eq(schema.epics.id, input.id)).run();

  return ok(undefined);
}

export function validateTicketEpicReference(
  database: AppDb,
  input: { teamId: string; epicId: string | null },
): Result<string | null, TicketEpicReferenceError> {
  const team = database
    .select({ id: schema.teams.id })
    .from(schema.teams)
    .where(eq(schema.teams.id, input.teamId))
    .get();

  if (!team) {
    return err("team-not-found");
  }

  if (!input.epicId) {
    return ok(null);
  }

  const epic = database
    .select({ id: schema.epics.id, teamId: schema.epics.teamId })
    .from(schema.epics)
    .where(eq(schema.epics.id, input.epicId))
    .get();

  if (!epic) {
    return err("epic-not-found");
  }

  if (epic.teamId !== input.teamId) {
    return err("epic-team-mismatch");
  }

  return ok(epic.id);
}

export function mapEpicMutationError(error: EpicMutationError) {
  switch (error) {
    case "empty-title":
      return "Epic title is required.";
    case "team-not-found":
      return "Team not found.";
    case "team-change-not-allowed":
      return "An epic's team cannot be changed after creation.";
    case "blocked-by-tickets":
      return "Delete or move tickets that reference this epic before deleting it.";
    case "not-found":
      return "Epic not found.";
  }
}

export function mapTicketEpicReferenceError(error: TicketEpicReferenceError) {
  switch (error) {
    case "team-not-found":
      return "Team not found.";
    case "epic-not-found":
      return "Epic not found.";
    case "epic-team-mismatch":
      return "The selected epic must belong to the ticket's team.";
  }
}
