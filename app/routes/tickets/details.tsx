import { Link, useLoaderData } from "react-router";
import { match } from "ts-pattern";

import { db } from "~/db/client.server";
import {
  getTicketById,
  type TicketReadModel,
} from "~/services/tickets/tickets.server";
import { type TicketState } from "~/services/tickets/ticket-workflow";
import { requireAuthenticatedUser } from "~/services/session/session.server";

type LoaderArgs = {
  request: Request;
  params: {
    ticketId?: string;
  };
};

type TicketDetailsLoaderData =
  | {
      status: "found";
      ticket: TicketReadModel;
    }
  | {
      status: "not-found";
      ticketId: string;
    };

export function meta() {
  return [{ title: "Ticket Details" }];
}

export async function loader({
  request,
  params,
}: LoaderArgs): Promise<TicketDetailsLoaderData> {
  await requireAuthenticatedUser(request);

  const ticketResult = getTicketById(db, {
    id: params.ticketId ?? "",
  });

  if (ticketResult.isErr()) {
    return {
      status: "not-found",
      ticketId: params.ticketId ?? "",
    };
  }

  return {
    status: "found",
    ticket: ticketResult.value,
  };
}

function getTicketStateLabel(state: TicketState): string {
  return match(state)
    .with("backlog", () => "Backlog")
    .with("todo", () => "Todo")
    .with("in-progress", () => "In progress")
    .with("done", () => "Done")
    .exhaustive();
}

export function TicketDetailsView({
  data,
}: {
  data: TicketDetailsLoaderData;
}) {
  if (data.status === "not-found") {
    return (
      <main>
        <h1>Ticket details</h1>
        <p>Ticket {data.ticketId} was not found.</p>
      </main>
    );
  }

  const { ticket } = data;

  return (
    <main>
      <h1>Ticket details</h1>
      <section aria-labelledby="ticket-title">
        <h2 id="ticket-title">{ticket.title}</h2>
        <p>{ticket.body}</p>
        <dl>
          <dt>Type</dt>
          <dd>{ticket.type}</dd>
          <dt>Team</dt>
          <dd>{ticket.teamName}</dd>
          <dt>Epic</dt>
          <dd>{ticket.epicTitle ?? "No epic"}</dd>
          <dt>State</dt>
          <dd>{getTicketStateLabel(ticket.state)}</dd>
          <dt>Created by</dt>
          <dd>{ticket.createdByEmail}</dd>
          <dt>Created timestamp</dt>
          <dd>{ticket.createdAt}</dd>
          <dt>Modified timestamp</dt>
          <dd>{ticket.modifiedAt}</dd>
        </dl>
        <Link to={`/tickets/${ticket.id}/edit`}>Edit ticket</Link>
      </section>
    </main>
  );
}

export default function TicketDetails() {
  const data = useLoaderData<typeof loader>();

  return <TicketDetailsView data={data} />;
}
