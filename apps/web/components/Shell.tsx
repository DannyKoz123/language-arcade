import Link from "next/link";

export function Shell({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="shell">
      <header className="topbar">
        <Link className="brand" href="/">
          Language Arcade
        </Link>
        <nav className="nav">
          <Link href="/play">Play</Link>
          <Link href="/leaderboard">Leaderboard</Link>
          <Link href="/profile">Profile</Link>
        </nav>
      </header>
      {children}
    </div>
  );
}
