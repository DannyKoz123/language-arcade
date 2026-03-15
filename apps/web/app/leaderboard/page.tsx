"use client";

import { useEffect, useState } from "react";

import { LeaderboardEntry } from "@language-arcade/shared";

import { Shell } from "../../components/Shell";
import { fetchLeaderboard } from "../../lib/api";

export default function LeaderboardPage() {
  const [window, setWindow] = useState<"weekly" | "all_time">("weekly");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchLeaderboard(window)
      .then((payload) => setEntries(payload.entries))
      .catch((caughtError) =>
        setError(caughtError instanceof Error ? caughtError.message : "Could not load leaderboard.")
      );
  }, [window]);

  return (
    <Shell>
      <div className="page-grid">
        <section className="card panel">
          <div className="actions" style={{ marginTop: 0 }}>
            <button className="button-primary" onClick={() => setWindow("weekly")}>
              Weekly
            </button>
            <button className="button-secondary" onClick={() => setWindow("all_time")}>
              All Time
            </button>
          </div>
          <h1 className="headline" style={{ fontSize: "clamp(2rem, 5vw, 3.8rem)" }}>
            Leaderboard
          </h1>
          <p className="lede">
            Only players who opted into a display name appear here. Everything shown below comes
            from completed server-validated runs.
          </p>
          <div className="leaderboard-list">
            {entries.map((entry) => (
              <div key={`${entry.playerId}-${entry.rank}`} className="leaderboard-item">
                <div>
                  <strong>#{entry.rank}</strong> {entry.displayName}
                </div>
                <div>{entry.score}</div>
              </div>
            ))}
            {entries.length === 0 ? <div className="leaderboard-item">No public scores yet.</div> : null}
          </div>
          {error ? <p style={{ color: "#8f2e17" }}>{error}</p> : null}
        </section>
      </div>
    </Shell>
  );
}
