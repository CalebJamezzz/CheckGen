-- 002_add_view_token.sql
-- Adds view_token to checklist_sessions for public read-only share links.
-- Run in Supabase SQL editor.

alter table checklist_sessions
  add column if not exists view_token text;

-- Allow anyone (including anon) to read a session by its view_token
create policy "Public view token access"
  on checklist_sessions for select
  using (view_token is not null);
