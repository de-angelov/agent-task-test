import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Button } from "./button";

describe("Button", () => {
  it("renders a primary button by default", () => {
    const html = renderToString(<Button>Continue</Button>);

    expect(html).toContain("type=\"button\"");
    expect(html).toContain("Continue");
  });

  it("supports secondary and destructive variants", () => {
    expect(
      renderToString(<Button variant="secondary">Cancel</Button>),
    ).toContain("Cancel");
    expect(
      renderToString(<Button variant="destructive">Delete</Button>),
    ).toContain("Delete");
  });

  it("disables the button and exposes busy state while loading", () => {
    const html = renderToString(
      <Button isLoading loadingLabel="Saving">
        Save
      </Button>,
    );

    expect(html).toContain("aria-busy=\"true\"");
    expect(html).toContain("disabled=\"\"");
    expect(html).toContain("Saving");
  });

  it("preserves native button props", () => {
    const html = renderToString(
      <Button aria-label="Create ticket" className="custom-action" type="submit">
        Create
      </Button>,
    );

    expect(html).toContain("aria-label=\"Create ticket\"");
    expect(html).toContain("custom-action");
    expect(html).toContain("type=\"submit\"");
  });
});
