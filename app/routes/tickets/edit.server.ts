import type { AppDb, Team } from "~/services/teams/teams.server";
import { listTeams } from "~/services/teams/teams.server";
import { listEpics, type Epic } from "~/services/epics/epics.server";
import { getTicketById, type TicketReadModel } from "~/services/tickets/tickets.server";

export type TicketEditFound = {
  status: "found";
  ticket: TicketReadModel;
  teams: Team[];
  epics: Epic[];
  userEmail: string;
};

export type TicketEditNotFound = {
  status: "not-found";
  ticketId: string;
  teams: Team[];
  userEmail: string;
};

export type LoaderData = TicketEditFound | TicketEditNotFound;

export function readTicketEdit(
  database: AppDb,
  ticketId: string,
  userEmail: string,
): LoaderData {
  const teams = listTeams(database);
  const ticket = getTicketById(database, { id: ticketId });

  if (ticket.isErr()) {
    return {
      status: "not-found",
      ticketId,
      teams,
      userEmail,
    };
  }

  return {
    status: "found",
    ticket: ticket.value,
    teams,
    epics: listEpics(database, { teamId: ticket.value.teamId }),
    userEmail,
  };
}
