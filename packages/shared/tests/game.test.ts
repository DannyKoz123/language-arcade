import { describe, expect, it } from "vitest";

import {
  ClipSummary,
  ConfusionEdge,
  LanguageSummary,
  computeScoreBreakdown,
  createMulberry32,
  optionCountForRound,
  selectRound
} from "../src/index.js";

const languages: LanguageSummary[] = [
  {
    isoCode: "eng",
    commonName: "English",
    nativeName: "English",
    family: ["Indo-European", "Germanic"],
    region: "Europe",
    mainCountries: ["United Kingdom"],
    enabled: true
  },
  {
    isoCode: "deu",
    commonName: "German",
    nativeName: "Deutsch",
    family: ["Indo-European", "Germanic"],
    region: "Europe",
    mainCountries: ["Germany"],
    enabled: true
  },
  {
    isoCode: "fra",
    commonName: "French",
    nativeName: "Francais",
    family: ["Indo-European", "Romance"],
    region: "Europe",
    mainCountries: ["France"],
    enabled: true
  },
  {
    isoCode: "jpn",
    commonName: "Japanese",
    nativeName: "Nihongo",
    family: ["Japonic"],
    region: "East Asia",
    mainCountries: ["Japan"],
    enabled: true
  },
  {
    isoCode: "kor",
    commonName: "Korean",
    nativeName: "Hanguk-eo",
    family: ["Koreanic"],
    region: "East Asia",
    mainCountries: ["South Korea"],
    enabled: true
  },
  {
    isoCode: "tha",
    commonName: "Thai",
    nativeName: "Thai",
    family: ["Kra-Dai"],
    region: "Southeast Asia",
    mainCountries: ["Thailand"],
    enabled: true
  },
  {
    isoCode: "vie",
    commonName: "Vietnamese",
    nativeName: "Tieng Viet",
    family: ["Austroasiatic"],
    region: "Southeast Asia",
    mainCountries: ["Vietnam"],
    enabled: true
  },
  {
    isoCode: "ind",
    commonName: "Indonesian",
    nativeName: "Bahasa Indonesia",
    family: ["Austronesian"],
    region: "Southeast Asia",
    mainCountries: ["Indonesia"],
    enabled: true
  }
];

const clips: ClipSummary[] = languages.map((language, index) => ({
  id: `clip-${language.isoCode}`,
  languageIsoCode: language.isoCode,
  previewUrl: `/${language.isoCode}.wav`,
  fullUrl: `/${language.isoCode}-full.wav`,
  previewDurationMs: 6000,
  fullDurationMs: 8000,
  speakerId: `speaker-${index}`,
  transcript: "",
  reviewStatus: "approved",
  contentVersion: "demo",
  active: true
}));

const confusionEdges: ConfusionEdge[] = [
  { sourceIsoCode: "eng", targetIsoCode: "deu", weight: 0.9 },
  { sourceIsoCode: "deu", targetIsoCode: "eng", weight: 0.9 }
];

describe("shared game rules", () => {
  it("uses the planned option ramp", () => {
    expect(optionCountForRound(1)).toBe(4);
    expect(optionCountForRound(6)).toBe(6);
    expect(optionCountForRound(11)).toBe(8);
  });

  it("computes score using difficulty, speed, streak, and penalties", () => {
    const score = computeScoreBreakdown({
      difficulty: "hard",
      elapsedMs: 3000,
      priorStreak: 3,
      hintsUsed: ["family_region"],
      correct: true
    });

    expect(score.difficultyBase).toBe(250);
    expect(score.hintPenalty).toBe(25);
    expect(score.streakMultiplier).toBeGreaterThan(1);
    expect(score.total).toBeGreaterThan(250);
  });

  it("prefers confusion-aware distractors on harder rounds", () => {
    const rng = createMulberry32(7);
    const selected = selectRound({
      languages,
      clips,
      confusionEdges,
      usedClipIds: new Set(),
      usedLanguageCodes: new Set(),
      roundNumber: 10,
      rng
    });

    if (selected.language.isoCode === "eng") {
      expect(selected.options.some((option) => option.isoCode === "deu")).toBe(true);
    }
  });
});
