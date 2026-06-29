import { data, useActionData, useLoaderData } from "react-router";
import { match } from "ts-pattern";

import { Button } from "~/components/button/button";
import { Table, type TableColumn } from "~/components/table/table";
import { db } from "~/db/client.server";
import { requireAuthenticatedUser } from "~/services/session.server";
import {
  createTeam,
  deleteTeam,
  listTeams,
  mapTeamMutationError,
  renameTeam,
  type Team,
} from "~/services/teams.server";

import { ScreenShell } from "./placeholder-ui";

type ActionData = {
  message: string;
  status: "error" | "success";
};

type LoaderData = {
  teams: Team[];
  userEmail: string;
};

export function meta() {
  return [{ title: "Teams" }];
}

export async function loader({ request }: { request: Request }) {
  const user = await requireAuthenticatedUser(request);

  return {
    teams: listTeams(db),
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
  teams?: Team[];
  userEmail?: string;
}) {
  const columns: Array<TableColumn<Team>> = [
    {
      header: "Name",
      id: "name",
      renderCell: (team) => team.name,
    },
    {
      header: "Created",
      id: "created",
      renderCell: (team) => team.createdAt,
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
              Rename
            </Button>
          </form>
          <form className="inline-form" method="post">
            <input name="intent" type="hidden" value="delete" />
            <input name="teamId" type="hidden" value={team.id} />
            <Button type="submit" variant="destructive">
              Delete
            </Button>
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
