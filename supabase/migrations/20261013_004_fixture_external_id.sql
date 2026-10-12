-- Matches found automatically from the fixture feed (CricAPI) remember the feed's own id, so the same match is never
-- listed twice and a changed start time updates the existing row.
alter table matches add column if not exists external_id text unique;
