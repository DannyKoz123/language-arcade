export type DifficultyBand = "easy" | "medium" | "hard";
export type HintType = "family_region" | "longer_clip";
export type LeaderboardWindow = "weekly" | "all_time";

export interface LanguageSummary {
  isoCode: string;
  commonName: string;
  nativeName: string;
  family: string[];
  region: string;
  mainCountries: string[];
  enabled: boolean;
}

export interface ClipSummary {
  id: string;
  languageIsoCode: string;
  previewUrl: string;
  fullUrl: string;
  previewDurationMs: number;
  fullDurationMs: number;
  speakerId: string;
  transcript: string;
  reviewStatus: "approved" | "rejected" | "pending";
  contentVersion: string;
  active: boolean;
}

export interface ConfusionEdge {
  sourceIsoCode: string;
  targetIsoCode: string;
  weight: number;
}

export interface ScoreBreakdown {
  difficultyBase: number;
  speedBonus: number;
  streakMultiplier: number;
  hintPenalty: number;
  total: number;
}

export interface RoundReveal {
  correctIsoCode: string;
  correctName: string;
  nativeName: string;
  family: string[];
  region: string;
  mainCountries: string[];
  clipId: string;
}

export interface RoundOption {
  isoCode: string;
  label: string;
}

export interface RoundPayload {
  roundId: string;
  roundNumber: number;
  difficulty: DifficultyBand;
  livesRemaining: number;
  score: number;
  streak: number;
  hintState: {
    familyRegionUsed: boolean;
    longerClipUsed: boolean;
  };
  clip: {
    previewUrl: string;
    fullUrl: string;
    previewDurationMs: number;
    fullDurationMs: number;
  };
  options: RoundOption[];
}

export interface CreateRunResponse {
  runId: string;
  round: RoundPayload;
}

export interface AnswerResponse {
  round: RoundPayload | null;
  reveal: RoundReveal;
  correct: boolean;
  scoreDelta: ScoreBreakdown;
  totalScore: number;
  streak: number;
  livesRemaining: number;
  gameOver: boolean;
}

export interface HintResponse {
  round: RoundPayload;
  appliedHint: HintType;
  penaltyApplied: number;
  clue: {
    region: string;
    family: string[];
  } | null;
}

export interface BootstrapResponse {
  scoring: {
    easyBase: number;
    mediumBase: number;
    hardBase: number;
    maxSpeedBonus: number;
    streakStep: number;
    maxStreakMultiplier: number;
    familyRegionPenalty: number;
    longerClipPenalty: number;
  };
  season: {
    name: string;
    startedAt: string;
    endsAt: string | null;
  };
  languagesVisible: Array<Pick<LanguageSummary, "isoCode" | "commonName" | "region">>;
}

export interface ProfileResponse {
  player: {
    id: string;
    displayName: string | null;
    guest: boolean;
  };
  stats: {
    personalBest: number;
    runsPlayed: number;
    averageScore: number;
  };
  recentRuns: Array<{
    id: string;
    score: number;
    createdAt: string;
    completedRounds: number;
  }>;
}

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  displayName: string;
  score: number;
  achievedAt: string;
}
