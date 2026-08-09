-- ============================================================================
-- ASCENDANT — core schema
-- ----------------------------------------------------------------------------
-- Design rules enforced here:
--   * Progression columns are never writable by an end user. Clients get SELECT
--     on their own rows; every mutation that touches XP goes through a
--     SECURITY DEFINER function called by the server with the service role.
--   * Row Level Security is on for every table that holds user data.
--   * XP is denormalised onto `profiles` for fast reads, but `xp_ledger` is the
--     append-only source of truth used by leaderboards and reports.
-- ============================================================================

-- ---------------------------------------------------------------- enum types
do $$ begin
  create type public.attribute_key as enum
    ('strength', 'agility', 'wisdom', 'discipline', 'endurance');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.difficulty_level as enum
    ('easy', 'moderate', 'hard', 'extreme');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.friend_request_status as enum
    ('pending', 'accepted', 'declined', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.quest_cadence as enum
    ('daily', 'weekly', 'specific_days', 'once');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.xp_source as enum
    ('activity', 'quest', 'quest_bonus', 'achievement', 'streak');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.notification_kind as enum
    ('quest', 'friend_request', 'friend_accepted', 'level_up', 'rank_up',
     'achievement', 'streak', 'leaderboard', 'weekly_report', 'system');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.feed_kind as enum
    ('activity', 'level_up', 'rank_up', 'achievement', 'streak');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------------ profiles
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  username      text not null,
  display_name  text not null,
  avatar_url    text,
  friend_code   text not null,
  bio           text,
  timezone      text not null default 'UTC',
  goals         text[] not null default '{}',

  level         integer not null default 1,
  total_xp      bigint  not null default 0,
  strength_xp   bigint  not null default 0,
  agility_xp    bigint  not null default 0,
  wisdom_xp     bigint  not null default 0,
  discipline_xp bigint  not null default 0,
  endurance_xp  bigint  not null default 0,

  current_streak   integer not null default 0,
  longest_streak   integer not null default 0,
  last_active_date date,
  streak_shields   integer not null default 1,

  activities_count integer not null default 0,
  total_minutes    integer not null default 0,

  onboarded  boolean not null default false,
  -- Controls what other players may see. Enforced by the feed / profile RPCs.
  privacy    jsonb not null default
    '{"profile": "friends", "activity": true, "stats": true, "leaderboards": true}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_username_format
    check (username ~ '^[a-z0-9_]{3,20}$'),
  constraint profiles_display_name_length
    check (char_length(display_name) between 1 and 40),
  constraint profiles_friend_code_format
    check (friend_code ~ '^[A-Z0-9]{3,12}-[A-Z0-9]{4}$')
);

create unique index if not exists profiles_username_key on public.profiles (username);
create unique index if not exists profiles_friend_code_key on public.profiles (friend_code);
create index if not exists profiles_level_idx on public.profiles (level desc);
create index if not exists profiles_total_xp_idx on public.profiles (total_xp desc);

-- ------------------------------------------------------------- user settings
-- Private, owner-only rows. Kept out of `profiles` so profiles can stay
-- readable by other players without leaking preferences.
create table if not exists public.user_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  notify_daily_quests    boolean not null default true,
  notify_streak_risk     boolean not null default true,
  notify_friend_activity boolean not null default true,
  notify_leaderboard     boolean not null default true,
  notify_achievements    boolean not null default true,
  notify_weekly_report   boolean not null default true,
  quiet_hours_start smallint,
  quiet_hours_end   smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- activities
