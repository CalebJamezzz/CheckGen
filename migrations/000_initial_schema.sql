-- 000_initial_schema.sql
-- Full schema for bootstrapping a fresh CheckGen database (dev or new prod).
-- Run this in the Supabase SQL editor on a brand new project.
-- ----------------------------------------------------------------

-- ── Extensions ──────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── profiles ────────────────────────────────────────────────────
create table profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  name           text,
  organization   text,
  workspace_id   uuid,
  created_at     timestamptz default now()
);

-- ── workspaces ──────────────────────────────────────────────────
create table workspaces (
  id           uuid primary key default uuid_generate_v4(),
  name         text not null,
  owner_id     uuid references auth.users(id) on delete cascade,
  invite_code  text unique,
  created_at   timestamptz default now()
);

-- ── workspace_members ───────────────────────────────────────────
create table workspace_members (
  id            uuid primary key default uuid_generate_v4(),
  workspace_id  uuid references workspaces(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete cascade,
  role          text default 'member',
  created_at    timestamptz default now(),
  unique(workspace_id, user_id)
);

-- ── workspace_invites ───────────────────────────────────────────
create table workspace_invites (
  id            uuid primary key default uuid_generate_v4(),
  workspace_id  uuid references workspaces(id) on delete cascade,
  email         text,
  token         text unique default uuid_generate_v4()::text,
  created_at    timestamptz default now()
);

-- ── checklist_sessions ──────────────────────────────────────────
create table checklist_sessions (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid references auth.users(id) on delete cascade,
  code          text,
  ticket_id     text,
  name          text,
  environment   text,
  ticket_ac     text,
  ac            text,   -- separate acceptance criteria field (added in 001)
  items         jsonb,
  created_by    text,
  session_type  text default 'personal',
  status        text default 'in_progress',
  workspace_id  uuid,
  share_code    text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ── workspace_member_details (view) ─────────────────────────────
create view workspace_member_details as
  select
    wm.workspace_id,
    wm.user_id,
    wm.role,
    p.name,
    u.email
  from workspace_members wm
  join auth.users u on u.id = wm.user_id
  left join profiles p on p.id = wm.user_id;

-- ── Row Level Security ───────────────────────────────────────────
alter table profiles            enable row level security;
alter table workspaces          enable row level security;
alter table workspace_members   enable row level security;
alter table workspace_invites   enable row level security;
alter table checklist_sessions  enable row level security;

-- profiles
create policy "Users manage own profile"
  on profiles for all using (auth.uid() = id);

-- workspaces
create policy "Owners manage workspace"
  on workspaces for all using (auth.uid() = owner_id);
create policy "Members read workspace"
  on workspaces for select using (
    exists (select 1 from workspace_members where workspace_id = workspaces.id and user_id = auth.uid())
  );

-- workspace_members
create policy "Members read their workspace roster"
  on workspace_members for select using (
    workspace_id in (select workspace_id from workspace_members where user_id = auth.uid())
  );
create policy "Admins manage members"
  on workspace_members for all using (
    workspace_id in (select workspace_id from workspace_members where user_id = auth.uid() and role = 'admin')
  );
create policy "Users join workspace themselves"
  on workspace_members for insert with check (user_id = auth.uid());

-- workspace_invites
create policy "Admins manage invites"
  on workspace_invites for all using (
    workspace_id in (select workspace_id from workspace_members where user_id = auth.uid() and role = 'admin')
  );
create policy "Anyone can read invite by token"
  on workspace_invites for select using (true);

-- checklist_sessions
create policy "Users manage own sessions"
  on checklist_sessions for all using (user_id = auth.uid());
create policy "Anyone can read shared session by code"
  on checklist_sessions for select using (code is not null);
