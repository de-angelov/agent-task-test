import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HomeView, loader } from "./home";

describe("home route", () => {
  it("renders the placeholder frontend", () => {
    const html = renderToString(<HomeView />);

    expect(html).toContain("React Router is rendering.");
    expect(html).toContain("button-primary");
  });

  it("loads the placeholder service response", async () => {
    const result = await loader();

    expect(result).toEqual({ message: "Server service layer is available." });
  });
});
