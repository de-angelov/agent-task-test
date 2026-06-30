import { useLoaderData } from "react-router";

import { Button } from "~/components/button";
import { requireAuthenticatedUser } from "~/services/session/session.server";
import { ticketStates, ticketTypes } from "~/services/tickets/ticket-workflow";

import { readTicketEdit, type LoaderData, type TicketEditFound } from "./edit.server";
import { ScreenShell } from "../placeholders/placeholder-ui";

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
  const { db } = await import("~/db/client.server");

  return readTicketEdit(db, params.ticketId ?? "", user.email);
}

export async function action({ request }: { request: Request }) {
  await requireAuthenticatedUser(request);

  return { status: "placeholder-ticket-update" };
}

function TicketEditForm({ data }: { data: TicketEditFound }) {
  return (
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
  );
}

export function TicketEditView({
  data,
}: {
  data: LoaderData;
}) {
  return (
    <ScreenShell title="Edit ticket" userEmail={data.userEmail}>
      {data.status === "found" ? (
        <TicketEditForm data={data} />
      ) : (
        <p role="status">Ticket {data.ticketId} was not found.</p>
      )}
    </ScreenShell>
  );
}

export default function TicketEdit() {
  const data = useLoaderData<typeof loader>();

  return <TicketEditView data={data} />;
}
