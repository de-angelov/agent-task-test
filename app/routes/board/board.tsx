import {
  data,
  useActionData,
  useFetcher,
  useLoaderData,
  type FetcherWithComponents,
} from "react-router";
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { match } from "ts-pattern";

import { Button } from "~/components/button";
import { Dialog } from "~/components/dialog";
import { ScreenShell } from "~/components/screen-shell";
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

export type DragPersistInput = {
  ticketId: string;
  targetState: TicketState;
  previousState: TicketState;
  expectedModifiedAt: string | null;
};

type DragFetcher = FetcherWithComponents<TicketStateUpdateActionData>;

function dragFetcherKey(ticketId: string) {
  return `board-ticket-drag-${ticketId}`;
}

// One keyed fetcher per ticket, so submitting a new drag for a ticket
// supersedes that ticket's own in-flight request without affecting other
// tickets being dragged concurrently. Rendered by Board (not BoardView) so
// BoardView keeps rendering outside a router context for its render tests.
function TicketDragFetcher({
  onFetcherChange,
  ticketId,
}: {
  onFetcherChange: (ticketId: string, fetcher: DragFetcher) => void;
  ticketId: string;
}) {
  const fetcher = useFetcher<TicketStateUpdateActionData>({ key: dragFetcherKey(ticketId) });

  useEffect(() => {
    onFetcherChange(ticketId, fetcher);
  });

  return null;
}

function useTicketDragPersistence(tickets: TicketReadModel[]) {
  const fetchersRef = useRef(new Map<string, DragFetcher>());
  const previousFetcherStatesRef = useRef(new Map<string, DragFetcher["state"]>());
  const [dragError, setDragError] = useState<string | null>(null);

  function handleFetcherChange(ticketId: string, fetcher: DragFetcher) {
    fetchersRef.current.set(ticketId, fetcher);

    const previousState = previousFetcherStatesRef.current.get(ticketId);
    previousFetcherStatesRef.current.set(ticketId, fetcher.state);

    const hasSettled = previousState !== undefined && previousState !== "idle" && fetcher.state === "idle";

    if (hasSettled && fetcher.data?.status === "error") {
      setDragError(fetcher.data.message);
    }
  }

  function persistDrop(input: DragPersistInput) {
    const fetcher = fetchersRef.current.get(input.ticketId);

    if (!fetcher) {
      return;
    }

    setDragError(null);

    const formData = new FormData();
    formData.set("intent", "update-state");
    formData.set("ticketId", input.ticketId);
    formData.set("state", input.targetState);

    if (input.expectedModifiedAt !== null) {
      formData.set("expectedModifiedAt", input.expectedModifiedAt);
    }

    void fetcher.submit(formData, { method: "post" });
  }

  return {
    dragError,
    onFetcherChange: handleFetcherChange,
    persistDrop,
    ticketIds: tickets.map((ticket) => ticket.id),
  };
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
  dragError = null,
  epics = [],
  filters = { type: null, epicId: null, search: "" },
  persistDrop = () => {},
  selectedTeamId = "",
  teams = [],
  tickets = [],
  userEmail = "user@example.com",
}: Partial<LoaderData> & {
  actionData?: TicketCreateActionData;
  dragError?: string | null;
  persistDrop?: (input: DragPersistInput) => void;
} = {}) {
  const [localTickets, setLocalTickets] = useState(tickets);

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

    setLocalTickets((currentTickets) =>
      moveTicketState(currentTickets, ticketId, targetState),
    );

    persistDrop({
      ticketId,
      targetState,
      previousState,
      expectedModifiedAt: null,
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
  const { dragError, onFetcherChange, persistDrop, ticketIds } = useTicketDragPersistence(
    data.tickets,
  );

  return (
    <>
      {ticketIds.map((ticketId) => (
        <TicketDragFetcher key={ticketId} onFetcherChange={onFetcherChange} ticketId={ticketId} />
      ))}
      <BoardView {...data} actionData={actionData} dragError={dragError} persistDrop={persistDrop} />
    </>
  );
}
