import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import { config } from "../src/config.js";
import { AppError } from "../src/lib/errors.js";
import { registerInternalRoutes } from "../src/routes/internalRoutes.js";

describe("internalRoutes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not leak admin auth onto public routes", async () => {
    const app = Fastify();
    app.setErrorHandler((error, _request, reply) => {
      if (error instanceof AppError) {
        reply.status(error.statusCode).send({ error: error.message, code: error.code });
        return;
      }

      reply.status(500).send({ error: "Internal server error." });
    });
    app.get("/health", async () => ({ status: "ok" }));

    const bossService = {
      queuePublish: vi.fn()
    };
    const gameService = {
      disableClip: vi.fn()
    };

    await registerInternalRoutes(app, gameService as never, bossService as never);

    const healthResponse = await app.inject({
      method: "GET",
      url: "/health"
    });
    const forbiddenResponse = await app.inject({
      method: "POST",
      url: "/internal/content/publish",
      payload: { versionName: "demo-fleurs-v1" }
    });
    const acceptedResponse = await app.inject({
      method: "POST",
      url: "/internal/content/publish",
      headers: { "x-admin-token": config.ADMIN_TOKEN },
      payload: { versionName: "demo-fleurs-v1" }
    });

    expect(healthResponse.statusCode).toBe(200);
    expect(forbiddenResponse.statusCode).toBe(403);
    expect(acceptedResponse.statusCode).toBe(202);
    expect(bossService.queuePublish).toHaveBeenCalledWith("demo-fleurs-v1");

    await app.close();
  });
});
