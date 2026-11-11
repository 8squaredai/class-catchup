-- Already applied to project nendnnxipxsnispborob (version 20261111052752).
-- Class Catch-up: lecture transcripts -> Claude summaries -> WhatsApp for absent students
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  professor text,
  created_at timestamptz not null default now()
);

create table public.lectures (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  title text not null,
  lecture_date date not null,
  audio_path text,
  status text not null default 'created'
    check (status in ('created','uploaded','transcribing','transcribed','summarizing','summarized','sent','error')),
  error text,
  duration_s numeric,
  created_at timestamptz not null default now()
);
create index lectures_course_date_idx on public.lectures (course_id, lecture_date desc);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  whatsapp text not null unique,           -- E.164 with whatsapp: prefix, e.g. whatsapp:+12125551234
  name text,
  consent_at timestamptz,
  opted_out_at timestamptz,
  current_lecture_id uuid references public.lectures(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.absences (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  reason text,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index absences_course_dates_idx on public.absences (course_id, start_date, end_date);
create index absences_student_idx on public.absences (student_id);

create table public.segments (
  id bigint generated always as identity primary key,
  lecture_id uuid not null references public.lectures(id) on delete cascade,
  idx int not null,
  start_s numeric not null,
  end_s numeric not null,
  speaker text,
  text text not null,
  unique (lecture_id, idx)
);

create table public.summaries (
  lecture_id uuid primary key references public.lectures(id) on delete cascade,
  share_token uuid not null unique default gen_random_uuid(),
  markdown text not null,
  whatsapp_text text not null,
  model text,
  input_tokens int,
  output_tokens int,
  created_at timestamptz not null default now()
);

create table public.messages (
  id bigint generated always as identity primary key,
  student_id uuid references public.students(id) on delete cascade,
  lecture_id uuid references public.lectures(id) on delete set null,
  direction text not null check (direction in ('in','out')),
  kind text not null check (kind in ('command','question','answer','summary','system')),
  body text not null,
  twilio_sid text,
  status text,
  error text,
  created_at timestamptz not null default now()
);
create index messages_student_created_idx on public.messages (student_id, created_at desc);
create index messages_lecture_idx on public.messages (lecture_id);

-- All access goes through the server with the secret key. RLS on + no policies = no access for anon/authenticated.
alter table public.courses   enable row level security;
alter table public.lectures  enable row level security;
alter table public.students  enable row level security;
alter table public.absences  enable row level security;
alter table public.segments  enable row level security;
alter table public.summaries enable row level security;
alter table public.messages  enable row level security;

-- Private bucket for lecture recordings (uploaded via server-issued signed URLs)
insert into storage.buckets (id, name, public, file_size_limit)
values ('lectures', 'lectures', false, 52428800)
on conflict (id) do nothing;

-- Seed one course so the demo works out of the box (edit in the dashboard)
insert into public.courses (code, name, professor)
values ('BA101', 'Marketing Analytics', 'Prof. Rivera')
on conflict (code) do nothing;
