import { asc, eq } from "drizzle-orm";
import { err, ok, type Result } from "neverthrow";

import * as schema from "~/db/schema";
import { createIdentifier } from "~/lib/identifiers.server";
import {
  systemClock,
  toUtcIsoTimestamp,
  type Clock,
} from "~/lib/timestamps.server";

import type { AppDb } from "../teams/teams.server";

export const ticketActivityActionTypes = [
  "created",
  "state-changed",
  "title-changed",
  "body-changed",
  "team-changed",
  "epic-changed",
  "deleted",
] as const;

export type TicketActivityActionType = (typeof ticketActivityActionTypes)[number];

export interface TicketActivity {
  id: string;
  ticketId: string;
  actorId: string;
  actionType: string;
  detail: string | null;
  createdAt: string;
}

export type RecordTicketActivityError =
  | "actor-not-found"
  | "invalid-action-type"
  | "ticket-not-found";

function parseTicketActivityActionType(
  actionType: string,
): Result<TicketActivityActionType, "invalid-action-type"> {
  if (ticketActivityActionTypes.some((knownActionType) => knownActionType === actionType)) {
    return ok(actionType as TicketActivityActionType);
  }

  return err("invalid-action-type");
}

export function recordTicketActivity(
  database: AppDb,
  input: {
    ticketId: string;
    actorId: string;
    actionType: string;
    detail?: string | null;
  },
  clock: Clock = systemClock,
): Result<TicketActivity, RecordTicketActivityError> {
  const actionType = parseTicketActivityActionType(input.actionType);

  if (actionType.isErr()) {
    return err(actionType.error);
  }

  const ticket = database
    .select({ id: schema.tickets.id })
    .from(schema.tickets)
    .where(eq(schema.tickets.id, input.ticketId))
    .get();

  if (!ticket) {
    return err("ticket-not-found");
  }

  const actor = database
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.id, input.actorId))
    .get();

  if (!actor) {
    return err("actor-not-found");
  }

  const activity: TicketActivity = {
    id: createIdentifier(),
    ticketId: input.ticketId,
    actorId: input.actorId,
    actionType: actionType.value,
    detail: input.detail ?? null,
    createdAt: toUtcIsoTimestamp(clock.now()),
  };

  database.insert(schema.ticketActivity).values(activity).run();

  return ok(activity);
}

export function listTicketActivity(
  database: AppDb,
  input: { ticketId: string },
): TicketActivity[] {
  return database
    .select()
    .from(schema.ticketActivity)
    .where(eq(schema.ticketActivity.ticketId, input.ticketId))
    .orderBy(asc(schema.ticketActivity.createdAt))
    .all();
}
