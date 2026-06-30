import { data, redirect } from "react-router";

import type { AppDb } from "~/services/teams/teams.server";
import {
  createTicket,
  mapTicketCreateError,
} from "~/services/tickets/tickets.server";

export type TicketCreateActionData = {
  message: string;
  status: "error";
};

export function handleTicketCreateAction(
  database: AppDb,
  createdBy: string,
  formData: FormData,
) {
  const result = createTicket(database, {
    teamId: String(formData.get("teamId") ?? ""),
    epicId: normalizeOptionalFormValue(formData.get("epicId")),
    createdBy,
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
    type: String(formData.get("type") ?? ""),
    state: String(formData.get("state") ?? ""),
  });

  if (result.isErr()) {
    return data<TicketCreateActionData>(
      { message: mapTicketCreateError(result.error), status: "error" },
      { status: 400 },
    );
  }

  return redirect(`/tickets/${result.value.id}`);
}

function normalizeOptionalFormValue(value: FormDataEntryValue | null) {
  const normalizedValue = String(value ?? "").trim();

  return normalizedValue === "" ? null : normalizedValue;
}
