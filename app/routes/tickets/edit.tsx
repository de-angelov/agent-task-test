import { useActionData, useLoaderData } from "react-router";

import { Button } from "~/components/button";
import { ScreenShell } from "~/components/screen-shell";
import { db } from "~/db/client.server";
import { requireAuthenticatedUser } from "~/services/session/session.server";
import { ticketStates, ticketTypes } from "~/services/tickets/ticket-workflow";

import {
  handleTicketEditAction,
  readTicketEdit,
  type LoaderData,
  type TicketEditActionData,
} from "./edit.server";

type LoaderArgs = {
  request: Request;
  params: {
    ticketId?: string;
  };
};

export function meta() {
  return [{ title: "Edit Ticket" }];
}

export async function loader({ request, params }: LoaderArgs) {
  const user = await requireAuthenticatedUser(request);

  return readTicketEdit(db, params.ticketId ?? "", user.email);
}

export async function action({ request, params }: LoaderArgs) {
  const user = await requireAuthenticatedUser(request);

  return handleTicketEditAction(
    db,
    params.ticketId ?? "",
    user.id,
    await request.formData(),
  );
}

export function TicketEditView({
  actionData,
  data,
}: {
  actionData?: TicketEditActionData;
  data: LoaderData;
}) {
  return (
    <ScreenShell title="Edit ticket" userEmail={data.userEmail}>
      {actionData ? (
        <p className="placeholder-notice" role="alert">
          {actionData.message}
        </p>
      ) : null}
      {data.status === "not-found" ? (
        <p role="status">Ticket {data.ticketId} was not found.</p>
      ) : (
        <>
          <form className="form-panel" method="post">
            <h2>Ticket details</h2>
            <label className="form-field">
              <span>Team</span>
              <select defaultValue={data.ticket.teamId} name="teamId">
                {data.teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Epic</span>
              <select defaultValue={data.ticket.epicId ?? ""} name="epicId">
                <option value="">No epic</option>
                {data.epics.map((epic) => (
                  <option key={epic.id} value={epic.id}>
                    {epic.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Type</span>
              <select defaultValue={data.ticket.type} name="type">
                {ticketTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>State</span>
              <select defaultValue={data.ticket.state} name="state">
                {ticketStates.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Title</span>
              <input defaultValue={data.ticket.title} name="title" />
            </label>
            <label className="form-field">
              <span>Body</span>
              <textarea defaultValue={data.ticket.body} name="body" rows={6} />
            </label>
            <Button type="submit">Save ticket</Button>
          </form>
          <a className="button-link" href={`/tickets/${data.ticket.id}`}>
            Back to ticket details
          </a>
        </>
      )}
    </ScreenShell>
  );
}

export default function TicketEdit() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return <TicketEditView actionData={actionData} data={data} />;
}
