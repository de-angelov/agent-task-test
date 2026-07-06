import { data, redirect } from "react-router";
import { match } from "ts-pattern";

import {
  addTicketComment,
  deleteOwnTicketComment,
  editOwnTicketComment,
  listTicketComments,
  type CommentAddError,
  type CommentDeleteError,
  type CommentEditError,
  type CommentReadModel,
} from "~/services/comments/comments.server";
import type { AppDb } from "~/services/teams/teams.server";
import {
  listTicketActivity,
  type TicketActivityReadModel,
} from "~/services/ticket-activity/ticket-activity.server";
import {
  deleteTicket,
  getTicketById,
  mapTicketDeleteError,
  type TicketReadModel,
} from "~/services/tickets/tickets.server";

export type TicketDetailsFound = {
  status: "found";
  ticket: TicketReadModel;
  comments: CommentReadModel[];
  activity: TicketActivityReadModel[];
  currentUserId: string;
  userEmail: string;
};

export type TicketDetailsNotFound = {
  status: "not-found";
  ticketId: string;
  userEmail: string;
};

export type LoaderData = TicketDetailsFound | TicketDetailsNotFound;

export type TicketDeleteActionData = {
  intent: "delete-ticket";
  message: string;
  status: "error";
};

export type TicketAddCommentActionData = {
  intent: "add-comment";
  message: string;
  status: "error";
};

export type TicketEditCommentActionData = {
  intent: "edit-comment";
  message: string;
  status: "error";
};

export type TicketDeleteCommentActionData = {
  intent: "delete-comment";
  message: string;
  status: "error";
};

export function readTicketDetails(
  database: AppDb,
  ticketId: string,
  currentUserId: string,
  userEmail: string,
): LoaderData {
  const ticket = getTicketById(database, { id: ticketId });

  if (ticket.isErr()) {
    return {
      status: "not-found",
      ticketId,
      userEmail,
    };
  }

  return {
    status: "found",
    ticket: ticket.value,
    comments: listTicketComments(database, { ticketId: ticket.value.id }),
    activity: listTicketActivity(database, { ticketId: ticket.value.id }),
    currentUserId,
    userEmail,
  };
}

export function handleTicketDeleteAction(
  database: AppDb,
  ticketId: string,
  actorId: string,
  formData: FormData,
) {
  if (formData.get("confirmDelete") !== "yes") {
    return data<TicketDeleteActionData>(
      {
        intent: "delete-ticket",
        message: "Confirm deletion before deleting this ticket.",
        status: "error",
      },
      { status: 400 },
    );
  }

  const result = deleteTicket(database, { id: ticketId, actorId });

  if (result.isErr()) {
    return data<TicketDeleteActionData>(
      {
        intent: "delete-ticket",
        message: mapTicketDeleteError(result.error),
        status: "error",
      },
      { status: 400 },
    );
  }

  return redirect("/board");
}

function mapCommentAddError(error: CommentAddError) {
  return match(error)
    .with("empty-body", () => "Comment cannot be empty.")
    .with("ticket-not-found", () => "Ticket not found.")
    .with("author-not-found", () => "Unable to add comment.")
    .exhaustive();
}

export function handleTicketAddCommentAction(
  database: AppDb,
  ticketId: string,
  authorId: string,
  formData: FormData,
) {
  const result = addTicketComment(database, {
    authorId,
    body: String(formData.get("body") ?? ""),
    ticketId,
  });

  if (result.isErr()) {
    return data<TicketAddCommentActionData>(
      {
        intent: "add-comment",
        message: mapCommentAddError(result.error),
        status: "error",
      },
      { status: 400 },
    );
  }

  return redirect(`/tickets/${ticketId}`);
}

function mapCommentEditError(error: CommentEditError) {
  return match(error)
    .with("empty-body", () => ({
      message: "Comment cannot be empty.",
      statusCode: 400,
    }))
    .with("forbidden", () => ({
      message: "You can only edit your own comments.",
      statusCode: 403,
    }))
    .with("not-found", () => ({
      message: "Comment not found.",
      statusCode: 404,
    }))
    .exhaustive();
}

export function handleTicketEditCommentAction(
  database: AppDb,
  ticketId: string,
  callerId: string,
  formData: FormData,
) {
  const result = editOwnTicketComment(database, {
    commentId: String(formData.get("commentId") ?? ""),
    callerId,
    body: String(formData.get("body") ?? ""),
  });

  if (result.isErr()) {
    const { message, statusCode } = mapCommentEditError(result.error);

    return data<TicketEditCommentActionData>(
      { intent: "edit-comment", message, status: "error" },
      { status: statusCode },
    );
  }

  return redirect(`/tickets/${ticketId}`);
}

function mapCommentDeleteError(error: CommentDeleteError) {
  return match(error)
    .with("forbidden", () => ({
      message: "You can only delete your own comments.",
      statusCode: 403,
    }))
    .with("not-found", () => ({
      message: "Comment not found.",
      statusCode: 404,
    }))
    .exhaustive();
}

export function handleTicketDeleteCommentAction(
  database: AppDb,
  ticketId: string,
  callerId: string,
  formData: FormData,
) {
  const result = deleteOwnTicketComment(database, {
    commentId: String(formData.get("commentId") ?? ""),
    callerId,
  });

  if (result.isErr()) {
    const { message, statusCode } = mapCommentDeleteError(result.error);

    return data<TicketDeleteCommentActionData>(
      { intent: "delete-comment", message, status: "error" },
      { status: statusCode },
    );
  }

  return redirect(`/tickets/${ticketId}`);
}
