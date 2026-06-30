import type { AppDb } from "~/services/teams/teams.server";
import { getTicketById } from "~/services/tickets/tickets.server";

import type { LoaderData } from "./details";

export function readTicketDetails(database: AppDb, ticketId: string): LoaderData {
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
