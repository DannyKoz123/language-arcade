import { FastifyInstance } from "fastify";
import { z } from "zod";

import { config } from "../config.js";
import { BossService } from "../jobs/boss.js";
import { GameService } from "../services/gameService.js";

const publishBody = z.object({
  versionName: z.string().min(1)
});

export async function registerInternalRoutes(
  app: FastifyInstance,
  gameService: GameService,
  bossService: BossService
): Promise<void> {
  app.addHook("preHandler", async (request) => {
    if (request.headers["x-admin-token"] !== config.ADMIN_TOKEN) {
      throw new Error("Forbidden");
    }
  });

  app.post("/internal/content/publish", async (request, reply) => {
    const body = publishBody.parse(request.body);
    await bossService.queuePublish(body.versionName);
    reply.code(202);
    return { queued: true };
  });

  app.post("/internal/content/clips/:clipId/disable", async (request, reply) => {
    await gameService.disableClip((request.params as { clipId: string }).clipId);
    reply.code(204);
  });
}
