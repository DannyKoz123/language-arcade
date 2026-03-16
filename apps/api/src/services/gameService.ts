import { PoolClient } from "pg";

import {
  ActiveRunResponse,
  AnswerResponse,
  BootstrapResponse,
  CreateRunResponse,
  GAME_CONSTANTS,
  HintResponse,
  HintType,
  LeaderboardEntry,
  ProfileResponse,
  RoundPayload,
  RoundReveal,
  SelectionInput,
  computeScoreBreakdown,
  difficultyForRound,
  selectRound
} from "@language-arcade/shared";

import { config } from "../config.js";
import { ConflictError, NotFoundError } from "../lib/errors.js";
import { hashSessionToken } from "../lib/security.js";
import {
  CatalogSnapshot,
  GameRepository,
  PlayerSummary,
  RunRecord,
  RunRoundRecord
} from "../repositories/gameRepository.js";
import { CatalogService } from "./catalogService.js";

export class GameService {
  constructor(
    private readonly repository: GameRepository,
    private readonly catalogService: CatalogService
  ) {}

  async createGuestSession(sessionToken: string): Promise<PlayerSummary> {
    return this.repository.createGuestSession(hashSessionToken(sessionToken));
  }

  async resolvePlayer(sessionToken: string | undefined): Promise<PlayerSummary | null> {
    if (!sessionToken) {
      return null;
    }

    return this.repository.findPlayerBySessionToken(hashSessionToken(sessionToken));
  }

  async bootstrap(): Promise<BootstrapResponse> {
    const [snapshot, season] = await Promise.all([
      this.catalogService.getSnapshot(),
      this.repository.getActiveSeason()
    ]);

    return {
      scoring: {
        easyBase: GAME_CONSTANTS.easyBase,
        mediumBase: GAME_CONSTANTS.mediumBase,
        hardBase: GAME_CONSTANTS.hardBase,
        maxSpeedBonus: GAME_CONSTANTS.maxSpeedBonus,
        streakStep: GAME_CONSTANTS.streakStep,
        maxStreakMultiplier: GAME_CONSTANTS.maxStreakMultiplier,
        familyRegionPenalty: GAME_CONSTANTS.familyRegionPenalty,
        longerClipPenalty: GAME_CONSTANTS.longerClipPenalty
      },
      season: {
        name: season.name,
        startedAt: season.startedAt,
        endsAt: season.endsAt
      },
      languagesVisible: snapshot.languages.map((language) => ({
        isoCode: language.isoCode,
        commonName: language.commonName,
        region: language.region
      }))
    };
  }

  async createRun(player: PlayerSummary): Promise<CreateRunResponse> {
    const snapshot = await this.catalogService.getSnapshot();

    return this.repository.withTransaction(async (client) => {
      await this.repository.lockPlayer(player.id, client);
      const existingRun = await this.repository.getLatestActiveRunForPlayer(player.id, client);

      if (existingRun) {
        const existingRounds = await this.repository.listRunRounds(existingRun.id, client);
        const resumableRound = this.resolveActiveRound(existingRun, existingRounds);

        if (resumableRound) {
          await this.repository.logEvent(
            {
              playerId: player.id,
              runId: existingRun.id,
              eventType: "run.resumed",
              payload: { roundId: resumableRound.id, roundNumber: resumableRound.roundNumber }
            },
            client
          );

          return {
            ...(await this.buildRunState(snapshot, existingRun, resumableRound)),
            resumed: true
          };
        }

        await this.abandonBrokenRun(existingRun, player.id, client);
      }

      const season = await this.repository.getActiveSeason(client);
      const run = await this.repository.createRun(player.id, season.id, client);
      const selected = this.selectPlayableRound({
        languages: snapshot.languages,
        clips: snapshot.clips,
        confusionEdges: snapshot.confusionEdges,
        usedClipIds: new Set(),
        usedLanguageCodes: new Set(),
        roundNumber: 1
      });
      const round = await this.repository.insertRunRound(
        {
          runId: run.id,
          roundNumber: 1,
          languageIsoCode: selected.language.isoCode,
          clipId: selected.clip.id,
          difficulty: selected.difficulty,
          options: selected.options
        },
        client
      );

      await this.repository.updateRunProgress(
        {
          runId: run.id,
          score: run.score,
          streak: run.streak,
          livesRemaining: run.livesRemaining,
          currentRoundNumber: 1,
          completedRounds: 0,
          status: "active"
        },
        client
      );
      await this.repository.logEvent(
        {
          playerId: player.id,
          runId: run.id,
          eventType: "run.created",
          payload: { roundId: round.id }
        },
        client
      );

      return {
        ...(await this.buildRunState(snapshot, run, round)),
        resumed: false
      };
    });
  }

