"use client";

import { useEffect, useRef, useState } from "react";

import {
  AnswerResponse,
  BootstrapResponse,
  CreateRunResponse,
  GAME_CONSTANTS,
  RoundPayload
} from "@language-arcade/shared";

import {
  ApiError,
  createRun,
  ensureGuestSession,
  fetchActiveRun,
  fetchBootstrap,
  submitAnswer,
  useHint
} from "../lib/api";

interface ResultState {
  answer: AnswerResponse;
  nextRound: RoundPayload | null;
}

type BusyState = "bootstrapping" | "starting" | "answering" | "hinting" | "resyncing" | null;

export function GameClient() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [bootstrap, setBootstrap] = useState<BootstrapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [round, setRound] = useState<RoundPayload | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [playFullClip, setPlayFullClip] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [busyState, setBusyState] = useState<BusyState>(null);

  const actionBusy = busyState !== null && busyState !== "bootstrapping";
  const roundProgressPct = round
    ? Math.round((round.roundNumber / GAME_CONSTANTS.roundsPerRun) * 100)
    : 0;

  useEffect(() => {
    let cancelled = false;

    async function bootstrapGame() {
      setBusyState("bootstrapping");

      try {
        await ensureGuestSession();
        const [bootstrapData, activeRun] = await Promise.all([
          fetchBootstrap(),
          fetchActiveRun()
        ]);

        if (cancelled) {
          return;
        }

        setBootstrap(bootstrapData);

        if (activeRun.run) {
          applyRunState(activeRun.run.runId, activeRun.run.round);
          setNotice(`Run restored at round ${activeRun.run.round.roundNumber}.`);
        }
      } catch (caughtError) {
        if (!cancelled) {
          setError(getErrorMessage(caughtError, "Bootstrap failed."));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setBusyState(null);
        }
      }
    }

    void bootstrapGame();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const onTimeUpdate = () => {
      const duration = audio.duration || 1;
      setProgressPct((audio.currentTime / duration) * 100);
    };

    const onEnded = () => {
      setProgressPct(100);
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  useEffect(() => {
    if (!audioEnabled || !round || result) {
      return;
    }

    void playCurrentClip(playFullClip);
  }, [audioEnabled, round, result, playFullClip]);

  async function startRun() {
    setBusyState("starting");
    setError(null);
    setNotice(null);

    try {
      const created = await createRun();
      applyCreatedRun(created);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "Could not start run."));
    } finally {
      setBusyState(null);
    }
  }

  async function chooseOption(guessIsoCode: string) {
    if (!runId || !round || actionBusy) {
      return;
    }

    setBusyState("answering");
    setError(null);
    setNotice(null);

    try {
      const answer = await submitAnswer(runId, {
        roundId: round.roundId,
        guessIsoCode
      });
      if (answer.round) {
        preloadClip(answer.round.clip.previewUrl);
      }
      setResult({ answer, nextRound: answer.round });
      setNotice(answer.correct ? "Correct answer locked in." : "Round revealed.");
    } catch (caughtError) {
      await handleRunMutationError(caughtError, "Answer failed.");
    } finally {
      setBusyState(null);
    }
  }

  async function activateAudio() {
    setAudioEnabled(true);
    setError(null);
    await playCurrentClip(playFullClip);
  }

  async function playCurrentClip(forceFull: boolean) {
    const audio = audioRef.current;
    if (!audio || !round) {
      return;
    }

    const nextUrl = forceFull ? round.clip.fullUrl : round.clip.previewUrl;
    audio.pause();
    audio.src = nextUrl;
    audio.currentTime = 0;
    setProgressPct(0);

    try {
      await audio.play();
    } catch (caughtError) {
      setError(
        getErrorMessage(
          caughtError,
          "Audio playback was blocked. Tap enable audio again."
        )
      );
    }
  }

  async function askForHint(hintType: "family_region" | "longer_clip") {
    if (!runId || !round || actionBusy) {
      return;
    }

    setBusyState("hinting");
    setError(null);
    setNotice(null);

    try {
      const hint = await useHint(runId, { roundId: round.roundId, hintType });
      setRound(hint.round);
      setPlayFullClip(hint.round.hintState.longerClipUsed);
      setNotice(
        hintType === "family_region"
          ? "Family and region clue unlocked."
          : "Longer clip unlocked."
      );
    } catch (caughtError) {
      await handleRunMutationError(caughtError, "Hint failed.");
    } finally {
      setBusyState(null);
    }
  }

  function continueAfterResult() {
    if (!result) {
      return;
    }

    if (!result.nextRound || !runId) {
      clearRunState();
      setNotice("Run complete. Start another run when you're ready.");
      return;
    }

    applyRunState(runId, result.nextRound);
    setNotice(`Round ${result.nextRound.roundNumber} is ready.`);
  }

  function applyCreatedRun(created: CreateRunResponse) {
    applyRunState(created.runId, created.round);
    setNotice(
      created.resumed
        ? `Active run resumed at round ${created.round.roundNumber}.`
        : "New run ready. Listen, then guess."
    );
  }

  function applyRunState(nextRunId: string, nextRound: RoundPayload) {
    setRunId(nextRunId);
    setRound(nextRound);
    setResult(null);
    setPlayFullClip(nextRound.hintState.longerClipUsed);
    setProgressPct(0);
    preloadClip(
      nextRound.hintState.longerClipUsed
        ? nextRound.clip.fullUrl
        : nextRound.clip.previewUrl
    );
  }

  function clearRunState() {
    setRunId(null);
    setRound(null);
    setResult(null);
    setPlayFullClip(false);
    setProgressPct(0);
  }

  async function handleRunMutationError(caughtError: unknown, fallbackMessage: string) {
    if (
      caughtError instanceof ApiError &&
      (caughtError.status === 404 || caughtError.status === 409)
    ) {
      await syncActiveRun(
        "Your run changed on the server, so the latest state was restored."
      );
      return;
    }

    setError(getErrorMessage(caughtError, fallbackMessage));
  }

  async function syncActiveRun(message: string) {
    setBusyState("resyncing");

    try {
      const activeRun = await fetchActiveRun();
      if (activeRun.run) {
        applyRunState(activeRun.run.runId, activeRun.run.round);
      } else {
        clearRunState();
      }
      setNotice(message);
      setError(null);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "Could not restore the current run."));
    } finally {
      setBusyState(null);
    }
  }

  function preloadClip(url: string) {
    const audio = new Audio(url);
    audio.preload = "auto";
    audio.load();
  }

  if (loading) {
    return (
      <div className="card panel" role="status" aria-live="polite">
        Loading game systems...
      </div>
    );
  }

  return (
    <div className="page-grid">
      <div className="run-shell">
        <section className="card panel">
          <div className="round-status">
            <span className="badge">{bootstrap?.season.name ?? "Current Season"}</span>
            <span className="badge">{GAME_CONSTANTS.roundsPerRun} rounds max</span>
            <span className="badge">Server-scored</span>
          </div>

          {notice ? (
            <p className="message message-info" role="status" aria-live="polite">
              {notice}
            </p>
          ) : null}
          {error ? (
            <p className="message message-error" role="alert">
              {error}
            </p>
          ) : null}

          {!runId || !round ? (
            <div>
              <h1 className="headline" style={{ fontSize: "clamp(2.2rem, 5vw, 3.8rem)" }}>
                Hear it. Name it. Survive the run.
              </h1>
              <p className="lede">
                Runs stay backend-owned from the first click. If you refresh mid-run, the latest
                active round comes back from the API instead of resetting in the browser.
              </p>
              <div className="actions">
                <button className="button-primary" disabled={actionBusy} onClick={startRun}>
                  {busyState === "starting" ? "Preparing..." : "Start Arcade Run"}
                </button>
                {!audioEnabled ? (
                  <button className="button-secondary" onClick={activateAudio}>
                    Enable Audio
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <div>
              <div className="round-status">
                <span className="badge">
                  Round {round.roundNumber} of {GAME_CONSTANTS.roundsPerRun}
                </span>
                <span className="badge">Lives {round.livesRemaining}</span>
                <span className="badge">Score {round.score}</span>
                <span className="badge">Streak {round.streak}</span>
              </div>

              <div className="run-progress-card" aria-label="Run progress">
                <div className="run-progress-copy">
                  <strong>{roundProgressPct}% complete</strong>
                  <span>{GAME_CONSTANTS.roundsPerRun - round.roundNumber} rounds after this one</span>
                </div>
                <div className="progress progress-run">
                  <div style={{ width: `${roundProgressPct}%` }} />
                </div>
              </div>

              <div className="audio-card">
                <h2 style={{ marginTop: 0 }}>Listen before you guess</h2>
                <p className="lede" style={{ marginTop: 0 }}>
                  Replays are free. Hints help, but the server applies the penalty and keeps the
                  run state authoritative.
                </p>
                <audio ref={audioRef} preload="auto" />
                <div className="progress" aria-hidden="true">
                  <div style={{ width: `${progressPct}%` }} />
                </div>
                <div className="actions">
                  {!audioEnabled ? (
                    <button className="button-primary" onClick={activateAudio}>
                      Enable Audio
                    </button>
                  ) : (
                    <button
                      className="button-primary"
                      disabled={actionBusy}
                      onClick={() => playCurrentClip(playFullClip)}
                    >
                      {playFullClip ? "Replay Longer Clip" : "Replay Preview"}
                    </button>
                  )}
                  <button
                    className="button-secondary"
                    disabled={actionBusy || round.hintState.familyRegionUsed}
                    onClick={() => askForHint("family_region")}
                  >
                    Region + Family Hint (-{bootstrap?.scoring.familyRegionPenalty ?? 25})
                  </button>
                  <button
                    className="button-secondary"
                    disabled={actionBusy || round.hintState.longerClipUsed}
                    onClick={() => askForHint("longer_clip")}
                  >
                    Longer Clip (-{bootstrap?.scoring.longerClipPenalty ?? 40})
                  </button>
                </div>

                {round.hintState.familyRegionClue ? (
                  <div className="hint-panel" role="note">
                    <strong>Family + Region</strong>
                    <span>
                      {round.hintState.familyRegionClue.region} •{" "}
                      {round.hintState.familyRegionClue.family.join(" / ")}
                    </span>
                  </div>
                ) : null}
                {round.hintState.longerClipUsed ? (
                  <div className="hint-panel" role="note">
                    <strong>Longer clip unlocked</strong>
                    <span>Replay now uses the extended sample for this round.</span>
                  </div>
                ) : null}

                <div className="option-grid">
                  {round.options.map((option) => (
                    <button
                      key={option.isoCode}
                      className="option-button"
                      disabled={actionBusy || Boolean(result)}
                      onClick={() => chooseOption(option.isoCode)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {result ? (
                <div className="result-card" aria-live="polite">
                  <h3 style={{ marginTop: 0 }}>
                    {result.answer.correct ? "Correct" : "Missed"}: {result.answer.reveal.correctName}
                  </h3>
                  <p className="lede" style={{ marginTop: 0 }}>
                    {result.answer.reveal.nativeName} • {result.answer.reveal.region} •{" "}
                    {result.answer.reveal.family.join(" / ")}
                  </p>
                  <p className="lede" style={{ marginTop: 0 }}>
                    Main countries: {result.answer.reveal.mainCountries.join(", ")}
                  </p>
                  <div className="metric-table">
                    <div className="metric-row">
                      <span>Difficulty base</span>
                      <strong>{result.answer.scoreDelta.difficultyBase}</strong>
                    </div>
                    <div className="metric-row">
                      <span>Speed bonus</span>
                      <strong>+{result.answer.scoreDelta.speedBonus}</strong>
                    </div>
                    <div className="metric-row">
                      <span>Hint penalty</span>
                      <strong>-{result.answer.scoreDelta.hintPenalty}</strong>
                    </div>
                    <div className="metric-row">
                      <span>Streak multiplier</span>
                      <strong>x{result.answer.scoreDelta.streakMultiplier.toFixed(1)}</strong>
                    </div>
                    <div className="metric-row">
                      <span>Round score</span>
                      <strong>+{result.answer.scoreDelta.total}</strong>
                    </div>
                    <div className="metric-row">
                      <span>Total score</span>
                      <strong>{result.answer.totalScore}</strong>
                    </div>
                    <div className="metric-row">
                      <span>Lives remaining</span>
                      <strong>{result.answer.livesRemaining}</strong>
                    </div>
                  </div>
                  <div className="actions">
                    {result.answer.gameOver ? (
                      <button className="button-primary" onClick={startRun}>
                        Start Another Run
                      </button>
                    ) : (
                      <button className="button-primary" onClick={continueAfterResult}>
                        Continue
                      </button>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </section>

        <aside className="sidebar-stack">
          <div className="sidebar-card">
            <h3 style={{ marginTop: 0 }}>Scoring Model</h3>
            <div className="metric-table">
              <div className="metric-row">
                <span>Easy base</span>
                <strong>{bootstrap?.scoring.easyBase}</strong>
              </div>
              <div className="metric-row">
                <span>Medium base</span>
                <strong>{bootstrap?.scoring.mediumBase}</strong>
              </div>
              <div className="metric-row">
                <span>Hard base</span>
                <strong>{bootstrap?.scoring.hardBase}</strong>
              </div>
              <div className="metric-row">
                <span>Max speed bonus</span>
                <strong>{bootstrap?.scoring.maxSpeedBonus}</strong>
              </div>
              <div className="metric-row">
                <span>Streak step</span>
                <strong>{bootstrap?.scoring.streakStep}</strong>
              </div>
            </div>
          </div>
          <div className="sidebar-card">
            <h3 style={{ marginTop: 0 }}>Launch Catalog</h3>
            <p className="lede" style={{ marginTop: 0 }}>
              This local demo ships with synthetic clips and a FLEURS-shaped roster, but the
              gameplay path is already backend-first, resumable, and content-version aware.
            </p>
            <div className="metric-table">
              <div className="metric-row">
                <span>Visible languages</span>
                <strong>{bootstrap?.languagesVisible.length ?? 0}</strong>
              </div>
              <div className="metric-row">
                <span>Season</span>
                <strong>{bootstrap?.season.name}</strong>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function getErrorMessage(caughtError: unknown, fallback: string): string {
  return caughtError instanceof Error ? caughtError.message : fallback;
}
