import { useActionData, useLoaderData } from "react-router";

import { Button } from "~/components/button";
import { db } from "~/db/client.server";
import { listEpics, type Epic } from "~/services/epics/epics.server";
import { requireAuthenticatedUser } from "~/services/session/session.server";
import { listTeams, type Team } from "~/services/teams/teams.server";
import { ticketStates, ticketTypes } from "~/services/tickets/ticket-workflow";

import {
  handleTicketCreateAction,
  type TicketCreateActionData,
} from "./new-action.server";
import { ScreenShell } from "../placeholders/placeholder-ui";

type LoaderData = {
  epics: Epic[];
  selectedTeamId: string;
  teams: Team[];
  userEmail: string;
};

export function meta() {
  return [{ title: "Create Ticket" }];
}

export async function loader({ request }: { request: Request }) {
  const user = await requireAuthenticatedUser(request);
  const teams = listTeams(db);
  const requestedTeamId = new URL(request.url).searchParams.get("teamId");
  const selectedTeamId =
    teams.find((team) => team.id === requestedTeamId)?.id ?? teams[0]?.id ?? "";

  return {
    epics: selectedTeamId === "" ? [] : listEpics(db, { teamId: selectedTeamId }),
    selectedTeamId,
    teams,
    userEmail: user.email,
  } satisfies LoaderData;
}

export async function action({ request }: { request: Request }) {
  const user = await requireAuthenticatedUser(request);

  return handleTicketCreateAction(db, user.id, await request.formData());
}

export function TicketCreateView({
  actionData,
  epics = [],
  selectedTeamId = "",
  teams = [],
  userEmail = "user@example.com",
}: {
  actionData?: TicketCreateActionData;
  epics?: Epic[];
  selectedTeamId?: string;
  teams?: Team[];
  userEmail?: string;
}) {
  return (
    <ScreenShell title="Create ticket" userEmail={userEmail}>
      {actionData ? (
        <p className="placeholder-notice" role="alert">
          {actionData.message}
        </p>
      ) : null}
      <form className="form-panel" method="get">
        <label className="form-field">
          <span>Team</span>
          <select defaultValue={selectedTeamId} name="teamId">
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="secondary">
          Load epics
        </Button>
      </form>
      <form className="form-panel" method="post">
        <h2>Ticket details</h2>
        <label className="form-field">
          <span>Team</span>
          <select defaultValue={selectedTeamId} name="teamId">
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>Epic</span>
          <select name="epicId">
            <option value="">No epic</option>
            {epics.map((epic) => (
              <option key={epic.id} value={epic.id}>
                {epic.title}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>Type</span>
          <select defaultValue="feature" name="type">
            {ticketTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>State</span>
          <select defaultValue="backlog" name="state">
            {ticketStates.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>Title</span>
          <input name="title" />
        </label>
        <label className="form-field">
          <span>Body</span>
          <textarea name="body" rows={6} />
        </label>
        <Button type="submit">Create ticket</Button>
      </form>
    </ScreenShell>
  );
}

export default function TicketCreate() {
  const loaderData = useLoaderData() as LoaderData;
  const actionData = useActionData() as TicketCreateActionData | undefined;

  return (
    <TicketCreateView
      actionData={actionData}
      epics={loaderData.epics}
      selectedTeamId={loaderData.selectedTeamId}
      teams={loaderData.teams}
      userEmail={loaderData.userEmail}
    />
  );
}