  async getActiveRun(player: PlayerSummary): Promise<ActiveRunResponse> {
    const snapshot = await this.catalogService.getSnapshot();

    return this.repository.withTransaction(async (client) => {
      const run = await this.repository.getLatestActiveRunForPlayer(player.id, client);
      if (!run) {
        return { run: null };
      }

      const lockedRun = await this.requireRun(player.id, run.id, {
        executor: client,
        lock: true
      });
      const rounds = await this.repository.listRunRounds(lockedRun.id, client);
      const activeRound = this.resolveActiveRound(lockedRun, rounds);

      if (!activeRound) {
        await this.abandonBrokenRun(lockedRun, player.id, client);
        return { run: null };
      }

      return {
        run: await this.buildRunState(snapshot, lockedRun, activeRound)
      };
    });
  }

  async answerRound(input: {
    player: PlayerSummary;
    runId: string;
    roundId: string;
    guessIsoCode: string;
  }): Promise<AnswerResponse> {
    const snapshot = await this.catalogService.getSnapshot();

    return this.repository.withTransaction(async (client) => {
      const run = await this.requireRun(input.player.id, input.runId, {
        executor: client,
        lock: true
      });
      const rounds = await this.repository.listRunRounds(run.id, client);
      const round = rounds.find((candidate) => candidate.id === input.roundId);
      if (!round) {
        throw new NotFoundError("Round not found.", "ROUND_NOT_FOUND");
      }

      if (round.answeredAt) {
        return this.rehydrateAnswerResponse(run, round, rounds, snapshot);
      }

      if (run.status !== "active") {
        throw new ConflictError("Run is no longer active.", "RUN_NOT_ACTIVE");
      }

      const activeRound = this.resolveActiveRound(run, rounds);
      if (!activeRound || activeRound.id !== round.id) {
        throw new ConflictError("Round is no longer active.", "ROUND_NOT_ACTIVE");
      }

      const correct = input.guessIsoCode === round.languageIsoCode;
      const elapsedMs = Math.max(0, Date.now() - new Date(round.startedAt).getTime());
      const hintsUsed = round.hintTypes.filter(
        (hint): hint is HintType => hint === "family_region" || hint === "longer_clip"
      );
      const scoreDelta = computeScoreBreakdown({
        difficulty: difficultyForRound(round.roundNumber),
        elapsedMs,
        priorStreak: run.streak,
        hintsUsed,
        correct
      });
      const nextScore = run.score + scoreDelta.total;
      const nextStreak = correct ? run.streak + 1 : 0;
      const nextLives = correct ? run.livesRemaining : Math.max(0, run.livesRemaining - 1);
      const completedRounds = run.completedRounds + 1;
      const gameOver =
        nextLives <= 0 || round.roundNumber >= GAME_CONSTANTS.roundsPerRun;

      const answeredRound = await this.repository.markRoundAnswered(
        {
          roundId: round.id,
          answerIsoCode: input.guessIsoCode,
          correct,
          scoreDelta,
          hintTypes: round.hintTypes
        },
        client
      );

      if (!answeredRound) {
        const currentRound = await this.repository.getRunRound(run.id, round.id, client);
        if (currentRound?.answeredAt) {
          const refreshedRounds = await this.repository.listRunRounds(run.id, client);
          const refreshedRun =
            (await this.repository.getRun(run.id, { executor: client, lock: true })) ?? run;
          return this.rehydrateAnswerResponse(refreshedRun, currentRound, refreshedRounds, snapshot);
        }

        throw new ConflictError("Round answer could not be recorded.", "ROUND_STATE_CHANGED");
      }

      let nextRoundPayload: RoundPayload | null = null;

      if (!gameOver) {
        const nextSelected = this.selectPlayableRound({
          languages: snapshot.languages,
          clips: snapshot.clips,
          confusionEdges: snapshot.confusionEdges,
          usedClipIds: new Set(rounds.map((candidate) => candidate.clipId)),
          usedLanguageCodes: new Set(rounds.map((candidate) => candidate.languageIsoCode)),
          roundNumber: round.roundNumber + 1
        });
        const persistedNextRound = await this.repository.insertRunRound(
          {
            runId: run.id,
            roundNumber: round.roundNumber + 1,
            languageIsoCode: nextSelected.language.isoCode,
            clipId: nextSelected.clip.id,
            difficulty: nextSelected.difficulty,
            options: nextSelected.options
          },
          client
        );

        nextRoundPayload = await this.buildRoundPayload(
          snapshot,
          nextSelected.clip.id,
          nextSelected.language.isoCode,
          persistedNextRound,
          {
            ...run,
            score: nextScore,
            streak: nextStreak,
            livesRemaining: nextLives
          }
        );
      }

      await this.repository.updateRunProgress(
        {
          runId: run.id,
          score: nextScore,
          streak: nextStreak,
          livesRemaining: nextLives,
          currentRoundNumber: gameOver ? round.roundNumber : round.roundNumber + 1,
          completedRounds,
          status: gameOver ? "completed" : "active"
        },
        client
      );
      await this.repository.logEvent(
        {
          playerId: input.player.id,
          runId: run.id,
          eventType: "round.answered",
          payload: {
            roundId: round.id,
            correct,
            guessIsoCode: input.guessIsoCode,
            scoreDelta: scoreDelta.total
          }
        },
        client
      );

      return {
        round: nextRoundPayload,
        reveal: await this.buildReveal(snapshot, round),
        correct,
        scoreDelta,
        totalScore: nextScore,
        streak: nextStreak,
        livesRemaining: nextLives,
        gameOver
      };
    });
  }

