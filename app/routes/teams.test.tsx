import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { action, loader, TeamsView } from "./teams";

describe("teams route", () => {
  it("renders team management controls and validation messages", () => {
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
            updatedAt: "2026-06-28T10:00:00.000Z",
          },
        ]}
      />,
    );

    expect(html).toContain("Create team");
    expect(html).toContain("Platform");
    expect(html).toContain("Rename");
    expect(html).toContain("Delete");
    expect(html).toContain("Delete the team&#x27;s tickets before deleting the team.");
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
