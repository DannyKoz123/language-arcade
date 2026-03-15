import {
  ClipSummary,
  ConfusionEdge,
  DifficultyBand,
  HintType,
  LanguageSummary,
  RoundOption,
  ScoreBreakdown
} from "./types.js";

export const GAME_CONSTANTS = {
  roundsPerRun: 12,
  startingLives: 3,
  easyBase: 100,
  mediumBase: 150,
  hardBase: 250,
  maxSpeedBonus: 50,
  streakStep: 0.1,
  maxStreakMultiplier: 2,
  familyRegionPenalty: 25,
  longerClipPenalty: 40
} as const;

export interface SelectionInput {
  languages: LanguageSummary[];
  clips: ClipSummary[];
  confusionEdges: ConfusionEdge[];
  usedClipIds: Set<string>;
  usedLanguageCodes: Set<string>;
  roundNumber: number;
  rng?: () => number;
}

export interface SelectedRound {
  language: LanguageSummary;
  clip: ClipSummary;
  options: RoundOption[];
  difficulty: DifficultyBand;
}

const difficultyByRound: Record<number, DifficultyBand> = {
  1: "easy",
  2: "easy",
  3: "easy",
  4: "easy",
  5: "medium",
  6: "medium",
  7: "medium",
  8: "medium",
  9: "hard",
  10: "hard",
  11: "hard",
  12: "hard"
};

export function difficultyForRound(roundNumber: number): DifficultyBand {
  return difficultyByRound[roundNumber] ?? "hard";
}

export function optionCountForRound(roundNumber: number): number {
  if (roundNumber <= 4) {
    return 4;
  }

  if (roundNumber <= 8) {
    return 6;
  }

  return 8;
}

export function createMulberry32(seed: number): () => number {
  let value = seed >>> 0;

  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function computeSpeedBonus(elapsedMs: number): number {
  const clamped = Math.max(0, Math.min(elapsedMs, 30000));
  const ratio = 1 - clamped / 30000;
  return Math.round(GAME_CONSTANTS.maxSpeedBonus * ratio);
}

export function computeHintPenalty(hints: HintType[]): number {
  return hints.reduce((total, hint) => {
    if (hint === "family_region") {
      return total + GAME_CONSTANTS.familyRegionPenalty;
    }

    return total + GAME_CONSTANTS.longerClipPenalty;
  }, 0);
}

export function computeScoreBreakdown(input: {
  difficulty: DifficultyBand;
  elapsedMs: number;
  priorStreak: number;
  hintsUsed: HintType[];
  correct: boolean;
}): ScoreBreakdown {
  if (!input.correct) {
    return {
      difficultyBase: 0,
      speedBonus: 0,
      streakMultiplier: 1,
      hintPenalty: 0,
      total: 0
    };
  }

  const difficultyBase =
    input.difficulty === "easy"
      ? GAME_CONSTANTS.easyBase
      : input.difficulty === "medium"
        ? GAME_CONSTANTS.mediumBase
        : GAME_CONSTANTS.hardBase;
  const speedBonus = computeSpeedBonus(input.elapsedMs);
  const hintPenalty = computeHintPenalty(input.hintsUsed);
  const raw = Math.max(0, difficultyBase + speedBonus - hintPenalty);
  const streakMultiplier = Math.min(
    GAME_CONSTANTS.maxStreakMultiplier,
    1 + input.priorStreak * GAME_CONSTANTS.streakStep
  );
  const total = Math.round(raw * streakMultiplier);

  return {
    difficultyBase,
    speedBonus,
    streakMultiplier,
    hintPenalty,
    total
  };
}

export function selectRound(input: SelectionInput): SelectedRound {
  const rng = input.rng ?? Math.random;
  const difficulty = difficultyForRound(input.roundNumber);
  const optionCount = optionCountForRound(input.roundNumber);
  const enabledLanguages = input.languages.filter((language) => language.enabled);
  const eligibleClips = input.clips.filter(
    (clip) => clip.active && clip.reviewStatus === "approved" && !input.usedClipIds.has(clip.id)
  );
  const candidateLanguages = enabledLanguages.filter((language) =>
    eligibleClips.some((clip) => clip.languageIsoCode === language.isoCode)
  );
  const unseenLanguages = candidateLanguages.filter(
    (language) => !input.usedLanguageCodes.has(language.isoCode)
  );
  const pool = unseenLanguages.length >= optionCount ? unseenLanguages : candidateLanguages;

  if (pool.length < optionCount) {
    throw new Error("Not enough languages to build a round.");
  }

  const correctLanguage = pool[Math.floor(rng() * pool.length)];
  const clipPool = eligibleClips.filter((clip) => clip.languageIsoCode === correctLanguage.isoCode);
  const clip = clipPool[Math.floor(rng() * clipPool.length)];

  if (!clip) {
    throw new Error(`No clip available for ${correctLanguage.isoCode}.`);
  }

  const distractors = rankDistractors({
    correctLanguage,
    candidates: pool.filter((candidate) => candidate.isoCode !== correctLanguage.isoCode),
    confusionEdges: input.confusionEdges,
    difficulty,
    rng
  }).slice(0, optionCount - 1);

  const options = shuffle(
    [
      { isoCode: correctLanguage.isoCode, label: correctLanguage.commonName },
      ...distractors.map((language) => ({
        isoCode: language.isoCode,
        label: language.commonName
      }))
    ],
    rng
  );

  return {
    language: correctLanguage,
    clip,
    options,
    difficulty
  };
}

function rankDistractors(input: {
  correctLanguage: LanguageSummary;
  candidates: LanguageSummary[];
  confusionEdges: ConfusionEdge[];
  difficulty: DifficultyBand;
  rng: () => number;
}): LanguageSummary[] {
  const scored = input.candidates.map((candidate) => {
    const confusionScore = edgeWeight(
      input.confusionEdges,
      input.correctLanguage.isoCode,
      candidate.isoCode
    );
    const familyOverlap = sharedPrefixDepth(
      input.correctLanguage.family,
      candidate.family
    );
    const regionBoost = input.correctLanguage.region === candidate.region ? 1 : 0;
    const closeness = confusionScore * 3 + familyOverlap * 2 + regionBoost;

    return {
      language: candidate,
      closeness: closeness + input.rng() * 0.01
    };
  });

  const descending = scored.sort((left, right) => right.closeness - left.closeness);

  if (input.difficulty === "hard") {
    return descending.map((entry) => entry.language);
  }

  if (input.difficulty === "medium") {
    const pivot = Math.max(1, Math.floor(descending.length / 2));
    const harderHalf = descending.slice(0, pivot);
    const easierHalf = descending.slice(pivot);
    return [...harderHalf, ...easierHalf].map((entry) => entry.language);
  }

  return descending.reverse().map((entry) => entry.language);
}

function edgeWeight(
  edges: ConfusionEdge[],
  sourceIsoCode: string,
  targetIsoCode: string
): number {
  const edge = edges.find(
    (candidate) =>
      candidate.sourceIsoCode === sourceIsoCode &&
      candidate.targetIsoCode === targetIsoCode
  );

  return edge?.weight ?? 0;
}

function sharedPrefixDepth(left: string[], right: string[]): number {
  const limit = Math.min(left.length, right.length);
  let depth = 0;

  for (let index = 0; index < limit; index += 1) {
    if (left[index] !== right[index]) {
      break;
    }

    depth += 1;
  }

  return depth;
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const clone = [...items];

  for (let index = clone.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [clone[index], clone[swapIndex]] = [clone[swapIndex], clone[index]];
  }

  return clone;
}
