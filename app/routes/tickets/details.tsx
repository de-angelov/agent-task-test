import { useLoaderData } from "react-router";
import { match } from "ts-pattern";

import { db } from "~/db/client.server";
import { requireAuthenticatedUser } from "~/services/session/session.server";
import type { TicketState } from "~/services/tickets/ticket-workflow";

import { loadTicketDetails } from "./details-loader.server";
import { ScreenShell } from "../placeholders/placeholder-ui";

type LoaderArgs = {
  request: Request;
  params: {
    ticketId?: string;
  };
};

export type TicketDetailsLoaderData =
  | {
      status: "found";
      ticket: TicketDetailsTicket;
      userEmail: string;
    }
  | {
      status: "not-found";
      ticketId: string;
      userEmail: string;
    };

type TicketDetailsTicket = {
  id: string;
  title: string;
  body: string;
  type: "feature" | "bug" | "task";
  state: TicketState;
  teamId: string;
  teamName: string;
  epicId: string | null;
  epicTitle: string | null;
  createdBy: string;
  createdByEmail: string;
  createdAt: string;
  modifiedAt: string;
};

export function meta() {
  return [{ title: "Ticket Details" }];
}

export function formatTicketState(state: TicketState) {
  return match(state)
    .with("backlog", () => "Backlog")
    .with("todo", () => "Todo")
    .with("in-progress", () => "In progress")
    .with("done", () => "Done")
    .exhaustive();
}

function formatTicketType(type: TicketDetailsTicket["type"]) {
  return match(type)
    .with("feature", () => "Feature")
    .with("bug", () => "Bug")
    .with("task", () => "Task")
    .exhaustive();
}

export async function loader({ request, params }: LoaderArgs) {
  const user = await requireAuthenticatedUser(request);

  return loadTicketDetails(db, {
    ticketId: params.ticketId,
    userEmail: user.email,
  });
}

export function TicketDetailsView({
  data,
}: {
  data?: TicketDetailsLoaderData;
}) {
  const loaderData =
    data ??
    ({
      status: "not-found",
      ticketId: "placeholder",
      userEmail: "user@example.com",
    } satisfies TicketDetailsLoaderData);

  if (loaderData.status === "not-found") {
    return (
      <ScreenShell title="Ticket details" userEmail={loaderData.userEmail}>
        <p className="placeholder-notice" role="alert">
          Ticket not found.
        </p>
      </ScreenShell>
    );
  }

  const { ticket } = loaderData;

  return (
    <ScreenShell title="Ticket details" userEmail={loaderData.userEmail}>
      <h2>{ticket.title}</h2>
      <dl className="details-list">
        <dt>Title</dt>
        <dd>{ticket.title}</dd>
        <dt>Body</dt>
        <dd>{ticket.body}</dd>
        <dt>Type</dt>
        <dd>{formatTicketType(ticket.type)}</dd>
        <dt>Team</dt>
        <dd>{ticket.teamName}</dd>
        <dt>Epic</dt>
        <dd>{ticket.epicTitle ?? "No epic"}</dd>
        <dt>State</dt>
        <dd>{formatTicketState(ticket.state)}</dd>
        <dt>Created by</dt>
        <dd>{ticket.createdByEmail}</dd>
        <dt>Created at</dt>
        <dd>{ticket.createdAt}</dd>
        <dt>Modified at</dt>
        <dd>{ticket.modifiedAt}</dd>
      </dl>
      <a className="button-link" href={`/tickets/${ticket.id}/edit`}>
        Edit ticket
      </a>
    </ScreenShell>
  );
}

export default function TicketDetails() {
  const data = useLoaderData<typeof loader>();

  return <TicketDetailsView data={data} />;
}
