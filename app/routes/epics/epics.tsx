import { useActionData, useLoaderData } from "react-router";

import { Button } from "~/components/button";
import { Table, type TableColumn } from "~/components/table";
import { db } from "~/db/client.server";
import {
  listEpicManagementRows,
  type EpicManagementRow,
} from "~/services/epics/epics.server";
import { requireAuthenticatedUser } from "~/services/session/session.server";
import { listTeams, type Team } from "~/services/teams/teams.server";

import { handleEpicAction } from "./epics-action.server";
import { ScreenShell } from "../placeholders/placeholder-ui";

export type ActionData = {
  message: string;
  status: "error" | "success";
};

type LoaderData = {
  epics: EpicManagementRow[];
  teams: Team[];
  userEmail: string;
};

export function meta() {
  return [{ title: "Epics" }];
}

export async function loader({ request }: { request: Request }) {
  const user = await requireAuthenticatedUser(request);

  return {
    epics: listEpicManagementRows(db),
    teams: listTeams(db),
    userEmail: user.email,
  } satisfies LoaderData;
}

export async function action({ request }: { request: Request }) {
  await requireAuthenticatedUser(request);

  return handleEpicAction(db, await request.formData());
}

export function EpicsView({
  actionData,
  epics = [],
  teams = [],
  userEmail = "user@example.com",
}: {
  actionData?: ActionData;
  epics?: EpicManagementRow[];
  teams?: Team[];
  userEmail?: string;
}) {
  const columns: Array<TableColumn<EpicManagementRow>> = [
    {
      header: "Team",
      id: "team",
      renderCell: (epic) => epic.teamName,
    },
    {
      header: "Title",
      id: "title",
      renderCell: (epic) => epic.title,
    },
    {
      header: "Description",
      id: "description",
      renderCell: (epic) => epic.description ?? "",
    },
    {
      header: "Tickets",
      id: "tickets",
      renderCell: (epic) => epic.ticketCount,
    },
    {
      header: "Modified",
      id: "modified",
      renderCell: (epic) => epic.updatedAt,
    },
    {
      header: "Actions",
      id: "actions",
      renderCell: (epic) => (
        <div className="toolbar">
          <form className="inline-form" method="post">
            <input name="intent" type="hidden" value="edit" />
            <input name="epicId" type="hidden" value={epic.id} />
            <input name="teamId" type="hidden" value={epic.teamId} />
            <label className="form-field">
              <span>Epic title</span>
              <input defaultValue={epic.title} name="title" />
            </label>
            <label className="form-field">
              <span>Description</span>
              <textarea
                defaultValue={epic.description ?? ""}
                name="description"
                rows={3}
              />
            </label>
            <Button type="submit" variant="secondary">
              Save epic
            </Button>
          </form>
          <form className="inline-form" method="post">
            <input name="intent" type="hidden" value="delete" />
            <input name="epicId" type="hidden" value={epic.id} />
            <Button
              disabled={epic.ticketCount > 0}
              type="submit"
              variant="destructive"
            >
              Delete
            </Button>
            {epic.ticketCount > 0 ? (
              <p>{getBlockedDeleteCopy(epic.ticketCount)}</p>
            ) : null}
          </form>
        </div>
      ),
    },
  ];

  return (
    <ScreenShell title="Epic management" userEmail={userEmail}>
      {actionData ? (
        <p className="placeholder-notice" role="alert">
          {actionData.message}
        </p>
      ) : null}
      <form className="form-panel" method="post">
        <h2>Create epic</h2>
        <input name="intent" type="hidden" value="create" />
        <label className="form-field">
          <span>Team</span>
          <select name="teamId">
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>Epic title</span>
          <input name="title" />
        </label>
        <label className="form-field">
          <span>Description</span>
          <textarea name="description" rows={4} />
        </label>
        <Button type="submit">Create epic</Button>
      </form>
      <Table
        caption="Epics"
        columns={columns}
        getRowKey={(epic) => epic.id}
        messages={{ empty: "No epics have been created." }}
        rows={epics}
      />
    </ScreenShell>
  );
}

function getBlockedDeleteCopy(ticketCount: number) {
  const ticketLabel =
    ticketCount === 1 ? "ticket references" : "tickets reference";

  return `Delete unavailable while ${ticketCount} ${ticketLabel} this epic.`;
}

export default function Epics() {
  const loaderData = useLoaderData() as LoaderData;
  const actionData = useActionData() as ActionData | undefined;

  return (
    <EpicsView
      actionData={actionData}
      epics={loaderData.epics}
      teams={loaderData.teams}
      userEmail={loaderData.userEmail}
    />
  );
}
