import type { AppDb } from "~/services/teams/teams.server";
import type { TicketReadModel } from "~/services/tickets/tickets.server";
import { getTicketById } from "~/services/tickets/tickets.server";

export type TicketDetailsFound = {
  status: "found";
  ticket: TicketReadModel;
};

export type TicketDetailsNotFound = {
  status: "not-found";
  ticketId: string;
};

export type LoaderData = TicketDetailsFound | TicketDetailsNotFound;

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
