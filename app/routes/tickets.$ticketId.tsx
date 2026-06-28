import { useLoaderData } from "react-router";

import { requireAuthenticatedUser } from "~/services/session.server";

import { PlaceholderNotice, ScreenShell } from "./placeholder-ui";

type LoaderArgs = {
  request: Request;
  params: {
    ticketId?: string;
  };
};

export function meta() {
  return [{ title: "Ticket Details" }];
}

export async function loader({ request, params }: LoaderArgs) {
  await requireAuthenticatedUser(request);

  return {
    status: "placeholder-ticket-details",
    ticketId: params.ticketId ?? "placeholder",
  };
}

export function TicketDetailsView({ ticketId = "placeholder" }: { ticketId?: string }) {
  const notice = `Viewing ticket ${ticketId}. Full ticket fields, comments, and delete confirmation will connect to services later.`;

  return (
    <ScreenShell title="Ticket details">
      <PlaceholderNotice>{notice}</PlaceholderNotice>
      <dl className="details-list">
        <dt>Type</dt>
        <dd>feature</dd>
        <dt>Team</dt>
        <dd>Platform</dd>
        <dt>Epic</dt>
        <dd>Authentication</dd>
        <dt>State</dt>
        <dd>New</dd>
        <dt>Created by</dt>
        <dd>user@example.com</dd>
        <dt>Created at</dt>
        <dd>2026-06-28T00:00:00.000Z</dd>
        <dt>Modified at</dt>
        <dd>2026-06-28T00:00:00.000Z</dd>
      </dl>
      <a className="button-link" href={`/tickets/${ticketId}/edit`}>
        Edit ticket
      </a>
      <button type="button">Delete ticket</button>
    </ScreenShell>
  );
}

export default function TicketDetails() {
  const data = useLoaderData<typeof loader>();

  return <TicketDetailsView ticketId={data.ticketId} />;
}
