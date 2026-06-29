import { useLoaderData } from "react-router";

import { requireAuthenticatedUser } from "~/services/session/session.server";

import { PlaceholderNotice, ScreenShell } from "../placeholders/placeholder-ui";

const states = [
  "New",
  "Ready for implementation",
  "In progress",
  "Ready for acceptance",
  "Done",
];

const cards = [
  { title: "Set up account verification", type: "feature", state: "New" },
  {
    title: "Persist ticket workflow state",
    type: "fix",
    state: "Ready for implementation",
  },
  { title: "Review blocked deletion message", type: "bug", state: "Done" },
];

export function meta() {
  return [{ title: "Kanban Board" }];
}

export async function loader({ request }: { request: Request }) {
  const user = await requireAuthenticatedUser(request);

  return { status: "placeholder-board", userEmail: user.email };
}

export function BoardView({ userEmail = "user@example.com" }: { userEmail?: string }) {
  return (
    <ScreenShell title="Kanban board" userEmail={userEmail}>
      <PlaceholderNotice>
        Team selection, filtering, ticket navigation, and drag-and-drop
        persistence will connect to backend services later.
      </PlaceholderNotice>
      <section className="toolbar" aria-label="Board filters">
        <label className="form-field">
          <span>Team</span>
          <select name="team">
            <option>Platform</option>
            <option>Product</option>
          </select>
        </label>
        <label className="form-field">
          <span>Ticket type</span>
          <select name="type">
            <option>All types</option>
            <option>bug</option>
            <option>feature</option>
            <option>fix</option>
          </select>
        </label>
        <label className="form-field">
          <span>Epic</span>
          <select name="epic">
            <option>All epics</option>
            <option>Authentication</option>
          </select>
        </label>
        <label className="form-field">
          <span>Search</span>
          <input name="search" type="search" />
        </label>
        <a className="button-link" href="/tickets/new">
          Create ticket
        </a>
      </section>
      <section className="kanban-board" aria-label="Ticket workflow">
        {states.map((state) => (
          <article className="kanban-column" key={state}>
            <h2>{state}</h2>
            {cards
              .filter((card) => card.state === state)
              .map((card) => (
                <a className="ticket-card" href="/tickets/placeholder" key={card.title}>
                  <strong>{card.title}</strong>
                  <span>{card.type}</span>
                  <span>Authentication</span>
                </a>
              ))}
          </article>
        ))}
      </section>
    </ScreenShell>
  );
}

export default function Board() {
  const data = useLoaderData<typeof loader>();

  return <BoardView userEmail={data.userEmail} />;
}
