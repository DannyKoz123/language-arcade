import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiBaseUrl, createRun, fetchActiveRun } from "../lib/api";

describe("web api configuration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("has a sane default API base url", () => {
    expect(apiBaseUrl).toBe("http://localhost:3001");
  });

  it("requests the active run with cookies included", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ run: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await fetchActiveRun();

    expect(response.run).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/v1/runs/active",
      expect.objectContaining({
        credentials: "include",
        cache: "no-store"
      })
    );
  });

  it("surfaces API status and error codes for failed requests", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Run is no longer active.", code: "RUN_NOT_ACTIVE" }), {
          status: 409,
          headers: { "Content-Type": "application/json" }
        })
      )
    );

    await expect(createRun()).rejects.toEqual(
      expect.objectContaining<ApiError>({
        message: "Run is no longer active.",
        status: 409,
        code: "RUN_NOT_ACTIVE"
      })
    );
  });
});
