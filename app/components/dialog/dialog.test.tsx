import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Button } from "../button/button";
import { Dialog } from "./dialog";

describe("Dialog", () => {
  it("renders an accessible modal with title, body, and actions", () => {
    const html = renderToString(
      <Dialog
        cancelAction={<Button variant="secondary">Cancel</Button>}
        confirmAction={<Button variant="destructive">Delete</Button>}
        isOpen
        title="Delete ticket"
      >
        This action cannot be undone.
      </Dialog>,
    );

    expect(html).toContain("<dialog");
    expect(html).toContain("aria-modal=\"true\"");
    expect(html).toContain("aria-labelledby=");
    expect(html).not.toContain("open=\"\"");
    expect(html).toContain("Delete ticket");
    expect(html).toContain("This action cannot be undone.");
    expect(html).toContain("Cancel");
    expect(html).toContain("Delete");
  });

  it("keeps modal state controlled by the browser dialog API", () => {
    const html = renderToString(
      <Dialog
        cancelAction={<Button variant="secondary">Cancel</Button>}
        confirmAction={<Button>Confirm</Button>}
        isOpen={false}
        title="Confirm change"
      >
        Continue?
      </Dialog>,
    );

    expect(html).toContain("<dialog");
    expect(html).not.toContain("open=\"\"");
  });
});
