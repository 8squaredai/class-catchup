-- Official course codes + term, and the Term B 2026-27 BAAI courses.
-- `code` stays the short code students type in the chat bot ("absent AIML").
alter table public.courses
  add column if not exists official_code text,
  add column if not exists term text;

insert into public.courses (code, name, professor, official_code, term) values
  ('AIML',    'AI and Machine Learning',                       'Rahul Lath',          'SEP26-TB2627-BAAI-3-13_S1',          'Academic Year 26-27 · Term B'),
  ('APDM',    'Analytics, Problem Solving & Decision Making',  'Javier Aguera',       'SEP26-TB2627-MNGT-3-13_S1',          'Academic Year 26-27 · Term B'),
  ('STRAT',   'Business Strategy in the AI World',             'Andrea Monge',        'SEP26-TB2627-BAAI-3-16_S1',          'Academic Year 26-27 · Term B'),
  ('DATAVIZ', 'Data Visualization and Storytelling',           'Jose Carlos Sanchez', 'SEP26-TB2627-BAAI-1.5-11_S1',        'Academic Year 26-27 · Term B'),
  ('POWERBI', 'PowerBI Certification',                         'Greta Brauer',        'SEP26-TB2627-BAAI-0-10_S1',          'Academic Year 26-27 · Term B'),
  ('SQL',     'SQL and Data Architectures',                    'Carlos Vivas',        'SEP26-TB2627-BAAI-3-12_S1',          'Academic Year 26-27 · Term B'),
  ('CAREER',  'T&C – BAAI Career Accelerator I',               null,                  'SEP26-TP2627-TCR-BAAI-CAI-0-1_S1',   'Academic Year 26-27 · Term B')
on conflict (code) do update set
  name = excluded.name, professor = excluded.professor, official_code = excluded.official_code, term = excluded.term;
