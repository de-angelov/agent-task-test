import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HomeView, loader } from "./home";

describe("home route", () => {
  it("renders the placeholder frontend", () => {
    expect(renderToString(<HomeView />)).toContain(
      "React Router is rendering.",
    );
  });

  it("loads the placeholder service response", async () => {
    const result = await loader();

    expect(result).toEqual({ message: "Server service layer is available." });
  });
});
