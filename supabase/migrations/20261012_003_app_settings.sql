-- A tiny key-value table for app settings (first use: learning_mode = auto | ask).
-- Row Level Security on with no policies: only the server key can read or write, like every other table.
create table app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table app_settings enable row level security;
