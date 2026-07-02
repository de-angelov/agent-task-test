import { data } from "react-router";
import { match } from "ts-pattern";

import {
  createTeam,
  deleteTeam,
  mapTeamMutationError,
  renameTeam,
  type AppDb,
} from "~/services/teams/teams.server";

type ActionData = {
  message: string;
  status: "error" | "success";
};

export function handleTeamAction(database: AppDb, formData: FormData) {
  const intent = String(formData.get("intent") ?? "");

  return match(intent)
    .with("create", () =>
      mapMutationResult(
        createTeam(database, { name: String(formData.get("name") ?? "") }),
      ),
    )
    .with("rename", () =>
      mapMutationResult(
        renameTeam(database, {
          id: String(formData.get("teamId") ?? ""),
          name: String(formData.get("name") ?? ""),
        }),
      ),
    )
    .with("delete", () =>
      mapMutationResult(
        deleteTeam(database, { id: String(formData.get("teamId") ?? "") }),
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
