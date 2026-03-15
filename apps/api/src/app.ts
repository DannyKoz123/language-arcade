import { join } from "node:path";

import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";

import { config } from "./config.js";
import { BossService } from "./jobs/boss.js";
import { getPool } from "./db/pool.js";
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

  app.setErrorHandler((error: unknown, _request, reply) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    const statusCode =
      message === "Unauthenticated"
        ? 401
        : message === "Forbidden"
          ? 403
          : 400;
    reply.status(statusCode).send({
      error: message
    });
  });

  return app;
}
