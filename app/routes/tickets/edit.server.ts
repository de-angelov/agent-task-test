import type { AppDb } from "~/services/teams/teams.server";
import { listTeams, type Team } from "~/services/teams/teams.server";
import { listEpics, type Epic } from "~/services/epics/epics.server";
import type { TicketReadModel } from "~/services/tickets/tickets.server";
import { getTicketById } from "~/services/tickets/tickets.server";

export type TicketEditFound = {
  status: "found";
  userEmail: string;
  ticket: TicketReadModel;
  teams: Team[];
  epics: Epic[];
};

export type TicketEditNotFound = {
  status: "not-found";
  userEmail: string;
  ticketId: string;
};

export type LoaderData = TicketEditFound | TicketEditNotFound;

export function readTicketEdit(
  database: AppDb,
  ticketId: string,
  userEmail: string,
): LoaderData {
  const ticket = getTicketById(database, { id: ticketId });

  if (ticket.isErr()) {
    return {
      status: "not-found",
      userEmail,
      ticketId,
    };
  }

  const teams = listTeams(database);
  const epics = listEpics(database, { teamId: ticket.value.teamId });

  return {
    status: "found",
    userEmail,
    ticket: ticket.value,
    teams,
    epics,
  };
}
