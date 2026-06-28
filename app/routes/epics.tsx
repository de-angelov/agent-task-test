import { PlaceholderForm, PlaceholderNotice, ScreenShell } from "./placeholder-ui";

export function meta() {
  return [{ title: "Epics" }];
}

export async function action() {
  return { status: "placeholder-epic-save" };
}

export function EpicsView() {
  return (
    <ScreenShell title="Epic management">
      <PlaceholderNotice>
        Epic CRUD, team assignment, and blocked delete behavior will persist
        later.
      </PlaceholderNotice>
      <PlaceholderForm
        actionLabel="Save epic"
        fields={[
          { label: "Team", name: "team", value: "Platform" },
          { label: "Title", name: "title", value: "Authentication" },
        ]}
        title="Create or edit epic"
      >
        <label className="form-field">
          <span>Description</span>
          <textarea name="description" rows={4} />
        </label>
      </PlaceholderForm>
      <ul className="item-list">
        <li>
          Authentication <button type="button">Edit</button>{" "}
          <button type="button">Delete</button>
        </li>
        <li>
          Ticket workflow <button type="button">Edit</button>{" "}
          <button type="button">Delete</button>
        </li>
      </ul>
    </ScreenShell>
  );
}

export default function Epics() {
  return <EpicsView />;
}
