import { listEpics, type Epic } from "~/services/epics/epics.server";
import {
  getTicketById,
  type TicketReadModel,
} from "~/services/tickets/tickets.server";
import { listTeams, type AppDb, type Team } from "~/services/teams/teams.server";

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
  teams: Team[];
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
