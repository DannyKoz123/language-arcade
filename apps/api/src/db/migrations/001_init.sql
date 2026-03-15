create extension if not exists "pgcrypto";

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  display_name text,
  is_guest boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists guest_sessions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  session_token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists leaderboard_seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  started_at timestamptz not null,
  ends_at timestamptz
);

create table if not exists content_versions (
  id uuid primary key default gen_random_uuid(),
  version_name text not null unique,
  notes text,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists languages (
  id uuid primary key default gen_random_uuid(),
  iso_code text not null unique,
  common_name text not null,
  native_name text not null,
  family jsonb not null default '[]'::jsonb,
  region text not null,
  main_countries jsonb not null default '[]'::jsonb,
  enabled boolean not null default false,
  content_version_id uuid not null references content_versions(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists clips (
  id uuid primary key,
  language_iso_code text not null references languages(iso_code) on delete cascade,
  preview_url text not null,
  full_url text not null,
  preview_duration_ms integer not null,
  full_duration_ms integer not null,
  speaker_id text not null,
  transcript text not null default '',
  review_status text not null check (review_status in ('approved', 'pending', 'rejected')),
  content_version_id uuid not null references content_versions(id) on delete cascade,
  active boolean not null default true,
  checksum text not null,
  source_dataset text not null,
  created_at timestamptz not null default now()
);

create table if not exists clip_reviews (
  id uuid primary key default gen_random_uuid(),
  clip_id uuid not null references clips(id) on delete cascade,
  reviewer text not null,
  status text not null check (status in ('approved', 'pending', 'rejected')),
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists confusion_edges (
  id uuid primary key default gen_random_uuid(),
  source_iso_code text not null references languages(iso_code) on delete cascade,
  target_iso_code text not null references languages(iso_code) on delete cascade,
  weight real not null,
  source text not null,
  created_at timestamptz not null default now(),
  unique (source_iso_code, target_iso_code)
);

create table if not exists runs (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  status text not null check (status in ('active', 'completed', 'abandoned')),
  score integer not null default 0,
  streak integer not null default 0,
  lives_remaining integer not null default 3,
  current_round_number integer not null default 0,
  completed_rounds integer not null default 0,
  season_id uuid not null references leaderboard_seasons(id),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists run_rounds (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs(id) on delete cascade,
  round_number integer not null,
  language_iso_code text not null references languages(iso_code),
  clip_id uuid not null references clips(id),
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  options jsonb not null,
  hint_types jsonb not null default '[]'::jsonb,
  family_region_used boolean not null default false,
  longer_clip_used boolean not null default false,
  started_at timestamptz not null default now(),
  answered_at timestamptz,
  answer_iso_code text,
  correct boolean,
  score_delta jsonb,
  unique (run_id, round_number)
);

create table if not exists game_events (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete set null,
  run_id uuid references runs(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_runs_player_id on runs(player_id);
create index if not exists idx_runs_status_score on runs(status, score desc);
create index if not exists idx_run_rounds_run_id on run_rounds(run_id);
create index if not exists idx_game_events_event_type on game_events(event_type);
