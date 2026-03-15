"use client";

import { useEffect, useMemo, useRef, useState, startTransition } from "react";

import { AnswerResponse, BootstrapResponse, CreateRunResponse, HintResponse, RoundPayload } from "@language-arcade/shared";

import {
  createRun,
  ensureGuestSession,
  fetchBootstrap,
  submitAnswer,
  useHint
} from "../lib/api";

interface ResultState {
  answer: AnswerResponse;
  nextRound: RoundPayload | null;
}

export function GameClient() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [bootstrap, setBootstrap] = useState<BootstrapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [round, setRound] = useState<RoundPayload | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [playFullClip, setPlayFullClip] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    async function bootstrapGame() {
      try {
        await ensureGuestSession();
        const data = await fetchBootstrap();
        setBootstrap(data);
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : "Bootstrap failed.");
      } finally {
        setLoading(false);
      }
    }

    void bootstrapGame();
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

    void playCurrentClip(false);
  }, [audioEnabled, round, result]);

  const currentClipUrl = useMemo(() => {
    if (!round) {
      return null;
    }

    return playFullClip ? round.clip.fullUrl : round.clip.previewUrl;
  }, [playFullClip, round]);

  async function startRun() {
    setBusy(true);
    setError(null);

    try {
      const created = await createRun();
      setRun(created.runId, created.round);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not start run.");
    } finally {
      setBusy(false);
    }
  }

  function setRun(nextRunId: string, createdRound: RoundPayload) {
    setRunId(nextRunId);
    setRound(createdRound);
    setResult(null);
    setPlayFullClip(false);
    setProgressPct(0);
    preloadClip(createdRound.clip.previewUrl);
  }

  async function chooseOption(guessIsoCode: string) {
    if (!runId || !round) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const answer = await submitAnswer(runId, {
        roundId: round.roundId,
        guessIsoCode
      });
      if (answer.round) {
        preloadClip(answer.round.clip.previewUrl);
      }
      setResult({ answer, nextRound: answer.round });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Answer failed.");
    } finally {
      setBusy(false);
    }
  }

  async function activateAudio() {
    setAudioEnabled(true);
    await playCurrentClip(false);
  }

  async function playCurrentClip(forceFull: boolean) {
    const audio = audioRef.current;
    if (!audio || !round) {
      return;
    }

    const nextUrl = forceFull ? round.clip.fullUrl : currentClipUrl ?? round.clip.previewUrl;
    audio.src = nextUrl;
    audio.currentTime = 0;
    setProgressPct(0);

    try {
      await audio.play();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Audio playback was blocked. Tap enable audio again."
      );
    }
  }

  async function askForHint(hintType: "family_region" | "longer_clip") {
    if (!runId || !round || busy) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const hint = await useHint(runId, { roundId: round.roundId, hintType });
      if (hint.appliedHint === "longer_clip") {
        setPlayFullClip(true);
        startTransition(() => {
          void playCurrentClip(true);
        });
      }
      setRound(hint.round);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Hint failed.");
    } finally {
      setBusy(false);
    }
  }

  function continueAfterResult() {
    if (!result) {
      return;
    }

    if (!result.nextRound || !runId) {
      setRound(null);
      return;
    }

    setRound(result.nextRound);
    setResult(null);
    setPlayFullClip(false);
    setProgressPct(0);
  }

  function preloadClip(url: string) {
    const audio = new Audio(url);
    audio.preload = "auto";
    audio.load();
  }

  if (loading) {
    return <div className="card panel">Loading game systems...</div>;
  }

  return (
    <div className="page-grid">
      <div className="run-shell">
        <section className="card panel">
          <div className="round-status">
            <span className="badge">{bootstrap?.season.name}</span>
            <span className="badge">12 rounds max</span>
            <span className="badge">Server-scored</span>
          </div>
          {!runId || !round ? (
            <div>
              <h1 className="headline" style={{ fontSize: "clamp(2.2rem, 5vw, 3.8rem)" }}>
                Hear it. Name it. Survive the run.
              </h1>
              <p className="lede">
                Each round comes from the backend, not the browser. Scores, hints,
                lives, and leaderboards all stay server-authoritative from the first click.
              </p>
              <div className="actions">
                <button className="button-primary" disabled={busy} onClick={startRun}>
                  {busy ? "Starting..." : "Start Arcade Run"}
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
                <span className="badge">Round {round.roundNumber}</span>
                <span className="badge">Lives {round.livesRemaining}</span>
                <span className="badge">Score {round.score}</span>
                <span className="badge">Streak {round.streak}</span>
              </div>
              <div className="audio-card">
                <h2 style={{ marginTop: 0 }}>Listen before you guess</h2>
                <p className="lede" style={{ marginTop: 0 }}>
                  Use replay freely. Hints help, but the server applies the penalty when you use them.
                </p>
                <audio ref={audioRef} preload="auto" />
                <div className="progress">
                  <div style={{ width: `${progressPct}%` }} />
                </div>
                <div className="actions">
                  {!audioEnabled ? (
                    <button className="button-primary" onClick={activateAudio}>
                      Enable Audio
                    </button>
                  ) : (
                    <button className="button-primary" onClick={() => playCurrentClip(playFullClip)}>
                      Replay Preview
                    </button>
                  )}
                  <button
                    className="button-secondary"
                    disabled={busy || round.hintState.familyRegionUsed}
                    onClick={() => askForHint("family_region")}
                  >
                    Region + Family Hint (-25)
                  </button>
                  <button
                    className="button-secondary"
                    disabled={busy || round.hintState.longerClipUsed}
                    onClick={() => askForHint("longer_clip")}
                  >
                    Longer Clip (-40)
                  </button>
                </div>
                <div className="option-grid">
                  {round.options.map((option) => (
                    <button
                      key={option.isoCode}
                      className="option-button"
                      disabled={busy || Boolean(result)}
                      onClick={() => chooseOption(option.isoCode)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {result ? (
                <div className="result-card">
                  <h3 style={{ marginTop: 0 }}>
                    {result.answer.correct ? "Correct" : "Missed"}: {result.answer.reveal.correctName}
                  </h3>
                  <p className="lede" style={{ marginTop: 0 }}>
                    {result.answer.reveal.nativeName} · {result.answer.reveal.region} ·{" "}
                    {result.answer.reveal.family.join(" / ")}
                  </p>
                  <div className="metric-table">
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
          {error ? <p style={{ color: "#8f2e17" }}>{error}</p> : null}
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
            </div>
          </div>
          <div className="sidebar-card">
            <h3 style={{ marginTop: 0 }}>Launch Catalog</h3>
            <p className="lede" style={{ marginTop: 0 }}>
              This local demo ships with synthetic clips and a FLEURS-shaped roster, but the
              gameplay path is already backend-first and content-versioned.
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
