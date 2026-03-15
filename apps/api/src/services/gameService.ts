import {
  AnswerResponse,
  BootstrapResponse,
  CreateRunResponse,
  GAME_CONSTANTS,
  HintResponse,
  HintType,
  ProfileResponse,
  RoundPayload,
  RoundReveal,
  computeScoreBreakdown,
  difficultyForRound,
  selectRound
} from "@language-arcade/shared";

import { config } from "../config.js";
import { hashSessionToken } from "../lib/security.js";
import {
  CatalogSnapshot,
  GameRepository,
  LeaderboardEntry,
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
    const [season, snapshot] = await Promise.all([
      this.repository.getActiveSeason(),
      this.catalogService.getSnapshot()
    ]);
    const run = await this.repository.createRun(player.id, season.id);
    const selected = selectRound({
      languages: snapshot.languages,
      clips: snapshot.clips,
      confusionEdges: snapshot.confusionEdges,
      usedClipIds: new Set(),
      usedLanguageCodes: new Set(),
      roundNumber: 1
    });

    const round = await this.repository.insertRunRound({
      runId: run.id,
      roundNumber: 1,
      languageIsoCode: selected.language.isoCode,
      clipId: selected.clip.id,
      difficulty: selected.difficulty,
      options: selected.options
    });

    await this.repository.updateRunProgress({
      runId: run.id,
      score: run.score,
      streak: run.streak,
      livesRemaining: run.livesRemaining,
      currentRoundNumber: 1,
      completedRounds: 0,
      status: "active"
    });
    await this.repository.logEvent({
      playerId: player.id,
      runId: run.id,
      eventType: "run.created",
      payload: { roundId: round.id }
    });

    return {
      runId: run.id,
      round: this.buildRoundPayload(snapshot, selected.clip.id, selected.language.isoCode, round, run)
    };
  }

  async answerRound(input: {
    player: PlayerSummary;
    runId: string;
    roundId: string;
    guessIsoCode: string;
  }): Promise<AnswerResponse> {
    const run = await this.requireRun(input.player.id, input.runId);
    const rounds = await this.repository.listRunRounds(run.id);
    const round = rounds.find((candidate) => candidate.id === input.roundId);
    if (!round) {
      throw new Error("Unknown round.");
    }

    const snapshot = await this.catalogService.getSnapshot();

    if (round.answeredAt) {
      return this.rehydrateAnswerResponse(run, round, rounds, snapshot);
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

    await this.repository.markRoundAnswered({
      roundId: round.id,
      answerIsoCode: input.guessIsoCode,
      correct,
      scoreDelta,
      hintTypes: round.hintTypes
    });

    let nextRoundPayload: RoundPayload | null = null;

    if (!gameOver) {
      const nextSelected = selectRound({
        languages: snapshot.languages,
        clips: snapshot.clips,
        confusionEdges: snapshot.confusionEdges,
        usedClipIds: new Set(rounds.map((candidate) => candidate.clipId)),
        usedLanguageCodes: new Set(rounds.map((candidate) => candidate.languageIsoCode)),
        roundNumber: round.roundNumber + 1
      });
      const persistedNextRound = await this.repository.insertRunRound({
        runId: run.id,
        roundNumber: round.roundNumber + 1,
        languageIsoCode: nextSelected.language.isoCode,
        clipId: nextSelected.clip.id,
        difficulty: nextSelected.difficulty,
        options: nextSelected.options
      });

      nextRoundPayload = this.buildRoundPayload(
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

    await this.repository.updateRunProgress({
      runId: run.id,
      score: nextScore,
      streak: nextStreak,
      livesRemaining: nextLives,
      currentRoundNumber: gameOver ? round.roundNumber : round.roundNumber + 1,
      completedRounds,
      status: gameOver ? "completed" : "active"
    });
    await this.repository.logEvent({
      playerId: input.player.id,
      runId: run.id,
      eventType: "round.answered",
      payload: {
        roundId: round.id,
        correct,
        guessIsoCode: input.guessIsoCode,
        scoreDelta: scoreDelta.total
      }
    });

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
  }

  async applyHint(input: {
    player: PlayerSummary;
    runId: string;
    roundId: string;
    hintType: HintType;
  }): Promise<HintResponse> {
    await this.requireRun(input.player.id, input.runId);
    const rounds = await this.repository.listRunRounds(input.runId);
    const round = rounds.find((candidate) => candidate.id === input.roundId);
    if (!round) {
      throw new Error("Unknown round.");
    }

    if (round.answeredAt) {
      throw new Error("Cannot hint an answered round.");
    }

    const alreadyUsed =
      (input.hintType === "family_region" && round.familyRegionUsed) ||
      (input.hintType === "longer_clip" && round.longerClipUsed);

    if (!alreadyUsed) {
      await this.repository.applyHint(round.id, input.hintType);
      await this.repository.logEvent({
        playerId: input.player.id,
        runId: input.runId,
        eventType: "round.hint",
        payload: { roundId: round.id, hintType: input.hintType }
      });
    }

    const updatedRound = (await this.repository.listRunRounds(input.runId)).find(
      (candidate) => candidate.id === input.roundId
    );
    if (!updatedRound) {
      throw new Error("Round disappeared after hint application.");
    }

    const snapshot = await this.catalogService.getSnapshot();
    const run = await this.requireRun(input.player.id, input.runId);
    const payload = this.buildRoundPayload(
      snapshot,
      updatedRound.clipId,
      updatedRound.languageIsoCode,
      updatedRound,
      run
    );
    const language = snapshot.languages.find(
      (candidate) => candidate.isoCode === updatedRound.languageIsoCode
    );

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
    await this.repository.publishContentVersion(versionName);
    this.catalogService.invalidate();
  }

  async disableClip(clipId: string): Promise<void> {
    await this.repository.disableClip(clipId);
    this.catalogService.invalidate();
  }

  private async requireRun(playerId: string, runId: string): Promise<RunRecord> {
    const run = await this.repository.getRun(runId);
    if (!run || run.playerId !== playerId) {
      throw new Error("Run not found.");
    }

    return run;
  }

  private buildRoundPayload(
    snapshot: CatalogSnapshot,
    clipId: string,
    languageIsoCode: string,
    round: RunRoundRecord,
    run: Pick<RunRecord, "score" | "streak" | "livesRemaining">
  ): RoundPayload {
    const clip = snapshot.clips.find((candidate) => candidate.id === clipId);
    if (!clip) {
      throw new Error(`Clip ${clipId} not found.`);
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
        longerClipUsed: round.longerClipUsed
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
    const language = snapshot.languages.find(
      (candidate) => candidate.isoCode === round.languageIsoCode
    ) ?? (await this.repository.getLanguageByIsoCode(round.languageIsoCode));
    if (!language) {
      throw new Error(`Language ${round.languageIsoCode} not found.`);
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
      ? this.buildRoundPayload(snapshot, nextRound.clipId, nextRound.languageIsoCode, nextRound, run)
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
}
