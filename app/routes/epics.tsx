import { data, redirect, useActionData, useLoaderData } from "react-router";
import { match } from "ts-pattern";

import { Button } from "~/components/button";
import { Table, type TableColumn } from "~/components/table";
import { db } from "~/db/client.server";
import {
  createEpic,
  deleteEpic,
  listEpics,
  mapEpicMutationError,
  updateEpic,
  type Epic,
} from "~/services/epics.server";
import { requireAuthenticatedUser } from "~/services/auth.server";
import { listTeams, type Team } from "~/services/teams.server";

import { ScreenShell } from "./placeholder-ui";

type ActionData = {
  message: string;
  status: "error" | "success";
};

type LoaderData = {
  epics: Epic[];
  teams: Team[];
  userEmail: string;
};

export function meta() {
  return [{ title: "Epics" }];
}

export async function loader({ request }: { request: Request }) {
  const user = requireAuthenticatedUser(request);

  if (user.isErr()) {
    throw redirect("/login");
  }

  return {
    epics: listEpics(db),
    teams: listTeams(db),
    userEmail: user.value.email,
  } satisfies LoaderData;
}

export async function action({ request }: { request: Request }) {
  const user = requireAuthenticatedUser(request);

  if (user.isErr()) {
    throw redirect("/login");
  }

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  return match(intent)
    .with("create", () =>
      mapMutationResult(
        createEpic(db, {
          teamId: String(formData.get("teamId") ?? ""),
          title: String(formData.get("title") ?? ""),
          description: String(formData.get("description") ?? ""),
        }),
      ),
    )
    .with("update", () =>
      mapMutationResult(
        updateEpic(db, {
          id: String(formData.get("epicId") ?? ""),
          teamId: String(formData.get("teamId") ?? ""),
          title: String(formData.get("title") ?? ""),
          description: String(formData.get("description") ?? ""),
        }),
      ),
    )
    .with("delete", () =>
      mapMutationResult(
        deleteEpic(db, { id: String(formData.get("epicId") ?? "") }),
      ),
    )
    .otherwise(() =>
      data<ActionData>(
        { message: "Unknown epic action.", status: "error" },
        { status: 400 },
      ),
    );
}

function mapMutationResult(
  result:
    | ReturnType<typeof createEpic>
    | ReturnType<typeof updateEpic>
    | ReturnType<typeof deleteEpic>,
) {
  if (result.isErr()) {
    const status = result.error === "blocked-by-tickets" ? 409 : 400;

    return data<ActionData>(
      { message: mapEpicMutationError(result.error), status: "error" },
      { status },
    );
  }

  return data<ActionData>(
    { message: "Epic changes saved.", status: "success" },
    { status: 200 },
  );
}

export function EpicsView({
  actionData,
  epics = [],
  teams = [],
  userEmail = "user@example.com",
}: {
  actionData?: ActionData;
  epics?: Epic[];
  teams?: Team[];
  userEmail?: string;
}) {
  const teamNamesById = new Map(teams.map((team) => [team.id, team.name]));
  const columns: Array<TableColumn<Epic>> = [
    {
      header: "Title",
      id: "title",
      renderCell: (epic) => epic.title,
    },
    {
      header: "Team",
      id: "team",
      renderCell: (epic) => teamNamesById.get(epic.teamId) ?? "Unknown team",
    },
    {
      header: "Description",
      id: "description",
      renderCell: (epic) => epic.description ?? "",
    },
    {
      header: "Created",
      id: "created",
      renderCell: (epic) => epic.createdAt,
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
            <input name="intent" type="hidden" value="update" />
            <input name="epicId" type="hidden" value={epic.id} />
            <input name="teamId" type="hidden" value={epic.teamId} />
            <p>Team: {teamNamesById.get(epic.teamId) ?? "Unknown team"}</p>
            <label className="form-field">
              <span>Epic title</span>
              <input defaultValue={epic.title} name="title" />
            </label>
            <label className="form-field">
              <span>Description</span>
              <textarea
                defaultValue={epic.description ?? ""}
                name="description"
                rows={4}
              />
            </label>
            <Button type="submit" variant="secondary">
              Save
            </Button>
          </form>
          <form className="inline-form" method="post">
            <input name="intent" type="hidden" value="delete" />
            <input name="epicId" type="hidden" value={epic.id} />
            <Button type="submit" variant="destructive">
              Delete
            </Button>
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
            <option value="">Select a team</option>
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
