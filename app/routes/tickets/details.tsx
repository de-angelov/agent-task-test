import { useLoaderData } from "react-router";
import { match } from "ts-pattern";

import type { TicketReadModel } from "~/services/tickets/tickets.server";
import { requireAuthenticatedUser } from "~/services/session/session.server";

import { readTicketDetails } from "./details.server";
import { ScreenShell } from "../placeholders/placeholder-ui";

type LoaderArgs = {
  request: Request;
  params: {
    ticketId?: string;
  };
};

type TicketDetailsFound = {
  status: "found";
  ticket: TicketReadModel;
};

type TicketDetailsNotFound = {
  status: "not-found";
  ticketId: string;
};

export type LoaderData = TicketDetailsFound | TicketDetailsNotFound;

export function meta() {
  return [{ title: "Ticket Details" }];
}

export async function loader({ request, params }: LoaderArgs) {
  await requireAuthenticatedUser(request);

  const { db } = await import("~/db/client.server");

  return readTicketDetails(db, params.ticketId ?? "");
}

function getStateLabel(state: TicketReadModel["state"]) {
  return match(state)
    .with("backlog", () => "backlog")
    .with("todo", () => "todo")
    .with("in-progress", () => "in-progress")
    .with("done", () => "done")
    .exhaustive();
}

function TicketDetailsFields({ ticket }: { ticket: TicketReadModel }) {
  return (
    <dl className="details-list">
      <dt>Title</dt>
      <dd>{ticket.title}</dd>
      <dt>Body</dt>
      <dd>{ticket.body}</dd>
      <dt>Type</dt>
      <dd>{ticket.type}</dd>
      <dt>Team</dt>
      <dd>{ticket.teamName}</dd>
      <dt>Epic</dt>
      <dd>{ticket.epicTitle ?? "No epic"}</dd>
      <dt>State</dt>
      <dd>{getStateLabel(ticket.state)}</dd>
      <dt>Created by</dt>
      <dd>{ticket.createdByEmail}</dd>
      <dt>Created at</dt>
      <dd>
        <time dateTime={ticket.createdAt}>{ticket.createdAt}</time>
      </dd>
      <dt>Modified at</dt>
      <dd>
        <time dateTime={ticket.modifiedAt}>{ticket.modifiedAt}</time>
      </dd>
    </dl>
  );
}

export function TicketDetailsView({ data }: { data: LoaderData }) {
  return (
    <ScreenShell title="Ticket details">
      {data.status === "found" ? (
        <>
          <TicketDetailsFields ticket={data.ticket} />
          <a className="button-link" href={`/tickets/${data.ticket.id}/edit`}>
            Edit ticket
          </a>
        </>
      ) : (
        <p role="status">Ticket {data.ticketId} was not found.</p>
      )}
    </ScreenShell>
  );
}

export default function TicketDetails() {
  const data = useLoaderData<typeof loader>();

  return <TicketDetailsView data={data} />;
}
