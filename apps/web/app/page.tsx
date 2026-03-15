import Link from "next/link";

import { Shell } from "../components/Shell";

export default function HomePage() {
  return (
    <Shell>
      <div className="hero">
        <section className="card hero-main">
          <div className="eyebrow">Commercial-safe launch plan, now implemented</div>
          <h1 className="headline">An arcade language game with a real backend from round one.</h1>
          <p className="lede">
            The browser no longer decides what happened. Runs, rounds, hints, scores, and
            leaderboard entries all come from the API, with a content layer designed to swap
            synthetic demo clips for FLEURS-backed production assets later.
          </p>
          <div className="actions">
            <Link className="button-primary" href="/play">
              Enter Arcade
            </Link>
            <Link className="button-secondary" href="/leaderboard">
              View Leaderboard
            </Link>
          </div>
        </section>
        <aside className="card hero-side">
          <div className="stat-grid">
            <div className="stat">
              <strong>12</strong>
              <span>round server-authoritative run</span>
            </div>
            <div className="stat">
              <strong>48</strong>
              <span>demo languages in the seeded roster</span>
            </div>
            <div className="stat">
              <strong>3</strong>
              <span>lives before the run ends</span>
            </div>
            <div className="stat">
              <strong>2</strong>
              <span>scored hints with backend logging</span>
            </div>
          </div>
          <div className="sidebar-card">
            <h3 style={{ marginTop: 0 }}>Why this build is different</h3>
            <p className="lede" style={{ marginTop: 0 }}>
              The original Great Language Game proved the concept. This implementation starts with
              the pieces it struggled to sustain: content versioning, a real API, database-backed
              runs, and an admin path for publishing or disabling clips without redeploying.
            </p>
          </div>
        </aside>
      </div>
    </Shell>
  );
}
