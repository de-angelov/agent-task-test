import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { action, loader, TeamsView } from "./teams";

describe("teams route", () => {
  it("renders the team management table, create form, edit form, and validation messages", () => {
    const html = renderToString(
      <TeamsView
        actionData={{
          message: "Delete the team's tickets before deleting the team.",
          status: "error",
        }}
        teams={[
          {
            id: "team-1",
            name: "Platform",
            normalizedName: "platform",
            createdAt: "2026-06-28T10:00:00.000Z",
            updatedAt: "2026-06-28T11:00:00.000Z",
            epicCount: 2,
            ticketCount: 4,
          },
        ]}
      />,
    );

    expect(html).toContain("Create team");
    expect(html).toContain("Teams");
    expect(html).toContain("Platform");
    expect(html).toContain("Tickets");
    expect(html).toContain("Epics");
    expect(html).toContain("4");
    expect(html).toContain("2");
    expect(html).toContain("2026-06-28T11:00:00.000Z");
    expect(html).toContain("Save team");
    expect(html).toContain("Delete");
    expect(html).toContain("Delete blocked until this team has no tickets or epics.");
    expect(html).toContain("Delete the team&#x27;s tickets before deleting the team.");
  });

  it("enables delete for unreferenced teams and disables it for referenced teams", () => {
    const html = renderToString(
      <TeamsView
        teams={[
          {
            id: "team-1",
            name: "Platform",
            normalizedName: "platform",
            createdAt: "2026-06-28T10:00:00.000Z",
            updatedAt: "2026-06-28T11:00:00.000Z",
            epicCount: 0,
            ticketCount: 0,
          },
          {
            id: "team-2",
            name: "Product",
            normalizedName: "product",
            createdAt: "2026-06-28T10:00:00.000Z",
            updatedAt: "2026-06-28T12:00:00.000Z",
            epicCount: 1,
            ticketCount: 0,
          },
        ]}
      />,
    );

    expect(html).toContain("Product");
    expect(html).toContain(
      '<button aria-describedby="team-2-delete-blocked" class="_button_',
    );
    expect(html).toContain("disabled=\"\"");
    expect(html).toContain("Delete blocked until this team has no tickets or epics.");
    expect(html).toContain('name="teamId" value="team-1"');
  });

  it("renders the empty state when no teams exist", () => {
    const html = renderToString(<TeamsView teams={[]} />);

    expect(html).toContain("No teams have been created.");
  });

  it("requires authentication for reads and writes", async () => {
    const request = new Request("http://example.com/teams");

    await expect(loader({ request })).rejects.toMatchObject({
      status: 302,
    });
    await expect(action({ request })).rejects.toMatchObject({
      status: 302,
    });
  });
});
