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

export type CommentEditError = "empty-body" | "forbidden" | "not-found";

export type CommentDeleteError = "forbidden" | "not-found";

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

export function editOwnTicketComment(
  database: AppDb,
  input: { commentId: string; callerId: string; body: string },
): Result<Comment, CommentEditError> {
  const comment = database
    .select()
    .from(schema.comments)
    .where(eq(schema.comments.id, input.commentId))
    .get();

  if (!comment) {
    return err("not-found");
  }

  if (comment.authorId !== input.callerId) {
    return err("forbidden");
  }

  const body = normalizeCommentBody(input.body);

  if (body.isErr()) {
    return err(body.error);
  }

  const updatedComment: Comment = {
    ...comment,
    body: body.value,
  };

  database
    .update(schema.comments)
    .set({ body: updatedComment.body })
    .where(eq(schema.comments.id, input.commentId))
    .run();

  return ok(updatedComment);
}

export function deleteOwnTicketComment(
  database: AppDb,
  input: { commentId: string; callerId: string },
): Result<void, CommentDeleteError> {
  const comment = database
    .select({ id: schema.comments.id, authorId: schema.comments.authorId })
    .from(schema.comments)
    .where(eq(schema.comments.id, input.commentId))
    .get();

  if (!comment) {
    return err("not-found");
  }

  if (comment.authorId !== input.callerId) {
    return err("forbidden");
  }

  database
    .delete(schema.comments)
    .where(eq(schema.comments.id, input.commentId))
    .run();

  return ok(undefined);
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
