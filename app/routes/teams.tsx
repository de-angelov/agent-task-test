import { PlaceholderForm, PlaceholderNotice, ScreenShell } from "./placeholder-ui";

export function meta() {
  return [{ title: "Teams" }];
}

export async function action() {
  return { status: "placeholder-team-save" };
}

export function TeamsView() {
  return (
    <ScreenShell title="Team management">
      <PlaceholderNotice>
        Team create, rename, and blocked delete behavior will persist later.
      </PlaceholderNotice>
      <PlaceholderForm
        actionLabel="Save team"
        fields={[{ label: "Team name", name: "name", value: "Platform" }]}
        title="Create or rename team"
      />
      <ul className="item-list">
        <li>
          Platform <button type="button">Edit</button>{" "}
          <button type="button">Delete</button>
        </li>
        <li>
          Product <button type="button">Edit</button>{" "}
          <button type="button">Delete</button>
        </li>
      </ul>
    </ScreenShell>
  );
}

export default function Teams() {
  return <TeamsView />;
}
