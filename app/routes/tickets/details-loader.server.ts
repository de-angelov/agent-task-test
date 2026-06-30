import type { AppDb } from "~/services/teams/teams.server";
import { getTicketById } from "~/services/tickets/tickets.server";

import type { TicketDetailsLoaderData } from "./details";

export function loadTicketDetails(
  database: AppDb,
  input: { ticketId?: string; userEmail: string },
): TicketDetailsLoaderData {
  const ticketId = input.ticketId ?? "";
  const ticket = getTicketById(database, { id: ticketId });

  if (ticket.isErr()) {
    return {
      status: "not-found",
      ticketId,
      userEmail: input.userEmail,
    };
  }

  return {
    status: "found",
    ticket: ticket.value,
    userEmail: input.userEmail,
  };
}
