import { data } from "react-router";
import { match } from "ts-pattern";

import {
  createEpic,
  deleteEpic,
  editEpic,
  mapEpicMutationError,
} from "~/services/epics/epics.server";
import type { AppDb } from "~/services/teams/teams.server";

type ActionData = {
  message: string;
  status: "error" | "success";
};

export function handleEpicAction(database: AppDb, formData: FormData) {
  const intent = String(formData.get("intent") ?? "");

  return match(intent)
    .with("create", () =>
      mapMutationResult(
        createEpic(database, {
          teamId: String(formData.get("teamId") ?? ""),
          title: String(formData.get("title") ?? ""),
          description: normalizeOptionalText(formData.get("description")),
        }),
      ),
    )
    .with("edit", () =>
      mapMutationResult(
        editEpic(database, {
          id: String(formData.get("epicId") ?? ""),
          teamId: String(formData.get("teamId") ?? ""),
          title: String(formData.get("title") ?? ""),
          description: normalizeOptionalText(formData.get("description")),
        }),
      ),
    )
    .with("delete", () =>
      mapMutationResult(
        deleteEpic(database, { id: String(formData.get("epicId") ?? "") }),
      ),
    )
    .otherwise(() =>
      data<ActionData>(
        { message: "Unknown epic action.", status: "error" },
        { status: 400 },
      ),
    );
}

function normalizeOptionalText(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();

  return text.length > 0 ? text : null;
}

function mapMutationResult(
  result: ReturnType<typeof createEpic | typeof editEpic | typeof deleteEpic>,
) {
  if (result.isErr()) {
    const status = result.error.startsWith("blocked") ? 409 : 400;

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
