import { data, redirect } from "react-router";

import { listEpics, type Epic } from "~/services/epics/epics.server";
import {
  getTicketById,
  mapTicketUpdateError,
  updateTicket,
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

export type TicketEditActionData = {
  message: string;
  status: "error";
};

export function handleTicketEditAction(
  database: AppDb,
  ticketId: string,
  formData: FormData,
) {
  const result = updateTicket(database, {
    id: ticketId,
    teamId: String(formData.get("teamId") ?? ""),
    epicId: normalizeOptionalFormValue(formData.get("epicId")),
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
    type: String(formData.get("type") ?? ""),
    state: String(formData.get("state") ?? ""),
  });

  if (result.isErr()) {
    return data<TicketEditActionData>(
      { message: mapTicketUpdateError(result.error), status: "error" },
      { status: 400 },
    );
  }

  return redirect(`/tickets/${result.value.id}`);
}

function normalizeOptionalFormValue(value: FormDataEntryValue | null) {
  const normalizedValue = String(value ?? "").trim();

  return normalizedValue === "" ? null : normalizedValue;
}
