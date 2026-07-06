import { data, redirect } from "react-router";
import { match } from "ts-pattern";

import {
  addTicketComment,
  listTicketComments,
  type CommentAddError,
  type CommentReadModel,
} from "~/services/comments/comments.server";
import type { AppDb } from "~/services/teams/teams.server";
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
  userEmail: string;
};

export type TicketDetailsNotFound = {
  status: "not-found";
  ticketId: string;
  userEmail: string;
};

export type LoaderData = TicketDetailsFound | TicketDetailsNotFound;

export type TicketDeleteActionData = {
  message: string;
  status: "error";
};

export type TicketAddCommentActionData = {
  message: string;
  status: "error";
};

export function readTicketDetails(
  database: AppDb,
  ticketId: string,
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
    userEmail,
  };
}

export function handleTicketDeleteAction(
  database: AppDb,
  ticketId: string,
  formData: FormData,
) {
  if (formData.get("confirmDelete") !== "yes") {
    return data<TicketDeleteActionData>(
      {
        message: "Confirm deletion before deleting this ticket.",
        status: "error",
      },
      { status: 400 },
    );
  }

  const result = deleteTicket(database, { id: ticketId });

  if (result.isErr()) {
    return data<TicketDeleteActionData>(
      { message: mapTicketDeleteError(result.error), status: "error" },
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
      { message: mapCommentAddError(result.error), status: "error" },
      { status: 400 },
    );
  }

  return redirect(`/tickets/${ticketId}`);
}
