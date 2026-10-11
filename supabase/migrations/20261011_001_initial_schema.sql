-- Milestone 2.1: initial schema. Source: docs/ARCHITECTURE.md section 4.
-- Additions beyond the document: player_match_lines, ingestion_runs, player_phase_stats.discipline,
-- and a data_origin label on computed/seeded tables.
-- Row Level Security is ON for every table with NO policies: only the server (secret key) can read or write.

-- ---------- Reference data ----------
create table leagues (
  id bigint generated always as identity primary key,
  name text not null unique,
  gender text not null check (gender in ('male', 'female')),
  tier text
);

create table teams (
  id bigint generated always as identity primary key,
  name text not null,
  league_id bigint not null references leagues (id),
  unique (name, league_id)
);

create table venues (
  id bigint generated always as identity primary key,
  name text not null,
  city text,
  boundary_notes text,
  is_manual boolean not null default false,
  unique (name, city)
);

create table players (
  id bigint generated always as identity primary key,
  cricsheet_id text unique,
  cricinfo_id text,
  name text not null,
  team_id bigint references teams (id),
  role text check (role in ('WK', 'BAT', 'AR', 'BOWL')),
  batting_hand text check (batting_hand in ('left', 'right')),
  bowling_type text,
  source_flags jsonb not null default '{}'
);

-- Manual values always win over scraped ones.
create table manual_overrides (
  id bigint generated always as identity primary key,
  entity_type text not null,
  entity_id bigint not null,
  field text not null,
  value text,
  note text,
  updated_at timestamptz not null default now()
);

-- ---------- Matches ----------
create table matches (
  id bigint generated always as identity primary key,
  league_id bigint not null references leagues (id),
  venue_id bigint references venues (id),
  team_a bigint not null references teams (id),
  team_b bigint not null references teams (id),
  start_time timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'completed', 'abandoned')),
  toss_winner bigint references teams (id),
  toss_decision text check (toss_decision in ('bat', 'field')),
  cricsheet_match_id text unique,
  data_origin text not null default 'ingested' check (data_origin in ('ingested', 'seeded', 'computed', 'manual'))
);

create table squads (
  match_id bigint not null references matches (id) on delete cascade,
  team_id bigint not null references teams (id),
  player_id bigint not null references players (id),
  primary key (match_id, player_id)
);

-- Predicted until the confirmed XI replaces it.
create table predicted_xi (
  match_id bigint not null references matches (id) on delete cascade,
  team_id bigint not null references teams (id),
  player_id bigint not null references players (id),
  batting_pos_guess int,
  source text not null check (source in ('predicted', 'confirmed')),
  confidence numeric check (confidence between 0 and 1),
  primary key (match_id, player_id)
);

create table match_context (
  match_id bigint primary key references matches (id) on delete cascade,
  weather_json jsonb,
  pitch_report_text text,
  pitch_tags_json jsonb,
  fetched_at timestamptz not null default now()
);

create table credits (
  match_id bigint not null references matches (id) on delete cascade,
  player_id bigint not null references players (id),
  credits numeric not null,
  source text not null default 'manual',
  primary key (match_id, player_id)
);

-- ---------- Statistics (all labelled with where they came from) ----------
create table player_match_lines (
  match_id bigint not null references matches (id) on delete cascade,
  player_id bigint not null references players (id),
  team_id bigint references teams (id),
  stats_json jsonb not null, -- same shape as PlayerMatchStats in src/lib/scorePlayerMatch.ts
  phases_json jsonb,         -- per-phase balls/runs/wickets for bat and bowl
  data_origin text not null default 'ingested' check (data_origin in ('ingested', 'seeded', 'computed', 'manual')),
  primary key (match_id, player_id)
);

create table player_stats (
  player_id bigint not null references players (id),
  format text not null,
  bat_avg numeric,
  bat_sr numeric,
  bowl_econ numeric,
  bowl_sr numeric,
  snapshot_date date not null,
  data_origin text not null default 'computed' check (data_origin in ('ingested', 'seeded', 'computed', 'manual')),
  primary key (player_id, format, snapshot_date)
);

