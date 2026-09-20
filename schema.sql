-- Kingdom Scheduler — Supabase schema
-- Run this in the Supabase SQL editor before wiring up the app.

create extension if not exists "uuid-ossp";

-- One row per staff member. Owners/managers are staff too, flagged below.
create table if not exists users (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  pin text not null,               -- 4-digit PIN, stored as text ("0192")
  phone text,
  depts jsonb not null default '[]', -- array of department ids the user works in
  is_manager boolean not null default false,
  is_owner boolean not null default false,
  telegram_chat_id text,           -- optional, for per-user Telegram DMs
  created_at timestamptz not null default now()
);

-- Departments are dynamic, owner-managed, each with a display color.
create table if not exists departments (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  color text not null,             -- hex string, e.g. "#a855f7"
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- One row per scheduled shift.
create table if not exists shifts (
  id uuid primary key default uuid_generate_v4(),
  date date not null,
  dept_id uuid references departments(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  start_time text,                 -- "22:00" or null if on_call
  end_time text,                   -- "CLOSE" is a valid literal value
  on_call boolean not null default false,
  published boolean not null default false,
  created_at timestamptz not null default now()
);

-- Availability submissions, one row per user per show day.
create table if not exists availability (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete cascade,
  date date not null,
  available boolean not null default true,
  all_day boolean not null default true,
  from_time text,
  until_time text,
  notes text,
  submitted_at timestamptz not null default now(),
  unique (user_id, date)
);

-- Shift swap / giveup postings.
create table if not exists giveup_requests (
  id uuid primary key default uuid_generate_v4(),
  shift_id uuid references shifts(id) on delete cascade,
  from_user_id uuid references users(id),
  note text,
  status text not null default 'open', -- open | claimed | cancelled
  claimed_by uuid references users(id),
  created_at timestamptz not null default now()
);

-- Time off requests.
create table if not exists time_off_requests (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  reason text,
  status text not null default 'pending', -- pending | approved | denied
  created_at timestamptz not null default now()
);

-- Generic notification log (mirrors what was sent to Telegram, for in-app history).
create table if not exists notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id),
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- Small key/value table for global app state: show days, doors/close times, etc.
create table if not exists app_state (
  key text primary key,
  value jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- Seed the two keys the app reads on load.
insert into app_state (key, value) values
  ('show_days', '[]'),
  ('doors_close', '{}')
on conflict (key) do nothing;

-- Seed default departments (safe to skip if you already added your own).
insert into departments (name, color, sort_order) values
  ('Box Office', '#a855f7', 0),
  ('Security', '#3b82f6', 1),
  ('Lighting Director', '#eab308', 2),
  ('Bartender', '#f97316', 3),
  ('Barback', '#22c55e', 4)
on conflict do nothing;

-- Seed one owner account so you can log in the first time. CHANGE THE PIN.
insert into users (name, pin, depts, is_manager, is_owner) values
  ('Owner', '1234', '[]', true, true)
on conflict do nothing;
