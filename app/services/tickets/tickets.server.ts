import { eq } from "drizzle-orm";
import { err, ok, type Result } from "neverthrow";
import { match } from "ts-pattern";

import * as schema from "~/db/schema";
import { createIdentifier } from "~/lib/identifiers.server";
import {
  systemClock,
  toUtcIsoTimestamp,
  type Clock,
} from "~/lib/timestamps.server";

import type { AppDb } from "../teams/teams.server";
import {
  ticketStates,
  ticketTypes,
  type TicketState,
  type TicketType,
} from "./ticket-workflow.server";

export interface Ticket {
  id: string;
  title: string;
  body: string;
  type: TicketType;
  state: TicketState;
  teamId: string;
  epicId: string | null;
  createdBy: string;
  createdAt: string;
  modifiedAt: string;
}

export type TicketCreateError =
  | "created-by-not-found"
  | "empty-body"
  | "empty-title"
  | "epic-not-found"
  | "epic-team-mismatch"
  | "invalid-state"
  | "invalid-type"
  | "team-not-found";

export function normalizeTicketTitle(title: string): Result<string, "empty-title"> {
  const trimmedTitle = title.trim();

  if (trimmedTitle.length === 0) {
    return err("empty-title");
  }

  return ok(trimmedTitle);
}

export function normalizeTicketBody(body: string): Result<string, "empty-body"> {
  const trimmedBody = body.trim();

  if (trimmedBody.length === 0) {
    return err("empty-body");
  }

  return ok(trimmedBody);
}

function parseTicketType(type: string): Result<TicketType, "invalid-type"> {
  if (ticketTypes.some((ticketType) => ticketType === type)) {
    return ok(type as TicketType);
  }

  return err("invalid-type");
}

function parseTicketState(state: string): Result<TicketState, "invalid-state"> {
  if (ticketStates.some((ticketState) => ticketState === state)) {
    return ok(state as TicketState);
  }

  return err("invalid-state");
}

export function createTicket(
  database: AppDb,
  input: {
    teamId: string;
    epicId?: string | null;
    createdBy: string;
    title: string;
    body: string;
    type: string;
    state: string;
  },
  clock: Clock = systemClock,
): Result<Ticket, TicketCreateError> {
  const title = normalizeTicketTitle(input.title);

  if (title.isErr()) {
    return err(title.error);
  }

  const body = normalizeTicketBody(input.body);

  if (body.isErr()) {
    return err(body.error);
  }

  const type = parseTicketType(input.type);

  if (type.isErr()) {
    return err(type.error);
  }

  const state = parseTicketState(input.state);

  if (state.isErr()) {
    return err(state.error);
  }

  const team = database
    .select({ id: schema.teams.id })
    .from(schema.teams)
    .where(eq(schema.teams.id, input.teamId))
    .get();

  if (!team) {
    return err("team-not-found");
  }

  const creator = database
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.id, input.createdBy))
    .get();

  if (!creator) {
    return err("created-by-not-found");
  }

  const epicId = input.epicId ?? null;

  if (epicId) {
    const epic = database
      .select({ id: schema.epics.id, teamId: schema.epics.teamId })
      .from(schema.epics)
      .where(eq(schema.epics.id, epicId))
      .get();

    if (!epic) {
      return err("epic-not-found");
    }

    if (epic.teamId !== input.teamId) {
      return err("epic-team-mismatch");
    }
  }

  const timestamp = toUtcIsoTimestamp(clock.now());
  const ticket: Ticket = {
    id: createIdentifier(),
    title: title.value,
    body: body.value,
    type: type.value,
    state: state.value,
    teamId: input.teamId,
    epicId,
    createdBy: input.createdBy,
    createdAt: timestamp,
    modifiedAt: timestamp,
  };

  database.insert(schema.tickets).values(ticket).run();

  return ok(ticket);
}

export function mapTicketCreateError(error: TicketCreateError) {
  return match(error)
    .with("empty-title", () => "Ticket title is required.")
    .with("empty-body", () => "Ticket body is required.")
    .with("invalid-type", () => "Ticket type is invalid.")
    .with("invalid-state", () => "Ticket state is invalid.")
    .with("team-not-found", () => "Team not found.")
    .with("epic-not-found", () => "Epic not found.")
    .with("epic-team-mismatch", () => "Epic must belong to the ticket team.")
    .with("created-by-not-found", () => "Ticket creator not found.")
    .exhaustive();
}
