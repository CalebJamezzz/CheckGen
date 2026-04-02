-- 001_add_ac_column.sql
-- Adds a separate acceptance criteria column to checklist_sessions.
-- Run in the Supabase SQL editor (prod and any future dev projects).
-- ----------------------------------------------------------------

alter table checklist_sessions
  add column if not exists ac text;
