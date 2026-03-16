import { describe, expect, it, vi } from "vitest";

import {
  ClipSummary,
  ConfusionEdge,
  LanguageSummary,
  RoundOption
} from "@language-arcade/shared";

import { GameService } from "../src/services/gameService.js";

const languages: LanguageSummary[] = [
  { isoCode: "eng", commonName: "English", nativeName: "English", family: ["Indo-European", "Germanic"], region: "Europe", mainCountries: ["United Kingdom"], enabled: true },
  { isoCode: "deu", commonName: "German", nativeName: "Deutsch", family: ["Indo-European", "Germanic"], region: "Europe", mainCountries: ["Germany"], enabled: true },
  { isoCode: "fra", commonName: "French", nativeName: "Francais", family: ["Indo-European", "Romance"], region: "Europe", mainCountries: ["France"], enabled: true },
  { isoCode: "spa", commonName: "Spanish", nativeName: "Espanol", family: ["Indo-European", "Romance"], region: "Americas", mainCountries: ["Spain"], enabled: true },
  { isoCode: "jpn", commonName: "Japanese", nativeName: "Nihongo", family: ["Japonic"], region: "East Asia", mainCountries: ["Japan"], enabled: true },
  { isoCode: "kor", commonName: "Korean", nativeName: "Hanguk-eo", family: ["Koreanic"], region: "East Asia", mainCountries: ["South Korea"], enabled: true },
  { isoCode: "tha", commonName: "Thai", nativeName: "Thai", family: ["Kra-Dai"], region: "Southeast Asia", mainCountries: ["Thailand"], enabled: true },
  { isoCode: "vie", commonName: "Vietnamese", nativeName: "Tieng Viet", family: ["Austroasiatic"], region: "Southeast Asia", mainCountries: ["Vietnam"], enabled: true }
];

const clips: ClipSummary[] = languages.map((language, index) => ({
  id: `11111111-1111-1111-1111-${String(index).padStart(12, "0")}`,
  languageIsoCode: language.isoCode,
  previewUrl: `/audio/${language.isoCode}-preview.wav`,
  fullUrl: `/audio/${language.isoCode}-full.wav`,
  previewDurationMs: 6000,
  fullDurationMs: 8000,
  speakerId: `speaker-${language.isoCode}`,
  transcript: "",
  reviewStatus: "approved",
  contentVersion: "demo",
  active: true
}));

const confusionEdges: ConfusionEdge[] = [
  { sourceIsoCode: "eng", targetIsoCode: "deu", weight: 0.95 },
  { sourceIsoCode: "deu", targetIsoCode: "eng", weight: 0.95 }
];

function makeRun(overrides: Partial<{
  id: string;
  playerId: string;
  status: "active" | "completed" | "abandoned";
  score: number;
  streak: number;
  livesRemaining: number;
  currentRoundNumber: number;
  completedRounds: number;
  seasonId: string;
  createdAt: string;
  finishedAt: string | null;
}> = {}) {
  return {
    id: "33333333-3333-3333-3333-333333333333",
    playerId: "player-1",
    status: "active" as const,
    score: 0,
    streak: 0,
    livesRemaining: 3,
    currentRoundNumber: 1,
    completedRounds: 0,
    seasonId: "season-1",
    createdAt: new Date().toISOString(),
    finishedAt: null,
    ...overrides
  };
}

function makeRound(roundNumber: number, languageIsoCode: string, clipId: string, options: RoundOption[]) {
  return {
    id: `22222222-2222-2222-2222-${String(roundNumber).padStart(12, "0")}`,
    runId: "33333333-3333-3333-3333-333333333333",
    roundNumber,
    languageIsoCode,
    clipId,
    difficulty: roundNumber >= 9 ? "hard" : roundNumber >= 5 ? "medium" : "easy",
    options,
    hintTypes: [],
    familyRegionUsed: false,
    longerClipUsed: false,
    startedAt: new Date(Date.now() - 1_000).toISOString(),
    answeredAt: null,
    answerIsoCode: null,
    correct: null,
    scoreDelta: null
  } as const;
}

