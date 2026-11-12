-- Which summary template the professor picked, plus add-ons and an optional note.
alter table public.summaries
  add column if not exists template text not null default 'standard',
  add column if not exists options jsonb not null default '{}'::jsonb;