create table if not exists public.activities (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  activity_type text not null,
  title         text not null,
  description   text,
  duration_minutes integer not null check (duration_minutes between 1 and 480),
  difficulty    public.difficulty_level not null default 'moderate',
  occurred_at   timestamptz not null,
  local_date    date not null,

  xp_total      integer not null default 0,
  strength_xp   integer not null default 0,
  agility_xp    integer not null default 0,
  wisdom_xp     integer not null default 0,
  discipline_xp integer not null default 0,
  endurance_xp  integer not null default 0,

  proof_url      text,
  classification jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists activities_user_time_idx
  on public.activities (user_id, occurred_at desc);
create index if not exists activities_user_local_date_idx
  on public.activities (user_id, local_date);
create index if not exists activities_type_idx
  on public.activities (user_id, activity_type);

-- ----------------------------------------------------------------- xp ledger
-- Append-only record of every XP grant. Leaderboards, weekly reports and the
-- daily caps all read from here rather than trusting the denormalised totals.
create table if not exists public.xp_ledger (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  source     public.xp_source not null,
  source_id  uuid,
  player_xp     integer not null default 0,
  strength_xp   integer not null default 0,
  agility_xp    integer not null default 0,
  wisdom_xp     integer not null default 0,
  discipline_xp integer not null default 0,
  endurance_xp  integer not null default 0,
  -- The player's *local* day, so daily caps and streaks follow their clock.
  local_date date not null,
  created_at timestamptz not null default now()
);

create index if not exists xp_ledger_user_date_idx
  on public.xp_ledger (user_id, local_date);
create index if not exists xp_ledger_source_idx
  on public.xp_ledger (source, source_id);

-- --------------------------------------------------------------- feed events
create table if not exists public.feed_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       public.feed_kind not null,
  title      text not null,
  detail     text,
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists feed_events_user_idx
  on public.feed_events (user_id, created_at desc);
create index if not exists feed_events_created_idx
  on public.feed_events (created_at desc);

-- -------------------------------------------------------------- custom quests
create table if not exists public.custom_quests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  title       text not null check (char_length(title) between 2 and 60),
  activity_type text,
  attribute   public.attribute_key,
  target_minutes integer not null default 20 check (target_minutes between 5 and 240),
  cadence     public.quest_cadence not null default 'daily',
  -- 0 = Sunday .. 6 = Saturday, used when cadence = 'specific_days'
  days_of_week smallint[] not null default '{}',
  xp_reward   integer not null default 10,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists custom_quests_user_idx
  on public.custom_quests (user_id) where active;

-- --------------------------------------------------------------- daily quests
create table if not exists public.daily_quests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  quest_date  date not null,
  -- physical_minutes | learning_minutes | attribute_xp | activity_count
  -- | specific_type | manual | bonus
  kind        text not null,
  title       text not null,
  description text,
  attribute   public.attribute_key,
  activity_type text,
  target      integer not null default 1,
  progress    integer not null default 0,
  reward      jsonb not null default '{}'::jsonb,
  completed   boolean not null default false,
  completed_at timestamptz,
  is_bonus    boolean not null default false,
  custom_quest_id uuid references public.custom_quests (id) on delete cascade,
  sort_order  smallint not null default 0,
  -- Identity of the quest within a day, derived by trigger so that regenerating
  -- the board is idempotent. Enum/uuid casts are not immutable, so this cannot
  -- be an expression index.
  slot        text not null default '',
  created_at  timestamptz not null default now()
);

create unique index if not exists daily_quests_unique_slot
  on public.daily_quests (user_id, quest_date, slot);
create index if not exists daily_quests_user_date_idx
  on public.daily_quests (user_id, quest_date);

-- --------------------------------------------------------------- achievements
create table if not exists public.achievements (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  description text not null,
  icon        text not null default 'medal',
  -- level | total_xp | <attribute>_xp | current_streak | activities_count
  -- | total_minutes | activity_type_count | quests_completed | friends_count
  metric      text not null,
  threshold   bigint not null,
  activity_type text,
  xp_reward   integer not null default 0,
  hidden      boolean not null default false,
  sort_order  smallint not null default 0
);