function makeRepositoryMock(overrides: Record<string, unknown> = {}) {
  return {
    withTransaction: vi.fn().mockImplementation(async (callback: (client: unknown) => Promise<unknown>) =>
      callback({})
    ),
    lockPlayer: vi.fn(),
    getLatestActiveRunForPlayer: vi.fn().mockResolvedValue(null),
    getActiveSeason: vi.fn().mockResolvedValue({
      id: "season-1",
      name: "Launch Season",
      startedAt: new Date().toISOString(),
      endsAt: null
    }),
    createRun: vi.fn().mockResolvedValue(makeRun({ currentRoundNumber: 0 })),
    insertRunRound: vi.fn().mockImplementation(async (input: { roundNumber: number; languageIsoCode: string; clipId: string; options: RoundOption[] }) =>
      makeRound(input.roundNumber, input.languageIsoCode, input.clipId, input.options)
    ),
    updateRunProgress: vi.fn(),
    logEvent: vi.fn(),
    getRun: vi.fn().mockResolvedValue(makeRun()),
    listRunRounds: vi.fn().mockResolvedValue([]),
    markRoundAnswered: vi.fn(),
    getRunRound: vi.fn(),
    applyHint: vi.fn(),
    getLanguageByIsoCode: vi.fn(),
    getClipById: vi.fn(),
    getProfile: vi.fn(),
    getLeaderboard: vi.fn(),
    upsertDisplayName: vi.fn(),
    publishContentVersion: vi.fn(),
    disableClip: vi.fn(),
    ...overrides
  };
}

describe("GameService", () => {
  it("creates a run and returns a first round payload", async () => {
    const repository = makeRepositoryMock();
    const catalogService = {
      getSnapshot: vi.fn().mockResolvedValue({ languages, clips, confusionEdges }),
      invalidate: vi.fn()
    };
    const service = new GameService(repository as never, catalogService as never);

    const response = await service.createRun({
      id: "player-1",
      displayName: null,
      guest: true
    });

    expect(response.resumed).toBe(false);
    expect(response.runId).toBe("33333333-3333-3333-3333-333333333333");
    expect(response.round.roundNumber).toBe(1);
    expect(response.round.options).toHaveLength(4);
    expect(response.round.hintState.familyRegionClue).toBeNull();
  });

  it("resumes the latest active run instead of creating a duplicate", async () => {
    const firstRoundOptions = languages.slice(0, 4).map((language) => ({
      isoCode: language.isoCode,
      label: language.commonName
    }));
    const repository = makeRepositoryMock({
      getLatestActiveRunForPlayer: vi.fn().mockResolvedValue(makeRun()),
      listRunRounds: vi.fn().mockResolvedValue([
        makeRound(1, "eng", clips[0].id, firstRoundOptions)
      ])
    });
    const catalogService = {
      getSnapshot: vi.fn().mockResolvedValue({ languages, clips, confusionEdges }),
      invalidate: vi.fn()
    };
    const service = new GameService(repository as never, catalogService as never);

    const response = await service.createRun({
      id: "player-1",
      displayName: null,
      guest: true
    });

    expect(response.resumed).toBe(true);
    expect(response.round.roundNumber).toBe(1);
    expect(repository.createRun).not.toHaveBeenCalled();
  });

  it("answers a round, updates score, and issues the next round", async () => {
    const firstRoundOptions = languages.slice(0, 4).map((language) => ({
      isoCode: language.isoCode,
      label: language.commonName
    }));
    const run = makeRun();
    const firstRound = makeRound(1, "eng", clips[0].id, firstRoundOptions);
    const answeredFirstRound = {
      ...firstRound,
      answeredAt: new Date().toISOString(),
      answerIsoCode: "eng",
      correct: true,
      scoreDelta: {
        difficultyBase: 100,
        speedBonus: 48,
        streakMultiplier: 1,
        hintPenalty: 0,
        total: 148
      }
    };

    const repository = makeRepositoryMock({
      getRun: vi.fn().mockResolvedValue(run),
      listRunRounds: vi.fn().mockResolvedValue([firstRound]),
      markRoundAnswered: vi.fn().mockResolvedValue(answeredFirstRound)
    });
    const catalogService = {
      getSnapshot: vi.fn().mockResolvedValue({ languages, clips, confusionEdges }),
      invalidate: vi.fn()
    };
    const service = new GameService(repository as never, catalogService as never);

    const response = await service.answerRound({
      player: { id: "player-1", displayName: null, guest: true },
      runId: run.id,
      roundId: firstRound.id,
      guessIsoCode: "eng"
    });

    expect(response.correct).toBe(true);
    expect(response.totalScore).toBeGreaterThan(0);
    expect(response.gameOver).toBe(false);
    expect(response.round?.roundNumber).toBe(2);
    expect(repository.insertRunRound).toHaveBeenCalledTimes(1);
  });
});