create table player_phase_stats (
  player_id bigint not null references players (id),
  discipline text not null check (discipline in ('bat', 'bowl')),
  phase text not null check (phase in ('powerplay', 'middle', 'death')),
  balls int not null default 0,
  runs int not null default 0,
  wickets int not null default 0,
  dismissals int not null default 0,
  data_origin text not null default 'computed' check (data_origin in ('ingested', 'seeded', 'computed', 'manual')),
  primary key (player_id, discipline, phase)
);

create table player_vs_player (
  batter_id bigint not null references players (id),
  bowler_id bigint not null references players (id),
  balls int not null default 0,
  runs int not null default 0,
  dismissals int not null default 0,
  boundaries int not null default 0,
  data_origin text not null default 'computed' check (data_origin in ('ingested', 'seeded', 'computed', 'manual')),
  primary key (batter_id, bowler_id)
);

create table venue_stats (
  venue_id bigint primary key references venues (id),
  first_inn_avg numeric,
  second_inn_avg numeric,
  boundary_pct numeric,
  spin_econ numeric,
  pace_econ numeric,
  chase_win_pct numeric,
  sample int not null default 0,
  data_origin text not null default 'computed' check (data_origin in ('ingested', 'seeded', 'computed', 'manual'))
);

create table team_form (
  team_id bigint not null references teams (id),
  as_of date not null,
  form_index numeric,
  inputs_json jsonb,
  data_origin text not null default 'computed' check (data_origin in ('ingested', 'seeded', 'computed', 'manual')),
  primary key (team_id, as_of)
);

-- ---------- Rubric, recommendations, learning loop ----------
create table rubric_versions (
  id bigint generated always as identity primary key,
  parent_id bigint references rubric_versions (id),
  config_json jsonb not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'retired')),
  reason text,
  created_at timestamptz not null default now()
);

create table recommendations (
  id bigint generated always as identity primary key,
  match_id bigint not null references matches (id),
  rubric_version_id bigint not null references rubric_versions (id),
  stage text not null check (stage in ('provisional', 'final')),
  captain_id bigint references players (id),
  vc_id bigint references players (id),
  created_at timestamptz not null default now()
);

create table recommendation_players (
  recommendation_id bigint not null references recommendations (id) on delete cascade,
  player_id bigint not null references players (id),
  slot text not null check (slot in ('starter', 'backup')),
  rank int,
  expected_points numeric,
  factors_json jsonb,
  reason_text text,
  primary key (recommendation_id, player_id)
);

create table user_teams (
  match_id bigint primary key references matches (id),
  players_json jsonb not null,
  captain_id bigint references players (id),
  vc_id bigint references players (id),
  confirmed_at timestamptz
);

create table actual_points (
  match_id bigint not null references matches (id),
  player_id bigint not null references players (id),
  points numeric not null,
  entered_by text,
  entered_at timestamptz not null default now(),
  source text not null check (source in ('dream11_manual', 'computed_from_scorecard')),
  primary key (match_id, player_id, source)
);

create table calibration_runs (
  id bigint generated always as identity primary key,
  rubric_version_id bigint not null references rubric_versions (id),
  metrics_json jsonb not null,
  created_at timestamptz not null default now()
);

create table pending_adjustments (
  id bigint generated always as identity primary key,
  rubric_version_id bigint not null references rubric_versions (id),
  parameter text not null,
  old_value numeric,
  new_value numeric,
  evidence_json jsonb,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected'))
);

-- ---------- Data freshness log ----------
create table ingestion_runs (
  id bigint generated always as identity primary key,
  source text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'ok', 'failed')),
  rows_written int,
  notes text
);

-- ---------- Lock every table: no public access, server-side secret key only ----------
alter table leagues enable row level security;
alter table teams enable row level security;
alter table venues enable row level security;
alter table players enable row level security;
alter table manual_overrides enable row level security;
alter table matches enable row level security;
alter table squads enable row level security;
alter table predicted_xi enable row level security;
alter table match_context enable row level security;
alter table credits enable row level security;
alter table player_match_lines enable row level security;
alter table player_stats enable row level security;
alter table player_phase_stats enable row level security;
alter table player_vs_player enable row level security;
alter table venue_stats enable row level security;
alter table team_form enable row level security;
alter table rubric_versions enable row level security;
alter table recommendations enable row level security;
alter table recommendation_players enable row level security;
alter table user_teams enable row level security;
alter table actual_points enable row level security;
alter table calibration_runs enable row level security;
alter table pending_adjustments enable row level security;
alter table ingestion_runs enable row level security;
