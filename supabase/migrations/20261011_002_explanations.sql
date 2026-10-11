-- Milestone 4.1: room for what the explanation layer needs.
-- captain_scores_json: every selected player's captain score, so "why the runner-up lost" can be explained from numbers.
-- engine_notes_json: death-slot log, notes, validation result, factors the model could not use.
-- captain_reason / vc_reason / summary_text: written by Gemini from those numbers, or by a plain template if Gemini fails.
alter table recommendations
  add column captain_scores_json jsonb,
  add column engine_notes_json jsonb,
  add column captain_reason text,
  add column vc_reason text,
  add column summary_text text;
