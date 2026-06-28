import { requireAuthenticatedUser } from "~/services/session.server";

import { PlaceholderForm, PlaceholderNotice, ScreenShell } from "./placeholder-ui";

export function meta() {
  return [{ title: "Create Ticket" }];
}

export async function loader({ request }: { request: Request }) {
  await requireAuthenticatedUser(request);

  return { status: "placeholder-ticket-create" };
}

export async function action({ request }: { request: Request }) {
  await requireAuthenticatedUser(request);

  return { status: "placeholder-ticket-create" };
}

export function TicketCreateView() {
  return (
    <ScreenShell title="Create ticket">
      <PlaceholderNotice>
        Ticket creation will persist through the backend API later.
      </PlaceholderNotice>
      <PlaceholderForm
        actionLabel="Create ticket"
        fields={[
          { label: "Title", name: "title" },
          { label: "Team", name: "team", value: "Platform" },
          { label: "Epic", name: "epic", value: "Authentication" },
          { label: "Type", name: "type", value: "feature" },
          { label: "State", name: "state", value: "new" },
        ]}
        title="Ticket details"
      >
        <label className="form-field">
          <span>Body</span>
          <textarea name="body" rows={6} />
        </label>
      </PlaceholderForm>
    </ScreenShell>
  );
}

export default function TicketCreate() {
  return <TicketCreateView />;
}
