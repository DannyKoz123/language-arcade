"use client";

import { FormEvent, useEffect, useState } from "react";

import { ProfileResponse } from "@language-arcade/shared";

import { Shell } from "../../components/Shell";
import { ensureGuestSession, fetchProfile, updateDisplayName } from "../../lib/api";

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      try {
        await ensureGuestSession();
        const nextProfile = await fetchProfile();
        setProfile(nextProfile);
        setDisplayName(nextProfile.player.displayName ?? "");
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : "Could not load profile.");
      }
    }

    void loadProfile();
  }, []);

  async function saveDisplayName(event: FormEvent) {
    event.preventDefault();
    setSaved(false);

    try {
      await updateDisplayName(displayName);
      const nextProfile = await fetchProfile();
      setProfile(nextProfile);
      setSaved(true);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not save display name.");
    }
  }

  return (
    <Shell>
      <div className="page-grid">
        <section className="card panel">
          <h1 className="headline" style={{ fontSize: "clamp(2rem, 5vw, 3.8rem)" }}>
            Your profile
          </h1>
          <p className="lede">
            Guest profiles exist on the backend immediately. Add a display name when you want to
            appear on the public leaderboard.
          </p>
          {profile ? (
            <>
              <div className="metric-table">
                <div className="metric-row">
                  <span>Personal best</span>
                  <strong>{profile.stats.personalBest}</strong>
                </div>
                <div className="metric-row">
                  <span>Runs played</span>
                  <strong>{profile.stats.runsPlayed}</strong>
                </div>
                <div className="metric-row">
                  <span>Average score</span>
                  <strong>{profile.stats.averageScore}</strong>
                </div>
              </div>
              <form className="field-row" onSubmit={saveDisplayName}>
                <input
                  aria-label="Display name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Set a public display name"
                />
                <button className="button-primary" type="submit">
                  Save Name
                </button>
              </form>
              {saved ? <p>Display name saved.</p> : null}
              <div className="run-list">
                {profile.recentRuns.map((run) => (
                  <div key={run.id} className="run-item">
                    <div>
                      <strong>{new Date(run.createdAt).toLocaleString()}</strong>
                      <div>{run.completedRounds} rounds completed</div>
                    </div>
                    <div>{run.score}</div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p>Loading profile...</p>
          )}
          {error ? <p style={{ color: "#8f2e17" }}>{error}</p> : null}
        </section>
      </div>
    </Shell>
  );
}