create table if not exists public.user_achievements (
  user_id        uuid not null references public.profiles (id) on delete cascade,
  achievement_id uuid not null references public.achievements (id) on delete cascade,
  unlocked_at    timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

create index if not exists user_achievements_user_idx
  on public.user_achievements (user_id, unlocked_at desc);

-- ------------------------------------------------------------------- friends
create table if not exists public.friend_requests (
  id          uuid primary key default gen_random_uuid(),
  sender_id   uuid not null references public.profiles (id) on delete cascade,
  receiver_id uuid not null references public.profiles (id) on delete cascade,
  status      public.friend_request_status not null default 'pending',
  created_at  timestamptz not null default now(),
  responded_at timestamptz,
  constraint friend_requests_not_self check (sender_id <> receiver_id)
);

create unique index if not exists friend_requests_pending_unique
  on public.friend_requests (sender_id, receiver_id) where status = 'pending';
create index if not exists friend_requests_receiver_idx
  on public.friend_requests (receiver_id, status);

create table if not exists public.friendships (
  id      uuid primary key default gen_random_uuid(),
  user_1  uuid not null references public.profiles (id) on delete cascade,
  user_2  uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Pairs are stored with the smaller uuid first so the unique index works.
  constraint friendships_ordered check (user_1 < user_2)
);

create unique index if not exists friendships_pair_unique
  on public.friendships (user_1, user_2);
create index if not exists friendships_user_2_idx on public.friendships (user_2);

-- ------------------------------------------------------------- notifications
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       public.notification_kind not null,
  title      text not null,
  message    text not null,
  href       text,
  meta       jsonb not null default '{}'::jsonb,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx
  on public.notifications (user_id) where not read;

create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

-- ============================================================================
-- Triggers
-- ============================================================================

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists user_settings_touch on public.user_settings;
create trigger user_settings_touch before update on public.user_settings
  for each row execute function public.touch_updated_at();

drop trigger if exists custom_quests_touch on public.custom_quests;
create trigger custom_quests_touch before update on public.custom_quests
  for each row execute function public.touch_updated_at();

-- Players may edit their profile, but never their progression.
create or replace function public.guard_profile_progression()
returns trigger language plpgsql as $$
begin
  -- Only end-user sessions are restricted; SECURITY DEFINER functions and the
  -- service role run as another role and are trusted.
  if current_user <> 'authenticated' then
    return new;
  end if;

  if new.level            is distinct from old.level
     or new.total_xp      is distinct from old.total_xp
     or new.strength_xp   is distinct from old.strength_xp
     or new.agility_xp    is distinct from old.agility_xp
     or new.wisdom_xp     is distinct from old.wisdom_xp
     or new.discipline_xp is distinct from old.discipline_xp
     or new.endurance_xp  is distinct from old.endurance_xp
     or new.current_streak is distinct from old.current_streak
     or new.longest_streak is distinct from old.longest_streak
     or new.streak_shields is distinct from old.streak_shields
     or new.activities_count is distinct from old.activities_count
     or new.total_minutes  is distinct from old.total_minutes
     or new.friend_code    is distinct from old.friend_code
     or new.last_active_date is distinct from old.last_active_date then
    raise exception 'Progression fields are server-controlled'
      using errcode = '42501';
  end if;

  return new;
end $$;

drop trigger if exists profiles_guard_progression on public.profiles;
create trigger profiles_guard_progression before update on public.profiles
  for each row execute function public.guard_profile_progression();

create or replace function public.derive_quest_slot()
returns trigger language plpgsql as $$
begin
  new.slot := new.kind
    || ':' || coalesce(new.attribute::text, '')
    || ':' || coalesce(new.activity_type, '')
    || ':' || coalesce(new.custom_quest_id::text, '');
  return new;
end $$;

drop trigger if exists daily_quests_slot on public.daily_quests;
create trigger daily_quests_slot before insert or update on public.daily_quests
  for each row execute function public.derive_quest_slot();

-- Custom quest rewards are derived, never supplied by the client.
create or replace function public.derive_custom_quest_reward()
returns trigger language plpgsql as $$
begin
  -- Roughly a third of what the same minutes would earn as an activity, so
  -- custom quests are a nudge rather than an XP faucet.
  new.xp_reward := greatest(5, least(30, round(new.target_minutes * 0.25)::int));
  return new;
end $$;

drop trigger if exists custom_quests_reward on public.custom_quests;
create trigger custom_quests_reward before insert or update on public.custom_quests
  for each row execute function public.derive_custom_quest_reward();

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.profiles           enable row level security;
alter table public.user_settings      enable row level security;
alter table public.activities         enable row level security;
alter table public.xp_ledger          enable row level security;
alter table public.feed_events        enable row level security;
alter table public.custom_quests      enable row level security;
alter table public.daily_quests       enable row level security;
alter table public.achievements       enable row level security;
alter table public.user_achievements  enable row level security;
alter table public.friend_requests    enable row level security;
alter table public.friendships        enable row level security;
alter table public.notifications      enable row level security;
alter table public.push_subscriptions enable row level security;

-- profiles: readable by any signed-in player (the app filters by privacy),
-- writable only by their owner and only for cosmetic fields.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- user_settings: strictly private.
drop policy if exists user_settings_all_own on public.user_settings;
create policy user_settings_all_own on public.user_settings
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- activities: owners read their own history. Friends see activity through the
-- feed RPC, which applies privacy settings. No client writes at all.
drop policy if exists activities_select_own on public.activities;
create policy activities_select_own on public.activities
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists xp_ledger_select_own on public.xp_ledger;
create policy xp_ledger_select_own on public.xp_ledger
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists feed_events_select_own on public.feed_events;
create policy feed_events_select_own on public.feed_events
  for select to authenticated using (auth.uid() = user_id);

-- custom quests: fully owned by the player (the reward is derived by trigger).
drop policy if exists custom_quests_all_own on public.custom_quests;
create policy custom_quests_all_own on public.custom_quests
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- daily quests: read-only for players; progress is server-side.
drop policy if exists daily_quests_select_own on public.daily_quests;
create policy daily_quests_select_own on public.daily_quests
  for select to authenticated using (auth.uid() = user_id);

-- achievement catalogue is public reference data.
drop policy if exists achievements_select on public.achievements;
create policy achievements_select on public.achievements
  for select to authenticated using (true);

drop policy if exists user_achievements_select on public.user_achievements;
create policy user_achievements_select on public.user_achievements
  for select to authenticated using (true);

-- friend requests: visible to both sides; cancelling is the only client write.
drop policy if exists friend_requests_select on public.friend_requests;
create policy friend_requests_select on public.friend_requests
  for select to authenticated
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

drop policy if exists friendships_select on public.friendships;
create policy friendships_select on public.friendships
  for select to authenticated
  using (auth.uid() = user_1 or auth.uid() = user_2);

-- notifications: read + mark-as-read by their owner.
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications
  for delete to authenticated using (auth.uid() = user_id);

-- push subscriptions: private to their owner.
drop policy if exists push_subscriptions_all_own on public.push_subscriptions;
create policy push_subscriptions_all_own on public.push_subscriptions
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================================
-- New user bootstrap
-- ============================================================================

-- Friend codes look like NOVA-7F92: a readable stem plus four random chars.
create or replace function public.generate_friend_code(p_seed text)
returns text language plpgsql as $$
declare
  v_stem text;
  v_code text;
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
begin
  v_stem := upper(regexp_replace(coalesce(p_seed, ''), '[^a-zA-Z0-9]', '', 'g'));
  v_stem := substr(v_stem, 1, 8);
  if char_length(v_stem) < 3 then
    v_stem := 'PLAYER';
  end if;

  for attempt in 1..50 loop
    v_code := v_stem || '-';
    for i in 1..4 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * char_length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles p where p.friend_code = v_code);
  end loop;

  return v_code;
end $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_username text;
  v_display  text;
  v_suffix   text;
begin
  v_suffix := substr(replace(new.id::text, '-', ''), 1, 8);
  v_username := lower(coalesce(new.raw_user_meta_data ->> 'username', ''));
  v_username := regexp_replace(v_username, '[^a-z0-9_]', '', 'g');

  if char_length(v_username) < 3
     or exists (select 1 from public.profiles p where p.username = v_username) then
    v_username := 'player_' || v_suffix;
  end if;

  v_display := coalesce(
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Player'
  );
  v_display := substr(v_display, 1, 40);

  insert into public.profiles (id, username, display_name, friend_code)
  values (new.id, v_username, v_display, public.generate_friend_code(v_display))
  on conflict (id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
