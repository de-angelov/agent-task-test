import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HomeView, loader } from "./home";

describe("home route", () => {
  it("renders the placeholder frontend", () => {
    const html = renderToString(<HomeView />);

    expect(html).toContain("React Router is rendering.");
    expect(html).toContain("Open dialog");
  });

  it("loads the placeholder service response", async () => {
    await expect(
      loader({ request: new Request("http://example.com/") }),
    ).rejects.toMatchObject({
      status: 302,
    });
  });
});
