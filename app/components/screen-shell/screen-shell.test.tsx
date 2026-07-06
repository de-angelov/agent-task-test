import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ScreenShell } from "./screen-shell";

describe("ScreenShell", () => {
  it("renders the page title, authenticated header, and children", () => {
    const html = renderToString(
      <ScreenShell title="Kanban board" userEmail="member@example.com">
        <p>Board content</p>
      </ScreenShell>,
    );

    expect(html).toContain("<h1>Kanban board</h1>");
    expect(html).toContain("member@example.com");
    expect(html).toContain("Board content");
  });

  it("defaults the user email when none is provided", () => {
    const html = renderToString(
      <ScreenShell title="Kanban board">
        <p>Board content</p>
      </ScreenShell>,
    );

    expect(html).toContain("user@example.com");
  });
});
