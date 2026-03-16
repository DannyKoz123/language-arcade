import { FastifyInstance } from "fastify";
import { z } from "zod";

import { config } from "../config.js";
import { BossService } from "../jobs/boss.js";
import { ForbiddenError } from "../lib/errors.js";
import { tokensMatch } from "../lib/security.js";
import { GameService } from "../services/gameService.js";

const publishBody = z.object({
  versionName: z.string().trim().min(1)
});

const clipParams = z.object({
  clipId: z.string().uuid()
});

export async function registerInternalRoutes(
  app: FastifyInstance,
  gameService: GameService,
  bossService: BossService
): Promise<void> {
  await app.register(async (internalApp) => {
    internalApp.addHook("preHandler", async (request) => {
      const headerValue = request.headers["x-admin-token"];
      const receivedToken = Array.isArray(headerValue) ? headerValue[0] : headerValue;

      if (!tokensMatch(config.ADMIN_TOKEN, receivedToken)) {
        throw new ForbiddenError();
      }
    });

    internalApp.post("/internal/content/publish", async (request, reply) => {
      const body = publishBody.parse(request.body);
      await bossService.queuePublish(body.versionName);
      reply.code(202);
      return { queued: true };
    });

    internalApp.post("/internal/content/clips/:clipId/disable", async (request, reply) => {
      const params = clipParams.parse(request.params);
      await gameService.disableClip(params.clipId);
      reply.code(204);
    });
  });
}
