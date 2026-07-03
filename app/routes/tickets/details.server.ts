import { data, redirect } from "react-router";

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
};

export type TicketDetailsNotFound = {
  status: "not-found";
  ticketId: string;
};

export type LoaderData = TicketDetailsFound | TicketDetailsNotFound;

export type TicketDeleteActionData = {
  message: string;
  status: "error";
};

export function readTicketDetails(
  database: AppDb,
  ticketId: string,
): LoaderData {
  const ticket = getTicketById(database, { id: ticketId });

  if (ticket.isErr()) {
    return {
      status: "not-found",
      ticketId,
    };
  }

  return {
    status: "found",
    ticket: ticket.value,
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
