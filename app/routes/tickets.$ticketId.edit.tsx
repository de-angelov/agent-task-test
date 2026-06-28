import { useLoaderData } from "react-router";

import { PlaceholderForm, PlaceholderNotice, ScreenShell } from "./placeholder-ui";

type LoaderArgs = {
  params: {
    ticketId?: string;
  };
};

export function meta() {
  return [{ title: "Edit Ticket" }];
}

export async function loader({ params }: LoaderArgs) {
  return {
    status: "placeholder-ticket-edit",
    ticketId: params.ticketId ?? "placeholder",
  };
}

export async function action() {
  return { status: "placeholder-ticket-update" };
}

export function TicketEditView({ ticketId = "placeholder" }: { ticketId?: string }) {
  const notice = `Editing ticket ${ticketId}. Saving unchanged values and same-team epic validation will be handled by later services.`;

  return (
    <ScreenShell title="Edit ticket">
      <PlaceholderNotice>{notice}</PlaceholderNotice>
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

  return <TicketEditView ticketId={data.ticketId} />;
}
