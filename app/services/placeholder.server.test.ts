import { describe, expect, it } from "vitest";

import { getPlaceholderMessage } from "./placeholder.server";

describe("getPlaceholderMessage", () => {
  it("returns a placeholder service response", () => {
    const result = getPlaceholderMessage();

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      message: "Server service layer is available.",
    });
  });
});
