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

export interface Comment {
  id: string;
  ticketId: string;
  authorId: string;
  body: string;
  createdAt: string;
}

export interface CommentReadModel {
  id: string;
  ticketId: string;
  authorId: string;
  authorEmail: string;
  body: string;
  createdAt: string;
}

export type CommentAddError = "author-not-found" | "empty-body" | "ticket-not-found";

export function normalizeCommentBody(body: string): Result<string, "empty-body"> {
  const trimmedBody = body.trim();

  if (trimmedBody.length === 0) {
    return err("empty-body");
  }

  return ok(trimmedBody);
}

export function addTicketComment(
  database: AppDb,
  input: { ticketId: string; authorId: string; body: string },
  clock: Clock = systemClock,
): Result<Comment, CommentAddError> {
  const body = normalizeCommentBody(input.body);

  if (body.isErr()) {
    return err(body.error);
  }

  const ticket = database
    .select({ id: schema.tickets.id })
    .from(schema.tickets)
    .where(eq(schema.tickets.id, input.ticketId))
    .get();

  if (!ticket) {
    return err("ticket-not-found");
  }

  const author = database
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.id, input.authorId))
    .get();

  if (!author) {
    return err("author-not-found");
  }

  const comment: Comment = {
    id: createIdentifier(),
    ticketId: input.ticketId,
    authorId: input.authorId,
    body: body.value,
    createdAt: toUtcIsoTimestamp(clock.now()),
  };

  database.insert(schema.comments).values(comment).run();

  return ok(comment);
}

const commentReadColumns = {
  id: schema.comments.id,
  ticketId: schema.comments.ticketId,
  authorId: schema.comments.authorId,
  authorEmail: schema.users.email,
  body: schema.comments.body,
  createdAt: schema.comments.createdAt,
};

export function listTicketComments(
  database: AppDb,
  input: { ticketId: string },
): CommentReadModel[] {
  return database
    .select(commentReadColumns)
    .from(schema.comments)
    .innerJoin(schema.users, eq(schema.users.id, schema.comments.authorId))
    .where(eq(schema.comments.ticketId, input.ticketId))
    .orderBy(asc(schema.comments.createdAt))
    .all();
}