  async applyHint(input: {
    player: PlayerSummary;
    runId: string;
    roundId: string;
    hintType: HintType;
  }): Promise<HintResponse> {
    const snapshot = await this.catalogService.getSnapshot();

    return this.repository.withTransaction(async (client) => {
      const run = await this.requireRun(input.player.id, input.runId, {
        executor: client,
        lock: true
      });
      const rounds = await this.repository.listRunRounds(input.runId, client);
      const round = rounds.find((candidate) => candidate.id === input.roundId);
      if (!round) {
        throw new NotFoundError("Round not found.", "ROUND_NOT_FOUND");
      }

      if (run.status !== "active") {
        throw new ConflictError("Run is no longer active.", "RUN_NOT_ACTIVE");
      }

      const activeRound = this.resolveActiveRound(run, rounds);
      if (!activeRound || activeRound.id !== round.id) {
        throw new ConflictError("Round is no longer active.", "ROUND_NOT_ACTIVE");
      }

      if (round.answeredAt) {
        throw new ConflictError("Cannot hint an answered round.", "ROUND_ALREADY_ANSWERED");
      }

      const alreadyUsed =
        (input.hintType === "family_region" && round.familyRegionUsed) ||
        (input.hintType === "longer_clip" && round.longerClipUsed);

      const updatedRound =
        alreadyUsed
          ? round
          : await this.repository.applyHint(round.id, input.hintType, client);

      if (!alreadyUsed) {
        await this.repository.logEvent(
          {
            playerId: input.player.id,
            runId: input.runId,
            eventType: "round.hint",
            payload: { roundId: round.id, hintType: input.hintType }
          },
          client
        );
      }

      if (!updatedRound) {
        throw new ConflictError("Hint state changed before it could be applied.", "HINT_STATE_CHANGED");
      }

      const payload = await this.buildRoundPayload(
        snapshot,
        updatedRound.clipId,
        updatedRound.languageIsoCode,
        updatedRound,
        run
      );
      const language = await this.resolveLanguage(snapshot, updatedRound.languageIsoCode);

      return {
        round: payload,
        appliedHint: input.hintType,
        penaltyApplied: alreadyUsed
          ? 0
          : input.hintType === "family_region"
            ? GAME_CONSTANTS.familyRegionPenalty
            : GAME_CONSTANTS.longerClipPenalty,
        clue:
          input.hintType === "family_region" && language
            ? { region: language.region, family: language.family }
            : null
      };
    });
  }

