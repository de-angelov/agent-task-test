import { data, useActionData, useLoaderData } from "react-router";
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { match } from "ts-pattern";

import { Button } from "~/components/button";
import { Dialog } from "~/components/dialog";
import { db } from "~/db/client.server";
import { listEpics, type Epic } from "~/services/epics/epics.server";
import { requireAuthenticatedUser } from "~/services/session/session.server";
import {
  ticketStates,
  ticketTypes,
  type TicketState,
  type TicketType,
} from "~/services/tickets/ticket-workflow";
import {
  getTicketById,
  listTicketsForTeam,
  mapTicketUpdateError,
  updateTicket,
  type TicketReadModel,
} from "~/services/tickets/tickets.server";
import { listTeams, type AppDb, type Team } from "~/services/teams/teams.server";

import { ScreenShell } from "../placeholders/placeholder-ui";
import {
  handleTicketCreateAction,
  type TicketCreateActionData,
} from "../tickets/new-action.server";
import { TicketCreateFields } from "../tickets/create-fields";

type LoaderData = {
  teams: Team[];
  selectedTeamId: string;
  epics: Epic[];
  tickets: TicketReadModel[];
  userEmail: string;
  filters: BoardFilters;
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

export function moveTicketState(
  tickets: TicketReadModel[],
  ticketId: string,
  targetState: TicketState,
): TicketReadModel[] {
  return tickets.map((ticket) =>
    ticket.id === ticketId && ticket.state !== targetState
      ? { ...ticket, state: targetState }
      : ticket,
  );
}

export type TicketDropOutcome =
  | { outcome: "persisted" }
  | { outcome: "rolled-back"; ticketId: string; previousState: TicketState; message: string };

export async function persistTicketDrop(input: {
  ticketId: string;
  targetState: TicketState;
  previousState: TicketState;
  expectedModifiedAt: string | null;
}): Promise<TicketDropOutcome> {
  const rollback = (message: string): TicketDropOutcome => ({
    outcome: "rolled-back",
    ticketId: input.ticketId,
    previousState: input.previousState,
    message,
  });

  const formData = new FormData();
  formData.set("intent", "update-state");
  formData.set("ticketId", input.ticketId);
  formData.set("state", input.targetState);

  if (input.expectedModifiedAt !== null) {
    formData.set("expectedModifiedAt", input.expectedModifiedAt);
  }

  try {
    const response = await fetch("/board", { method: "POST", body: formData });
    const result = (await response.json()) as TicketStateUpdateActionData;

    return result.status === "error" ? rollback(result.message) : { outcome: "persisted" };
  } catch {
    return rollback("Unable to save the ticket move. Try again.");
  }
}

export type BoardFilters = {
  type: TicketType | null;
  epicId: string | null;
  search: string;
};

export function parseBoardFilters(searchParams: URLSearchParams): BoardFilters {
  const requestedType = searchParams.get("type");
  const type = ticketTypes.find((ticketType) => ticketType === requestedType) ?? null;
  const requestedEpicId = (searchParams.get("epicId") ?? "").trim();
  const search = (searchParams.get("search") ?? "").trim();

  return {
    type,
    epicId: requestedEpicId === "" ? null : requestedEpicId,
    search,
  };
}

export function filterTickets(
  tickets: TicketReadModel[],
  filters: BoardFilters,
): TicketReadModel[] {
  const normalizedSearch = filters.search.toLowerCase();

  return tickets.filter((ticket) => {
    if (filters.type !== null && ticket.type !== filters.type) {
      return false;
    }

    if (filters.epicId !== null && ticket.epicId !== filters.epicId) {
      return false;
    }

    if (normalizedSearch !== "" && !ticket.title.toLowerCase().includes(normalizedSearch)) {
      return false;
    }

    return true;
  });
}

export function meta() {
  return [{ title: "Kanban Board" }];
}

export async function loader({ request }: { request: Request }) {
  const user = await requireAuthenticatedUser(request);
  const teams = listTeams(db);
  const searchParams = new URL(request.url).searchParams;
  const requestedTeamId = searchParams.get("teamId") ?? "";
  const selectedTeam = teams.find((team) => team.id === requestedTeamId);
  const selectedTeamId = selectedTeam?.id ?? teams[0]?.id ?? "";
  const filters = parseBoardFilters(searchParams);

  if (selectedTeamId === "") {
    return {
      teams,
      selectedTeamId,
      epics: [],
      tickets: [],
      userEmail: user.email,
      filters,
    } satisfies LoaderData;
  }

  const epics = listEpics(db, { teamId: selectedTeamId });
  const tickets = listTicketsForTeam(db, { teamId: selectedTeamId });

  return {
    teams,
    selectedTeamId,
    epics,
    tickets: filterTickets(tickets, filters),
    userEmail: user.email,
    filters,
  } satisfies LoaderData;
}

export async function action({ request }: { request: Request }) {
  const user = await requireAuthenticatedUser(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  return match(intent)
    .with("update-state", () => handleTicketStateUpdateAction(db, formData))
    .otherwise(() => handleTicketCreateAction(db, user.id, formData));
}

export type TicketStateUpdateActionData = {
  message: string;
  status: "error" | "success";
};

function handleTicketStateUpdateAction(database: AppDb, formData: FormData) {
  const ticketId = String(formData.get("ticketId") ?? "");
  const existingTicket = getTicketById(database, { id: ticketId });

  if (existingTicket.isErr()) {
    return data<TicketStateUpdateActionData>(
      { message: "Ticket not found.", status: "error" },
      { status: 404 },
    );
  }

  const expectedModifiedAt = normalizeOptionalFormValue(
    formData.get("expectedModifiedAt"),
  );

  if (
    expectedModifiedAt !== null &&
    expectedModifiedAt !== existingTicket.value.modifiedAt
  ) {
    return data<TicketStateUpdateActionData>(
      {
        message: "Ticket was updated elsewhere. Reload and try again.",
        status: "error",
      },
      { status: 409 },
    );
  }

  const result = updateTicket(database, {
    id: ticketId,
    teamId: existingTicket.value.teamId,
    epicId: existingTicket.value.epicId,
    title: existingTicket.value.title,
    body: existingTicket.value.body,
    type: existingTicket.value.type,
    state: String(formData.get("state") ?? ""),
  });

  if (result.isErr()) {
    const status = result.error === "not-found" ? 404 : 400;

    return data<TicketStateUpdateActionData>(
      { message: mapTicketUpdateError(result.error), status: "error" },
      { status },
    );
  }

  return data<TicketStateUpdateActionData>(
    { message: "Ticket state updated.", status: "success" },
    { status: 200 },
  );
}

function normalizeOptionalFormValue(value: FormDataEntryValue | null) {
  const normalizedValue = String(value ?? "").trim();

  return normalizedValue === "" ? null : normalizedValue;
}

export function BoardView({
  actionData,
  epics = [],
  filters = { type: null, epicId: null, search: "" },
  selectedTeamId = "",
  teams = [],
  tickets = [],
  userEmail = "user@example.com",
}: Partial<LoaderData> & {
  actionData?: TicketCreateActionData;
} = {}) {
  const [localTickets, setLocalTickets] = useState(tickets);
  const [dragError, setDragError] = useState<string | null>(null);
  // Tracks the newest in-flight persistence request per ticket so a slow or
  // failed request can't roll back a move that a later drag already applied.
  const latestDragRequestRef = useRef(new Map<string, number>());

  useEffect(() => {
    setLocalTickets(tickets);
  }, [tickets]);

  const columns = getBoardColumns(localTickets);
  const clearFiltersHref = selectedTeamId
    ? `/board?teamId=${selectedTeamId}`
    : "/board";

  function handleTicketDrop(event: DragEvent<HTMLElement>, targetState: TicketState) {
    event.preventDefault();
    const ticketId = event.dataTransfer.getData("text/plain");

    if (!ticketId) {
      return;
    }

    const ticket = localTickets.find((candidate) => candidate.id === ticketId);

    if (!ticket || ticket.state === targetState) {
      return;
    }

    const previousState = ticket.state;
    const requestId = (latestDragRequestRef.current.get(ticketId) ?? 0) + 1;
    latestDragRequestRef.current.set(ticketId, requestId);

    setDragError(null);
    setLocalTickets((currentTickets) =>
      moveTicketState(currentTickets, ticketId, targetState),
    );

    void persistTicketDrop({
      ticketId,
      targetState,
      previousState,
      expectedModifiedAt: null,
    }).then((outcome) => {
      const isLatestRequestForTicket =
        latestDragRequestRef.current.get(ticketId) === requestId;

      if (isLatestRequestForTicket && outcome.outcome === "rolled-back") {
        setLocalTickets((currentTickets) =>
          moveTicketState(currentTickets, outcome.ticketId, outcome.previousState),
        );
        setDragError(outcome.message);
      }
    });
  }

  return (
    <ScreenShell title="Kanban board" userEmail={userEmail}>
      {dragError ? (
        <p className="placeholder-notice" role="alert">
          {dragError}
        </p>
      ) : null}
      <section aria-label="Board actions" className="toolbar">
        <CreateTicketDialogEntry
          actionData={actionData}
          epics={epics}
          selectedTeamId={selectedTeamId}
          teams={teams}
        />
      </section>
      <section className="toolbar" aria-label="Board filters">
        <form className="form-panel" method="get">
          <label className="form-field">
            <span>Team</span>
            <select defaultValue={selectedTeamId} name="teamId">
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
            <select defaultValue={filters.type ?? ""} name="type">
              <option value="">All types</option>
              {ticketTypes.map((ticketType) => (
                <option key={ticketType} value={ticketType}>
                  {ticketType}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Epic</span>
            <select defaultValue={filters.epicId ?? ""} name="epicId">
              <option value="">All epics</option>
              {epics.map((epic) => (
                <option key={epic.id} value={epic.id}>
                  {epic.title}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Search</span>
            <input defaultValue={filters.search} name="search" type="search" />
          </label>
          <Button type="submit" variant="secondary">
            Apply filters
          </Button>
        </form>
        <a href={clearFiltersHref}>Clear filters</a>
      </section>
      <p>{`Total tickets: ${localTickets.length}`}</p>
      <section className="kanban-board" aria-label="Ticket workflow">
        {columns.map((column) => (
          <BoardColumnDropZone
            key={column.state}
            onDropTicket={handleTicketDrop}
            state={column.state}
            ticketCount={column.tickets.length}
          >
            {column.tickets.map((ticket) => (
              <DraggableTicketCard key={ticket.id} ticket={ticket} />
            ))}
          </BoardColumnDropZone>
        ))}
      </section>
    </ScreenShell>
  );
}

function BoardColumnDropZone({
  children,
  onDropTicket,
  state,
  ticketCount,
}: {
  children: ReactNode;
  onDropTicket: (event: DragEvent<HTMLElement>, state: TicketState) => void;
  state: TicketState;
  ticketCount: number;
}) {
  return (
    <article
      className="kanban-column"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => onDropTicket(event, state)}
    >
      <h2>{`${state} (${ticketCount})`}</h2>
      {children}
    </article>
  );
}

function DraggableTicketCard({ ticket }: { ticket: TicketReadModel }) {
  return (
    <a
      aria-label={`Open ticket ${ticket.title}`}
      className="ticket-card"
      draggable
      href={`/tickets/${ticket.id}`}
      onDragStart={(event) => event.dataTransfer.setData("text/plain", ticket.id)}
    >
      <strong>{ticket.title}</strong>
      <span>{ticket.type}</span>
      <span>{ticket.epicTitle ?? "No epic"}</span>
      <time dateTime={ticket.modifiedAt}>{ticket.modifiedAt}</time>
      <span>Open ticket</span>
    </a>
  );
}

function CreateTicketDialogEntry({
  actionData,
  epics,
  selectedTeamId,
  teams,
}: {
  actionData?: TicketCreateActionData;
  epics: Epic[];
  selectedTeamId: string;
  teams: Team[];
}) {
  const [isOpen, setIsOpen] = useState(Boolean(actionData));
  const formId = "board-create-ticket-form";

  useEffect(() => {
    if (actionData) {
      setIsOpen(true);
    }
  }, [actionData]);

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>Create ticket</Button>
      <Dialog
        cancelAction={
          <Button onClick={() => setIsOpen(false)} variant="secondary">
            Cancel
          </Button>
        }
        confirmAction={
          <Button form={formId} type="submit">
            Create ticket
          </Button>
        }
        isOpen={isOpen}
        onCancel={() => setIsOpen(false)}
        title="Create ticket"
      >
        {actionData ? (
          <p className="placeholder-notice" role="alert">
            {actionData.message}
          </p>
        ) : null}
        <form className="form-panel" id={formId} method="post">
          <TicketCreateFields
            epics={epics}
            selectedTeamId={selectedTeamId}
            teams={teams}
          />
        </form>
      </Dialog>
    </>
  );
}

export default function Board() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData() as TicketCreateActionData | undefined;

  return <BoardView {...data} actionData={actionData} />;
}
