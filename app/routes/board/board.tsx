import { useLoaderData } from "react-router";

import { db } from "~/db/client.server";
import { listEpics, type Epic } from "~/services/epics/epics.server";
import { requireAuthenticatedUser } from "~/services/session/session.server";
import { ticketStates, type TicketState } from "~/services/tickets/ticket-workflow";
import { listTicketsForTeam, type TicketReadModel } from "~/services/tickets/tickets.server";
import { listTeams, type Team } from "~/services/teams/teams.server";

import { PlaceholderNotice, ScreenShell } from "../placeholders/placeholder-ui";

type LoaderData = {
  teams: Team[];
  selectedTeamId: string;
  epics: Epic[];
  tickets: TicketReadModel[];
  userEmail: string;
};

type BoardColumn = {
  state: TicketState;
  tickets: TicketReadModel[];
};

export function getBoardColumns(tickets: TicketReadModel[]): BoardColumn[] {
  return ticketStates.map((state) => ({
    state,
    tickets: tickets.filter((ticket) => ticket.state === state),
  }));
}

function getCreateTicketHref(selectedTeamId: string) {
  return selectedTeamId === ""
    ? "/tickets/new"
    : `/tickets/new?teamId=${encodeURIComponent(selectedTeamId)}`;
}

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

  const epics = listEpics(db, { teamId: selectedTeamId });
  const tickets = listTicketsForTeam(db, { teamId: selectedTeamId });

  return {
    teams,
    selectedTeamId,
    epics,
    tickets,
    userEmail: user.email,
  } satisfies LoaderData;
}

export function BoardView({
  epics = [],
  selectedTeamId = "",
  teams = [],
  tickets = [],
  userEmail = "user@example.com",
}: Partial<LoaderData> = {}) {
  const columns = getBoardColumns(tickets);

  return (
    <ScreenShell title="Kanban board" userEmail={userEmail}>
      <PlaceholderNotice>
        Team selection, filtering, and drag-and-drop persistence will connect to
        backend services later.
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
        <a className="button-link" href={getCreateTicketHref(selectedTeamId)}>
          Create ticket
        </a>
      </section>
      <section className="kanban-board" aria-label="Ticket workflow">
        {columns.map((column) => (
          <article className="kanban-column" key={column.state}>
            <h2>{column.state}</h2>
            {column.tickets.map((ticket) => (
              <a
                aria-label={`Open ticket ${ticket.title}`}
                className="ticket-card"
                href={`/tickets/${ticket.id}`}
                key={ticket.id}
              >
                <strong>{ticket.title}</strong>
                <span>{ticket.type}</span>
                <span>{ticket.epicTitle ?? "No epic"}</span>
                <span>Open ticket</span>
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
