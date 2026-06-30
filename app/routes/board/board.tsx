import { useLoaderData } from "react-router";

import { db } from "~/db/client.server";
import { listEpics, type Epic } from "~/services/epics/epics.server";
import { requireAuthenticatedUser } from "~/services/session/session.server";
import { listTicketsForTeam, type TicketReadModel } from "~/services/tickets/tickets.server";
import { listTeams, type Team } from "~/services/teams/teams.server";

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

type LoaderData = {
  teams: Team[];
  selectedTeamId: string;
  epics: Epic[];
  tickets: TicketReadModel[];
  userEmail: string;
};

export function meta() {
  return [{ title: "Kanban Board" }];
}

export async function loader({ request }: { request: Request }) {
  const user = await requireAuthenticatedUser(request);
  const teams = listTeams(db);
  const requestedTeamId = new URL(request.url).searchParams.get("teamId") ?? "";
  const selectedTeam = teams.find((team) => team.id === requestedTeamId);
  const selectedTeamId = selectedTeam?.id ?? teams[0]?.id ?? "";

  if (selectedTeamId === "") {
    return {
      teams,
      selectedTeamId,
      epics: [],
      tickets: [],
      userEmail: user.email,
    } satisfies LoaderData;
  }

  return {
    teams,
    selectedTeamId,
    epics: listEpics(db, { teamId: selectedTeamId }),
    tickets: listTicketsForTeam(db, { teamId: selectedTeamId }),
    userEmail: user.email,
  } satisfies LoaderData;
}

export function BoardView({
  epics = [],
  selectedTeamId = "",
  teams = [],
  userEmail = "user@example.com",
}: Partial<LoaderData> = {}) {
  return (
    <ScreenShell title="Kanban board" userEmail={userEmail}>
      <PlaceholderNotice>
        Team selection, filtering, ticket navigation, and drag-and-drop
        persistence will connect to backend services later.
      </PlaceholderNotice>
      <section className="toolbar" aria-label="Board filters">
        <label className="form-field">
          <span>Team</span>
          <select defaultValue={selectedTeamId} name="team">
            {teams.length === 0 ? <option value="">No teams available</option> : null}
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
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
            {epics.map((epic) => (
              <option key={epic.id} value={epic.id}>
                {epic.title}
              </option>
            ))}
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

  return <BoardView {...data} />;
}
