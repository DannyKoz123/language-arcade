import { describe, expect, it } from "vitest";

import { apiBaseUrl } from "../lib/api";

describe("web api configuration", () => {
  it("has a sane default API base url", () => {
    expect(apiBaseUrl).toBe("http://localhost:3001");
  });
});