  async getProfile(player: PlayerSummary): Promise<ProfileResponse> {
    return this.repository.getProfile(player.id);
  }

  async getLeaderboard(window: "weekly" | "all_time"): Promise<LeaderboardEntry[]> {
    const season = await this.repository.getActiveSeason();
    return this.repository.getLeaderboard(window, season.id);
  }

  async setDisplayName(player: PlayerSummary, displayName: string): Promise<void> {
    await this.repository.upsertDisplayName(player.id, displayName);
  }

  async publishContentVersion(versionName: string): Promise<void> {
    try {
      await this.repository.publishContentVersion(versionName);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith("Unknown content version:")
      ) {
        throw new NotFoundError(error.message, "CONTENT_VERSION_NOT_FOUND");
      }

      throw error;
    }

    this.catalogService.invalidate();
  }

  async disableClip(clipId: string): Promise<void> {
    const disabled = await this.repository.disableClip(clipId);
    if (!disabled) {
      throw new NotFoundError("Clip not found.", "CLIP_NOT_FOUND");
    }

    this.catalogService.invalidate();
  }

  private async requireRun(
    playerId: string,
    runId: string,
    options: { executor?: PoolClient; lock?: boolean } = {}
  ): Promise<RunRecord> {
    const run = await this.repository.getRun(runId, options);
    if (!run || run.playerId !== playerId) {
      throw new NotFoundError("Run not found.", "RUN_NOT_FOUND");
    }

    return run;
  }

  private resolveActiveRound(
    run: RunRecord,
    rounds: RunRoundRecord[]
  ): RunRoundRecord | null {
    if (run.status !== "active") {
      return null;
    }

    const currentRound = rounds.find(
      (candidate) =>
        candidate.roundNumber === run.currentRoundNumber && candidate.answeredAt === null
    );

    if (currentRound) {
      return currentRound;
    }

    return rounds.find((candidate) => candidate.answeredAt === null) ?? null;
  }

  private async abandonBrokenRun(
    run: RunRecord,
    playerId: string,
    client: PoolClient
  ): Promise<void> {
    await this.repository.updateRunProgress(
      {
        runId: run.id,
        score: run.score,
        streak: run.streak,
        livesRemaining: run.livesRemaining,
        currentRoundNumber: run.currentRoundNumber,
        completedRounds: run.completedRounds,
        status: "abandoned"
      },
      client
    );
    await this.repository.logEvent(
      {
        playerId,
        runId: run.id,
        eventType: "run.abandoned",
        payload: {
          reason: "missing_active_round",
          currentRoundNumber: run.currentRoundNumber
        }
      },
      client
    );
  }

  private async buildRunState(
    snapshot: CatalogSnapshot,
    run: RunRecord,
    round: RunRoundRecord
  ): Promise<{ runId: string; round: RoundPayload }> {
    return {
      runId: run.id,
      round: await this.buildRoundPayload(
        snapshot,
        round.clipId,
        round.languageIsoCode,
        round,
        run
      )
    };
  }

  private async buildRoundPayload(
    snapshot: CatalogSnapshot,
    clipId: string,
    languageIsoCode: string,
    round: RunRoundRecord,
    run: Pick<RunRecord, "score" | "streak" | "livesRemaining">
  ): Promise<RoundPayload> {
    const clip = await this.resolveClip(snapshot, clipId);
    if (!clip) {
      throw new NotFoundError(`Clip ${clipId} not found.`, "CLIP_NOT_FOUND");
    }

    const language = await this.resolveLanguage(snapshot, languageIsoCode);
    if (!language) {
      throw new NotFoundError(
        `Language ${languageIsoCode} not found.`,
        "LANGUAGE_NOT_FOUND"
      );
    }

    const previewUrl = clip.previewUrl.startsWith("http")
      ? clip.previewUrl
      : `${config.PUBLIC_API_URL}${clip.previewUrl}`;
    const fullUrl = clip.fullUrl.startsWith("http")
      ? clip.fullUrl
      : `${config.PUBLIC_API_URL}${clip.fullUrl}`;

    return {
      roundId: round.id,
      roundNumber: round.roundNumber,
      difficulty: round.difficulty,
      livesRemaining: run.livesRemaining,
      score: run.score,
      streak: run.streak,
      hintState: {
        familyRegionUsed: round.familyRegionUsed,
        longerClipUsed: round.longerClipUsed,
        familyRegionClue: round.familyRegionUsed
          ? {
              region: language.region,
              family: language.family
            }
          : null
      },
      clip: {
        previewUrl,
        fullUrl,
        previewDurationMs: clip.previewDurationMs,
        fullDurationMs: clip.fullDurationMs
      },
      options: round.options
    };
  }

  private async buildReveal(
    snapshot: CatalogSnapshot,
    round: RunRoundRecord
  ): Promise<RoundReveal> {
    const language = await this.resolveLanguage(snapshot, round.languageIsoCode);
    if (!language) {
      throw new NotFoundError(
        `Language ${round.languageIsoCode} not found.`,
        "LANGUAGE_NOT_FOUND"
      );
    }

    return {
      correctIsoCode: language.isoCode,
      correctName: language.commonName,
      nativeName: language.nativeName,
      family: language.family,
      region: language.region,
      mainCountries: language.mainCountries,
      clipId: round.clipId
    };
  }

  private async rehydrateAnswerResponse(
    run: RunRecord,
    round: RunRoundRecord,
    rounds: RunRoundRecord[],
    snapshot: CatalogSnapshot
  ): Promise<AnswerResponse> {
    const reveal = await this.buildReveal(snapshot, round);
    const nextRound = rounds.find((candidate) => candidate.roundNumber === round.roundNumber + 1);
    const nextRoundPayload = nextRound
      ? await this.buildRoundPayload(
          snapshot,
          nextRound.clipId,
          nextRound.languageIsoCode,
          nextRound,
          run
        )
      : null;

    return {
      round: nextRoundPayload,
      reveal,
      correct: round.correct ?? false,
      scoreDelta: round.scoreDelta ?? {
        difficultyBase: 0,
        speedBonus: 0,
        streakMultiplier: 1,
        hintPenalty: 0,
        total: 0
      },
      totalScore: run.score,
      streak: run.streak,
      livesRemaining: run.livesRemaining,
      gameOver: run.status === "completed"
    };
  }

  private async resolveClip(
    snapshot: CatalogSnapshot,
    clipId: string
  ) {
    return (
      snapshot.clips.find((candidate) => candidate.id === clipId) ??
      this.repository.getClipById(clipId)
    );
  }

  private async resolveLanguage(
    snapshot: CatalogSnapshot,
    languageIsoCode: string
  ) {
    return (
      snapshot.languages.find((candidate) => candidate.isoCode === languageIsoCode) ??
      this.repository.getLanguageByIsoCode(languageIsoCode)
    );
  }

  private selectPlayableRound(input: SelectionInput) {
    try {
      return selectRound(input);
    } catch (error) {
      if (error instanceof Error) {
        throw new ConflictError(
          "Not enough published content is available to build the next round.",
          "CONTENT_EXHAUSTED"
        );
      }

      throw error;
    }
  }
}
