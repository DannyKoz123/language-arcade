import { z } from "zod";
import { FastifyInstance } from "fastify";

import { createSessionToken } from "../lib/security.js";
import { GameService } from "../services/gameService.js";

const answerBody = z.object({
  roundId: z.string().uuid(),
  guessIsoCode: z.string().min(2),
  elapsedMs: z.number().int().nonnegative().optional()
});

const hintBody = z.object({
  roundId: z.string().uuid(),
  hintType: z.enum(["family_region", "longer_clip"])
});

const displayNameBody = z.object({
  displayName: z.string().trim().min(3).max(20)
});

export async function registerPublicRoutes(
  app: FastifyInstance,
  gameService: GameService
): Promise<void> {
  app.post("/v1/sessions/guest", async (request, reply) => {
    const existingToken = request.cookies.guest_session;
    if (existingToken) {
      const existingPlayer = await gameService.resolvePlayer(existingToken);
      if (existingPlayer) {
        return { player: existingPlayer };
      }
    }

    const token = createSessionToken();
    const player = await gameService.createGuestSession(token);
    reply.setCookie("guest_session", token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax"
    });

    return { player };
  });

  app.get("/v1/bootstrap", async () => gameService.bootstrap());

  app.post("/v1/runs", async (request, reply) => {
    const player = await requirePlayer(gameService, request.cookies.guest_session);
    const response = await gameService.createRun(player);
    reply.code(201);
    return response;
  });

  app.post("/v1/runs/:runId/answers", async (request) => {
    const player = await requirePlayer(gameService, request.cookies.guest_session);
    const body = answerBody.parse(request.body);

    return gameService.answerRound({
      player,
      runId: (request.params as { runId: string }).runId,
      roundId: body.roundId,
      guessIsoCode: body.guessIsoCode
    });
  });

  app.post("/v1/runs/:runId/hints", async (request) => {
    const player = await requirePlayer(gameService, request.cookies.guest_session);
    const body = hintBody.parse(request.body);

    return gameService.applyHint({
      player,
      runId: (request.params as { runId: string }).runId,
      roundId: body.roundId,
      hintType: body.hintType
    });
  });

  app.get("/v1/profile", async (request) => {
    const player = await requirePlayer(gameService, request.cookies.guest_session);
    return gameService.getProfile(player);
  });

  app.post("/v1/profile/display-name", async (request, reply) => {
    const player = await requirePlayer(gameService, request.cookies.guest_session);
    const body = displayNameBody.parse(request.body);
    await gameService.setDisplayName(player, body.displayName);
    reply.code(204);
  });

  app.get("/v1/leaderboards/arcade", async (request) => {
    const query = z
      .object({
        window: z.enum(["weekly", "all_time"]).default("weekly")
      })
      .parse(request.query);

    return {
      entries: await gameService.getLeaderboard(query.window)
    };
  });
}

async function requirePlayer(
  gameService: GameService,
  sessionToken: string | undefined
) {
  const player = await gameService.resolvePlayer(sessionToken);
  if (!player) {
    throw new Error("Unauthenticated");
  }

  return player;
}
