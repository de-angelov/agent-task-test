import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AuthenticatedHeader } from "./authenticated-header";

describe("AuthenticatedHeader", () => {
  it("renders the authenticated user's email and default business navigation", () => {
    const html = renderToString(
      <AuthenticatedHeader userEmail="member@example.com" />,
    );

    expect(html).toContain("member@example.com");
    expect(html).toContain("href=\"/board\"");
    expect(html).toContain("href=\"/teams\"");
    expect(html).toContain("href=\"/epics\"");
    expect(html).toContain("href=\"/tickets/new\"");
  });

  it("renders a logout affordance", () => {
    const html = renderToString(
      <AuthenticatedHeader userEmail="member@example.com" />,
    );

    expect(html).toContain("action=\"/logout\"");
    expect(html).toContain("Log out");
  });
});
