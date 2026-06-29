import { data, useActionData, useLoaderData } from "react-router";
import { match } from "ts-pattern";

import { Button } from "~/components/button";
import { Table, type TableColumn } from "~/components/table";
import { db } from "~/db/client.server";
import { requireAuthenticatedUser } from "~/services/session/session.server";
import {
  createTeam,
  deleteTeam,
  listTeamManagementRows,
  mapTeamMutationError,
  renameTeam,
  type TeamManagementRow,
} from "~/services/teams/teams.server";

import { ScreenShell } from "../placeholders/placeholder-ui";

type ActionData = {
  message: string;
  status: "error" | "success";
};

type LoaderData = {
  teams: TeamManagementRow[];
  userEmail: string;
};

export function meta() {
  return [{ title: "Teams" }];
}

export async function loader({ request }: { request: Request }) {
  const user = await requireAuthenticatedUser(request);

  return {
    teams: listTeamManagementRows(db),
    userEmail: user.email,
  } satisfies LoaderData;
}

export async function action({ request }: { request: Request }) {
  await requireAuthenticatedUser(request);

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  return match(intent)
    .with("create", () =>
      mapMutationResult(
        createTeam(db, { name: String(formData.get("name") ?? "") }),
      ),
    )
    .with("rename", () =>
      mapMutationResult(
        renameTeam(db, {
          id: String(formData.get("teamId") ?? ""),
          name: String(formData.get("name") ?? ""),
        }),
      ),
    )
    .with("delete", () =>
      mapMutationResult(
        deleteTeam(db, { id: String(formData.get("teamId") ?? "") }),
      ),
    )
    .otherwise(() =>
      data<ActionData>(
        { message: "Unknown team action.", status: "error" },
        { status: 400 },
      ),
    );
}

function mapMutationResult(
  result: ReturnType<typeof createTeam | typeof renameTeam | typeof deleteTeam>,
) {
  if (result.isErr()) {
    const status = result.error.startsWith("blocked") ? 409 : 400;

    return data<ActionData>(
      { message: mapTeamMutationError(result.error), status: "error" },
      { status },
    );
  }

  return data<ActionData>(
    { message: "Team changes saved.", status: "success" },
    { status: 200 },
  );
}

export function TeamsView({
  actionData,
  teams = [],
  userEmail = "user@example.com",
}: {
  actionData?: ActionData;
  teams?: TeamManagementRow[];
  userEmail?: string;
}) {
  const columns: Array<TableColumn<TeamManagementRow>> = [
    {
      header: "Name",
      id: "name",
      renderCell: (team) => team.name,
    },
    {
      header: "Tickets",
      id: "tickets",
      renderCell: (team) => team.ticketCount,
    },
    {
      header: "Epics",
      id: "epics",
      renderCell: (team) => team.epicCount,
    },
    {
      header: "Modified",
      id: "modified",
      renderCell: (team) => team.updatedAt,
    },
    {
      header: "Actions",
      id: "actions",
      renderCell: (team) => (
        <div className="toolbar">
          <form className="inline-form" method="post">
            <input name="intent" type="hidden" value="rename" />
            <input name="teamId" type="hidden" value={team.id} />
            <label className="form-field">
              <span>Team name</span>
              <input defaultValue={team.name} name="name" />
            </label>
            <Button type="submit" variant="secondary">
              Save team
            </Button>
          </form>
          <form className="inline-form" method="post">
            <input name="intent" type="hidden" value="delete" />
            <input name="teamId" type="hidden" value={team.id} />
            <Button
              aria-describedby={
                isTeamDeleteBlocked(team) ? `${team.id}-delete-blocked` : undefined
              }
              disabled={isTeamDeleteBlocked(team)}
              type="submit"
              variant="destructive"
            >
              Delete
            </Button>
            {isTeamDeleteBlocked(team) ? (
              <p id={`${team.id}-delete-blocked`}>
                Delete blocked until this team has no tickets or epics.
              </p>
            ) : null}
          </form>
        </div>
      ),
    },
  ];

  return (
    <ScreenShell title="Team management" userEmail={userEmail}>
      {actionData ? (
        <p className="placeholder-notice" role="alert">
          {actionData.message}
        </p>
      ) : null}
      <form className="form-panel" method="post">
        <h2>Create team</h2>
        <input name="intent" type="hidden" value="create" />
        <label className="form-field">
          <span>Team name</span>
          <input name="name" />
        </label>
        <Button type="submit">Create team</Button>
      </form>
      <Table
        caption="Teams"
        columns={columns}
        getRowKey={(team) => team.id}
        messages={{ empty: "No teams have been created." }}
        rows={teams}
      />
    </ScreenShell>
  );
}

function isTeamDeleteBlocked(team: TeamManagementRow) {
  return team.ticketCount > 0 || team.epicCount > 0;
}

export default function Teams() {
  const loaderData = useLoaderData() as LoaderData;
  const actionData = useActionData() as ActionData | undefined;

  return (
    <TeamsView
      actionData={actionData}
      teams={loaderData.teams}
      userEmail={loaderData.userEmail}
    />
  );
}
