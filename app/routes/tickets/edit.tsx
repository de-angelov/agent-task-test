import { useLoaderData } from "react-router";

import { Button } from "~/components/button";
import { requireAuthenticatedUser } from "~/services/session/session.server";

import { readTicketEdit, type LoaderData } from "./edit.server";
import {
  PlaceholderForm,
  PlaceholderNotice,
  ScreenShell,
} from "../placeholders/placeholder-ui";

type LoaderArgs = {
  request: Request;
  params: {
    ticketId?: string;
  };
};

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
          <option value="feature">feature</option>
          <option value="bug">bug</option>
          <option value="task">task</option>
        </select>
      </label>
      <label className="form-field">
        <span>State</span>
        <select defaultValue={data.ticket.state} name="state">
          <option value="backlog">backlog</option>
          <option value="todo">todo</option>
          <option value="in-progress">in-progress</option>
          <option value="done">done</option>
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
  ticketId = "placeholder",
}: {
  data?: LoaderData;
  ticketId?: string;
}) {
  if (data) {
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

  return (
    <ScreenShell title="Edit ticket" userEmail={data.userEmail}>
      <PlaceholderNotice>{`Editing ticket ${ticketId}. Saving unchanged values and same-team epic validation will be handled by later services.`}</PlaceholderNotice>
      <PlaceholderForm
        actionLabel="Save ticket"
        fields={[
          { label: "Title", name: "title", value: "Set up account verification" },
          { label: "Team", name: "team", value: "Platform" },
          { label: "Epic", name: "epic", value: "Authentication" },
          { label: "Type", name: "type", value: "feature" },
          { label: "State", name: "state", value: "new" },
        ]}
        title="Editable fields"
      >
        <label className="form-field">
          <span>Body</span>
          <textarea defaultValue="Placeholder ticket body" name="body" rows={6} />
        </label>
      </PlaceholderForm>
    </ScreenShell>
  );
}

export default function TicketEdit() {
  const data = useLoaderData<typeof loader>();

  return <TicketEditView data={data} />;
}
