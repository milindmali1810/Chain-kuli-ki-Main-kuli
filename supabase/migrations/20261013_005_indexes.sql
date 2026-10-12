-- Indexes for the foreign keys the app actually filters or joins on (Supabase's performance advisor listed 26 without one).
-- Harmless on the small tables; they keep lookups fast as match history grows.
create index if not exists matches_team_a_idx on matches (team_a);
create index if not exists matches_team_b_idx on matches (team_b);
create index if not exists matches_league_start_idx on matches (league_id, start_time desc);
create index if not exists matches_venue_idx on matches (venue_id);
create index if not exists recommendations_match_idx on recommendations (match_id);
create index if not exists recommendations_rubric_idx on recommendations (rubric_version_id);
create index if not exists player_match_lines_player_idx on player_match_lines (player_id);
create index if not exists player_match_lines_team_idx on player_match_lines (team_id);
create index if not exists actual_points_player_idx on actual_points (player_id);
create index if not exists predicted_xi_player_idx on predicted_xi (player_id);
create index if not exists predicted_xi_team_idx on predicted_xi (team_id);
create index if not exists credits_player_idx on credits (player_id);
create index if not exists recommendation_players_player_idx on recommendation_players (player_id);
create index if not exists teams_league_idx on teams (league_id);
