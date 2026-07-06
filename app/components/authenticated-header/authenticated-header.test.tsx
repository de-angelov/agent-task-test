import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AuthenticatedHeader } from "./authenticated-header";

describe("AuthenticatedHeader", () => {
  it("renders the TICKET TRACKER branding and default business navigation", () => {
    const html = renderToString(
      <AuthenticatedHeader userEmail="member@example.com" />,
    );

    expect(html).toContain("TICKET TRACKER");
    expect(html).toContain("href=\"/board\"");
    expect(html).toContain("href=\"/teams\"");
    expect(html).toContain("href=\"/epics\"");
    expect(html).toContain("href=\"/tickets/new\"");
  });

  it("indicates the active route and leaves other links unmarked", () => {
    const html = renderToString(
      <AuthenticatedHeader
        userEmail="member@example.com"
        currentPath="/teams"
      />,
    );

    expect(html).toContain("href=\"/teams\" aria-current=\"page\"");
    expect(html).not.toContain("href=\"/board\" aria-current=\"page\"");
    expect(html).not.toContain("href=\"/epics\" aria-current=\"page\"");
  });

  it("renders no active-route indication when currentPath is omitted", () => {
    const html = renderToString(
      <AuthenticatedHeader userEmail="member@example.com" />,
    );

    expect(html).not.toContain("aria-current");
  });

  it("renders the current authenticated user's email", () => {
    const html = renderToString(
      <AuthenticatedHeader userEmail="member@example.com" />,
    );

    expect(html).toContain("member@example.com");
  });

  it("renders a logout affordance", () => {
    const html = renderToString(
      <AuthenticatedHeader userEmail="member@example.com" />,
    );

    expect(html).toContain("action=\"/logout\"");
    expect(html).toContain("Log out");
  });
});
