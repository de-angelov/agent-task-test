import { count, eq } from "drizzle-orm";
import { err, ok, type Result } from "neverthrow";

import * as schema from "~/db/schema";
import { createIdentifier } from "~/lib/identifiers.server";
import {
  systemClock,
  toUtcIsoTimestamp,
  type Clock,
} from "~/lib/timestamps.server";

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
  | "immutable-team"
  | "not-found"
  | "team-not-found";

export function normalizeEpicTitle(title: string): Result<string, "empty-title"> {
  const trimmedTitle = title.trim();

  if (trimmedTitle.length === 0) {
    return err("empty-title");
  }

  return ok(trimmedTitle);
}

export function listEpics(database: AppDb, input: { teamId: string }): Epic[] {
  return database
    .select()
    .from(schema.epics)
    .where(eq(schema.epics.teamId, input.teamId))
    .orderBy(schema.epics.title)
    .all();
}

export function createEpic(
  database: AppDb,
  input: { teamId: string; title: string; description?: string | null },
  clock: Clock = systemClock,
): Result<Epic, EpicMutationError> {
  const title = normalizeEpicTitle(input.title);

  if (title.isErr()) {
    return err(title.error);
  }

  const team = database
    .select({ id: schema.teams.id })
    .from(schema.teams)
    .where(eq(schema.teams.id, input.teamId))
    .get();

  if (!team) {
    return err("team-not-found");
  }

  const timestamp = toUtcIsoTimestamp(clock.now());
  const epic: Epic = {
    id: createIdentifier(),
    teamId: input.teamId,
    title: title.value,
    description: input.description ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  database.insert(schema.epics).values(epic).run();

  return ok(epic);
}

export function editEpic(
  database: AppDb,
  input: {
    id: string;
    teamId?: string;
    title: string;
    description?: string | null;
  },
  clock: Clock = systemClock,
): Result<Epic, EpicMutationError> {
  const title = normalizeEpicTitle(input.title);

  if (title.isErr()) {
    return err(title.error);
  }

  const epic = database
    .select()
    .from(schema.epics)
    .where(eq(schema.epics.id, input.id))
    .get();

  if (!epic) {
    return err("not-found");
  }

  if (input.teamId !== undefined && input.teamId !== epic.teamId) {
    return err("immutable-team");
  }

  const updatedEpic: Epic = {
    ...epic,
    title: title.value,
    description: input.description ?? null,
    updatedAt: toUtcIsoTimestamp(clock.now()),
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

export function mapEpicMutationError(error: EpicMutationError) {
  switch (error) {
    case "empty-title":
      return "Epic title is required.";
    case "team-not-found":
      return "Team not found.";
    case "immutable-team":
      return "Epics cannot be moved between teams.";
    case "blocked-by-tickets":
      return "Remove the epic from referenced tickets before deleting it.";
    case "not-found":
      return "Epic not found.";
  }
}
