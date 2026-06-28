import { describe, expect, it } from "vitest";

import { toUtcIsoTimestamp } from "./timestamps.server";

describe("timestamp serialization", () => {
  it("serializes API timestamps as ISO-8601 UTC values", () => {
    const timestamp = toUtcIsoTimestamp(
      new Date("2026-06-28T13:45:30.123+03:00"),
    );

    expect(timestamp).toBe("2026-06-28T10:45:30.123Z");
    expect(timestamp).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
  });
});
