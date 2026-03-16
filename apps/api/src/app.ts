import { join } from "node:path";

import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { ZodError } from "zod";

import { config } from "./config.js";
import { BossService } from "./jobs/boss.js";
import { getPool } from "./db/pool.js";
import { AppError } from "./lib/errors.js";
import { GameRepository } from "./repositories/gameRepository.js";
import { registerInternalRoutes } from "./routes/internalRoutes.js";
import { registerPublicRoutes } from "./routes/publicRoutes.js";
import { CatalogService } from "./services/catalogService.js";
import { GameService } from "./services/gameService.js";

export async function createApp() {
  const app = Fastify({ logger: true });
  const repository = new GameRepository(getPool());
  const catalogService = new CatalogService(repository);
  const gameService = new GameService(repository, catalogService);
  const bossService = new BossService(gameService);

  await app.register(cookie);
  await app.register(cors, {
    origin: [`http://localhost:${config.WEB_PORT}`],
    credentials: true
  });
  await app.register(fastifyStatic, {
    root: join(process.cwd(), "public"),
    prefix: "/"
  });

  app.get("/health", async () => ({ status: "ok" }));

  await registerPublicRoutes(app, gameService);
  await registerInternalRoutes(app, gameService, bossService);
  await bossService.start();

  app.addHook("onClose", async () => {
    await bossService.stop();
  });

  app.setErrorHandler((error: unknown, request, reply) => {
    if (error instanceof ZodError) {
      reply.status(400).send({
        error: "Request validation failed.",
        code: "VALIDATION_ERROR",
        details: error.flatten()
      });
      return;
    }

    if (error instanceof AppError) {
      reply.status(error.statusCode).send({
        error: error.message,
        code: error.code
      });
      return;
    }

    request.log.error({ err: error }, "Unhandled request error");
    reply.status(500).send({
      error: "Internal server error.",
      code: "INTERNAL_SERVER_ERROR"
    });
  });

  return app;
}
