create table if not exists public.blisko_profiles (
  id text primary key,
  name text not null,
  age integer not null check (age >= 18),
  city text not null,
  distance text not null default 'рядом с вами',
  bio text not null default '',
  tags jsonb not null default '[]'::jsonb,
  image text not null default '',
  gender text not null default 'female' check (gender in ('male', 'female')),
  interested_in text not null default 'all' check (interested_in in ('male', 'female', 'all')),
  online boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.blisko_user_state (
  user_id text primary key,
  likes jsonb not null default '[]'::jsonb,
  skips jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.blisko_messages (
  id uuid primary key,
  user_id text not null,
  profile_id text not null,
  sender text not null,
  text text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.blisko_notifications (
  id uuid primary key,
  user_id text not null,
  type text not null,
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.blisko_profiles enable row level security;
alter table public.blisko_user_state enable row level security;
alter table public.blisko_messages enable row level security;
alter table public.blisko_notifications enable row level security;

create index if not exists blisko_messages_user_profile_idx
  on public.blisko_messages(user_id, profile_id, created_at);
create index if not exists blisko_notifications_user_created_idx
  on public.blisko_notifications(user_id, created_at desc);

alter table public.blisko_profiles add column if not exists gender text not null default 'female';
alter table public.blisko_profiles add column if not exists interested_in text not null default 'all';
