import { useState } from "react";
import { useActionData, useLoaderData } from "react-router";

import { Button } from "~/components/button";
import { Dialog } from "~/components/dialog";
import { ScreenShell } from "~/components/screen-shell";
import { Table, type TableColumn } from "~/components/table";
import { db } from "~/db/client.server";
import { requireAuthenticatedUser } from "~/services/session/session.server";
import {
  listTeamManagementRows,
  type TeamManagementRow,
} from "~/services/teams/teams.server";

import { handleTeamAction } from "./teams-action.server";

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

  return handleTeamAction(db, formData);
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
      <TeamCreateDialog />
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

function TeamCreateDialog() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>Create team</Button>
      <Dialog
        cancelAction={
          <Button onClick={() => setIsOpen(false)} variant="secondary">
            Cancel
          </Button>
        }
        confirmAction={
          <Button form="create-team-form" type="submit">
            Create team
          </Button>
        }
        isOpen={isOpen}
        onCancel={() => setIsOpen(false)}
        title="Create team"
      >
        <form className="form-panel" id="create-team-form" method="post">
          <input name="intent" type="hidden" value="create" />
          <label className="form-field">
            <span>Team name</span>
            <input name="name" />
          </label>
        </form>
      </Dialog>
    </>
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
