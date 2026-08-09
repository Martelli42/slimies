-- ============================================================================
-- ASCENDANT — server-side game logic
-- ----------------------------------------------------------------------------
-- Everything that mints XP lives here, runs SECURITY DEFINER, and is executable
-- only by the service role. The Next.js route handlers authenticate the session
-- first and then call these with the verified user id, so a client can never
-- award itself XP by calling PostgREST directly.
-- ============================================================================

-- --------------------------------------------------------------- small utils
create or replace function public.app_local_date(p_tz text, p_at timestamptz default now())
returns date language sql stable as $$
  select (p_at at time zone coalesce(nullif(p_tz, ''), 'UTC'))::date;
$$;

create or replace function public.app_notify(
  p_user uuid,
  p_kind public.notification_kind,
  p_title text,
  p_message text,
  p_href text default null,
  p_meta jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into public.notifications (user_id, kind, title, message, href, meta)
  values (p_user, p_kind, p_title, p_message, p_href, coalesce(p_meta, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.app_emit_feed(
  p_user uuid,
  p_kind public.feed_kind,
  p_title text,
  p_detail text default null,
  p_meta jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.feed_events (user_id, kind, title, detail, meta)
  values (p_user, p_kind, p_title, p_detail, coalesce(p_meta, '{}'::jsonb));
end $$;

-- Applies an XP grant to the ledger and the denormalised profile totals.
create or replace function public.app_grant_xp(
  p_user uuid,
  p_source public.xp_source,
  p_source_id uuid,
  p_local_date date,
  p_strength integer,
  p_agility integer,
  p_wisdom integer,
  p_discipline integer,
  p_endurance integer,
  p_player integer
) returns public.profiles language plpgsql security definer set search_path = public as $$
declare v_profile public.profiles;
begin
  if coalesce(p_strength, 0) <> 0 or coalesce(p_agility, 0) <> 0
     or coalesce(p_wisdom, 0) <> 0 or coalesce(p_discipline, 0) <> 0
     or coalesce(p_endurance, 0) <> 0 or coalesce(p_player, 0) <> 0 then
    insert into public.xp_ledger (
      user_id, source, source_id, local_date,
      strength_xp, agility_xp, wisdom_xp, discipline_xp, endurance_xp, player_xp
    ) values (
      p_user, p_source, p_source_id, p_local_date,
      coalesce(p_strength, 0), coalesce(p_agility, 0), coalesce(p_wisdom, 0),
      coalesce(p_discipline, 0), coalesce(p_endurance, 0), coalesce(p_player, 0)
    );
  end if;

  update public.profiles set
    strength_xp   = greatest(0, strength_xp   + coalesce(p_strength, 0)),
    agility_xp    = greatest(0, agility_xp    + coalesce(p_agility, 0)),
    wisdom_xp     = greatest(0, wisdom_xp     + coalesce(p_wisdom, 0)),
    discipline_xp = greatest(0, discipline_xp + coalesce(p_discipline, 0)),
    endurance_xp  = greatest(0, endurance_xp  + coalesce(p_endurance, 0)),
    total_xp      = greatest(0, total_xp      + coalesce(p_player, 0)),
    level         = public.app_level_for_xp(greatest(0, total_xp + coalesce(p_player, 0)))
  where id = p_user
  returning * into v_profile;

  return v_profile;
end $$;

-- ------------------------------------------------------------- achievements
create or replace function public.app_check_achievements(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_unlocked jsonb := '[]'::jsonb;
  v_row record;
  v_profile public.profiles;
  v_friends bigint;
  v_quests  bigint;
begin
  select * into v_profile from public.profiles where id = p_user;
  if not found then return v_unlocked; end if;

  select count(*) into v_friends from public.friendships f
   where f.user_1 = p_user or f.user_2 = p_user;
  select count(*) into v_quests from public.daily_quests d
   where d.user_id = p_user and d.completed;

  for v_row in
    select a.*
      from public.achievements a
     where not exists (
             select 1 from public.user_achievements ua
              where ua.user_id = p_user and ua.achievement_id = a.id)
       and case a.metric
             when 'level'            then v_profile.level         >= a.threshold
             when 'total_xp'         then v_profile.total_xp      >= a.threshold
             when 'strength_xp'      then v_profile.strength_xp   >= a.threshold
             when 'agility_xp'       then v_profile.agility_xp    >= a.threshold
             when 'wisdom_xp'        then v_profile.wisdom_xp     >= a.threshold
             when 'discipline_xp'    then v_profile.discipline_xp >= a.threshold
             when 'endurance_xp'     then v_profile.endurance_xp  >= a.threshold
             when 'current_streak'   then v_profile.current_streak >= a.threshold
             when 'activities_count' then v_profile.activities_count >= a.threshold
             when 'total_minutes'    then v_profile.total_minutes >= a.threshold
             when 'friends_count'    then v_friends >= a.threshold
             when 'quests_completed' then v_quests  >= a.threshold
             when 'activity_type_count' then (
               select count(*) from public.activities act
                where act.user_id = p_user and act.activity_type = a.activity_type
             ) >= a.threshold
             when 'activity_type_minutes' then (
               select coalesce(sum(act.duration_minutes), 0) from public.activities act
                where act.user_id = p_user and act.activity_type = a.activity_type
             ) >= a.threshold
             else false
           end
     order by a.sort_order
  loop
    insert into public.user_achievements (user_id, achievement_id)
    values (p_user, v_row.id)
    on conflict do nothing;

    if v_row.xp_reward > 0 then
      perform public.app_grant_xp(
        p_user, 'achievement', v_row.id,
        public.app_local_date(v_profile.timezone),
        0, 0, 0, 0, 0, v_row.xp_reward);
    end if;

    perform public.app_notify(
      p_user, 'achievement', 'Achievement unlocked',
      v_row.name, '/achievements',
      jsonb_build_object('code', v_row.code, 'icon', v_row.icon));

    perform public.app_emit_feed(
      p_user, 'achievement', v_row.name, v_row.description,
      jsonb_build_object('code', v_row.code, 'icon', v_row.icon));

    v_unlocked := v_unlocked || jsonb_build_object(
      'code', v_row.code, 'name', v_row.name,
      'description', v_row.description, 'icon', v_row.icon,
      'xp_reward', v_row.xp_reward, 'hidden', v_row.hidden);
  end loop;

  return v_unlocked;
end $$;

-- ---------------------------------------------------------------- day quests
-- Creates the day's quest board if it does not exist yet, folding in any
-- custom quests the player has scheduled for that weekday.
create or replace function public.ensure_daily_quests(p_user uuid, p_date date)
returns setof public.daily_quests
language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles;
  v_dow smallint;
  v_goals text[];
  v_physical_title text := 'Move with intent for 30 minutes';
  v_row record;
  v_count integer;
begin
  select * into v_profile from public.profiles where id = p_user;
  if not found then return; end if;

  v_dow := extract(dow from p_date)::smallint;
  v_goals := coalesce(v_profile.goals, '{}');

  if 'stronger' = any(v_goals) then
    v_physical_title := 'Train hard for 30 minutes';
  elsif 'athletic' = any(v_goals) then
    v_physical_title := 'Get 30 minutes of athletic work in';
  elsif 'lose_weight' = any(v_goals) then
    v_physical_title := 'Get 30 minutes of conditioning in';
  end if;

  -- Core three. The unique slot index makes this idempotent.
  insert into public.daily_quests
    (user_id, quest_date, kind, title, description, target, reward, sort_order)
  values
    (p_user, p_date, 'physical_minutes', v_physical_title,
     'Any strength, sport, running or conditioning work counts.',
     30, '{"player": 20}'::jsonb, 1)
  on conflict do nothing;

  insert into public.daily_quests
    (user_id, quest_date, kind, title, description, target, reward, sort_order)
  values
    (p_user, p_date, 'learning_minutes', 'Learn something useful for 20 minutes',
     'Real subjects only — skills, finance, career, science, language.',
     20, '{"wisdom": 15, "player": 8}'::jsonb, 2)
  on conflict do nothing;

  insert into public.daily_quests
    (user_id, quest_date, kind, title, description, target, reward, sort_order)
  values
    (p_user, p_date, 'manual', 'Do the one thing you have been avoiding',
     'Mark it complete once it is genuinely done.',
     1, '{"discipline": 10, "player": 6}'::jsonb, 3)
  on conflict do nothing;

  -- Custom quests scheduled for this date.
  for v_row in
    select * from public.custom_quests c
     where c.user_id = p_user and c.active
       and (
         c.cadence = 'daily'
         or (c.cadence = 'specific_days' and v_dow = any(c.days_of_week))
         or (c.cadence = 'weekly' and v_dow = 1)
         or (c.cadence = 'once' and not exists (
               select 1 from public.daily_quests d
                where d.custom_quest_id = c.id and d.completed))
       )
  loop
    insert into public.daily_quests
      (user_id, quest_date, kind, title, description, target, reward,
       activity_type, attribute, custom_quest_id, sort_order)
    values
      (p_user, p_date,
       case when v_row.activity_type is not null then 'specific_type' else 'activity_minutes' end,
       v_row.title, 'Custom quest',
       v_row.target_minutes,
       jsonb_build_object('player', v_row.xp_reward),
       v_row.activity_type, v_row.attribute, v_row.id, 10)
    on conflict do nothing;
  end loop;

  -- The bonus objective tracks how many of the day's quests are done.
  select count(*) into v_count from public.daily_quests d
   where d.user_id = p_user and d.quest_date = p_date and not d.is_bonus;

  insert into public.daily_quests
    (user_id, quest_date, kind, title, description, target, reward, is_bonus, sort_order)
  values
    (p_user, p_date, 'bonus', 'Clear the board',
     'Complete every objective issued today.',
     v_count, '{"player": 50}'::jsonb, true, 99)
  on conflict do nothing;

  update public.daily_quests d
     set target = v_count
   where d.user_id = p_user and d.quest_date = p_date
     and d.is_bonus and not d.completed and d.target <> v_count;

  return query
    select * from public.daily_quests d
     where d.user_id = p_user and d.quest_date = p_date
     order by d.is_bonus, d.sort_order, d.created_at;
end $$;

-- Marks a quest complete, pays its reward and returns a summary row.
create or replace function public.app_complete_quest(p_quest public.daily_quests)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_reward jsonb := coalesce(p_quest.reward, '{}'::jsonb);
  v_profile public.profiles;
begin
  update public.daily_quests
     set completed = true, completed_at = now(),
         progress = greatest(progress, target)
   where id = p_quest.id and not completed;

  if not found then
    return null;
  end if;

  select * into v_profile from public.profiles where id = p_quest.user_id;

  perform public.app_grant_xp(
    p_quest.user_id,
    case when p_quest.is_bonus then 'quest_bonus'::public.xp_source else 'quest'::public.xp_source end,
    p_quest.id,
    p_quest.quest_date,
    coalesce((v_reward ->> 'strength')::int, 0),
    coalesce((v_reward ->> 'agility')::int, 0),
    coalesce((v_reward ->> 'wisdom')::int, 0),
    coalesce((v_reward ->> 'discipline')::int, 0),
    coalesce((v_reward ->> 'endurance')::int, 0),
    coalesce((v_reward ->> 'player')::int, 0));

  return jsonb_build_object(
    'id', p_quest.id,
    'title', p_quest.title,
    'is_bonus', p_quest.is_bonus,
    'reward', v_reward);
end $$;

-- Advances quest progress after an activity was logged.
create or replace function public.app_progress_quests(
  p_user uuid,
  p_date date,
  p_activity_type text,
  p_duration integer,
  p_award jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_group text;
  v_completed jsonb := '[]'::jsonb;
  v_quest public.daily_quests;
  v_delta integer;
  v_result jsonb;
  v_outstanding integer;
  v_bonus public.daily_quests;
begin
  select activity_group into v_group from public.activity_catalog where code = p_activity_type;

  for v_quest in
    select * from public.daily_quests d
     where d.user_id = p_user and d.quest_date = p_date
       and not d.completed and not d.is_bonus
  loop
    v_delta := case v_quest.kind
      when 'physical_minutes' then case when v_group = 'physical' then p_duration else 0 end
      when 'learning_minutes' then case when v_group = 'mind' then p_duration else 0 end
      when 'activity_minutes' then p_duration
      when 'specific_type'    then case when v_quest.activity_type = p_activity_type then p_duration else 0 end
      when 'activity_count'   then 1
      when 'attribute_xp'     then coalesce((p_award ->> v_quest.attribute::text)::int, 0)
      else 0
    end;

    if v_delta > 0 then
      update public.daily_quests
         set progress = least(target, progress + v_delta)
       where id = v_quest.id
       returning * into v_quest;

      if v_quest.progress >= v_quest.target then
        v_result := public.app_complete_quest(v_quest);
        if v_result is not null then
          v_completed := v_completed || v_result;
        end if;
      end if;
    end if;
  end loop;

  -- Bonus objective: only when nothing else is outstanding.
  select count(*) into v_outstanding from public.daily_quests d
   where d.user_id = p_user and d.quest_date = p_date
     and not d.is_bonus and not d.completed;

  if v_outstanding = 0 then
    select * into v_bonus from public.daily_quests d
     where d.user_id = p_user and d.quest_date = p_date
       and d.is_bonus and not d.completed
     limit 1;

    if found then
      update public.daily_quests set progress = target where id = v_bonus.id
        returning * into v_bonus;
      v_result := public.app_complete_quest(v_bonus);
      if v_result is not null then
        v_completed := v_completed || v_result;
      end if;
    end if;
  else
    update public.daily_quests d
       set progress = (select count(*) from public.daily_quests x
                        where x.user_id = p_user and x.quest_date = p_date
                          and not x.is_bonus and x.completed)
     where d.user_id = p_user and d.quest_date = p_date and d.is_bonus and not d.completed;
  end if;

  return v_completed;
end $$;

-- Manual (checkbox) quests are the only ones a player completes directly.
create or replace function public.complete_manual_quest(p_user uuid, p_quest uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_quest public.daily_quests;
  v_result jsonb;
  v_completed jsonb := '[]'::jsonb;
  v_outstanding integer;
  v_bonus public.daily_quests;
  v_before integer;
  v_profile public.profiles;
begin
  select * into v_quest from public.daily_quests
   where id = p_quest and user_id = p_user;

  if not found then
    raise exception 'quest_not_found' using errcode = 'P0002';
  end if;
  if v_quest.kind <> 'manual' then
    raise exception 'quest_not_manual' using errcode = 'P0001';
  end if;
  if v_quest.completed then
    return jsonb_build_object('already_completed', true);
  end if;

  select level into v_before from public.profiles where id = p_user;

  v_result := public.app_complete_quest(v_quest);
  if v_result is not null then
    v_completed := v_completed || v_result;
  end if;

  select count(*) into v_outstanding from public.daily_quests d
   where d.user_id = p_user and d.quest_date = v_quest.quest_date
     and not d.is_bonus and not d.completed;

  if v_outstanding = 0 then
    select * into v_bonus from public.daily_quests d
     where d.user_id = p_user and d.quest_date = v_quest.quest_date
       and d.is_bonus and not d.completed limit 1;
    if found then
      update public.daily_quests set progress = target where id = v_bonus.id
        returning * into v_bonus;
      v_result := public.app_complete_quest(v_bonus);
      if v_result is not null then
        v_completed := v_completed || v_result;
      end if;
    end if;
  else
    update public.daily_quests d
       set progress = (select count(*) from public.daily_quests x
                        where x.user_id = p_user and x.quest_date = v_quest.quest_date
                          and not x.is_bonus and x.completed)
     where d.user_id = p_user and d.quest_date = v_quest.quest_date
       and d.is_bonus and not d.completed;
  end if;

  select * into v_profile from public.profiles where id = p_user;

  if v_profile.level > v_before then
    perform public.app_notify(p_user, 'level_up', 'Level ' || v_profile.level,
      'You reached level ' || v_profile.level || '.', '/profile',
      jsonb_build_object('level', v_profile.level));
    perform public.app_emit_feed(p_user, 'level_up',
      'Reached level ' || v_profile.level, null,
      jsonb_build_object('level', v_profile.level));
  end if;

  return jsonb_build_object(
    'quests_completed', v_completed,
    'achievements', public.app_check_achievements(p_user),
    'level', v_profile.level,
    'total_xp', v_profile.total_xp);
end $$;

-- ------------------------------------------------------------------- streaks
create or replace function public.app_touch_streak(p_user uuid, p_date date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles;
  v_streak integer;
  v_shield boolean := false;
  v_gap integer;
  v_increased boolean := false;
begin
  select * into v_profile from public.profiles where id = p_user for update;
  if not found then return '{}'::jsonb; end if;

  v_streak := v_profile.current_streak;

  if v_profile.last_active_date is null then
    v_streak := 1;
    v_increased := true;
  elsif p_date = v_profile.last_active_date then
    null; -- already counted today
  elsif p_date < v_profile.last_active_date then
    null; -- backfilled an older day; today's streak is unaffected
  else
    v_gap := p_date - v_profile.last_active_date - 1;
    if v_gap = 0 then
      v_streak := v_streak + 1;
      v_increased := true;
    elsif v_gap = 1 and v_profile.streak_shields > 0 then
      -- A single missed day is absorbed by a shield instead of wiping months.
      v_streak := v_streak + 1;
      v_shield := true;
      v_increased := true;
      update public.profiles set streak_shields = streak_shields - 1 where id = p_user;
    else
      v_streak := 1;
      v_increased := true;
    end if;
  end if;

  if p_date >= coalesce(v_profile.last_active_date, p_date) then
    update public.profiles
       set current_streak = v_streak,
           longest_streak = greatest(longest_streak, v_streak),
           last_active_date = greatest(coalesce(last_active_date, p_date), p_date)
     where id = p_user
     returning * into v_profile;
  end if;

  -- Milestones hand back a shield and a little XP, so consistency compounds.
  if v_increased and v_streak in (3, 7, 14, 30, 50, 100, 365) then
    perform public.app_grant_xp(p_user, 'streak', null, p_date,
      0, 0, 0, least(25, v_streak), 0, least(60, 10 + v_streak));
    update public.profiles
       set streak_shields = least(3, streak_shields + 1) where id = p_user;
    perform public.app_notify(p_user, 'streak', v_streak || ' day streak',
      'Consistency milestone reached.', '/profile',
      jsonb_build_object('streak', v_streak));
    perform public.app_emit_feed(p_user, 'streak',
      'Reached a ' || v_streak || ' day streak', null,
      jsonb_build_object('streak', v_streak));
  end if;

  return jsonb_build_object(
    'current', v_streak,
    'longest', greatest(v_profile.longest_streak, v_streak),
    'increased', v_increased,
    'shield_used', v_shield,
    'shields', (select streak_shields from public.profiles where id = p_user));
end $$;

-- ------------------------------------------------------------ log an activity
create or replace function public.award_activity(
  p_user uuid,
  p_payload jsonb,
  p_award jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles;
  v_after   public.profiles;
  v_tz text;
  v_type text := p_payload ->> 'activity_type';
  v_duration integer := coalesce((p_payload ->> 'duration_minutes')::int, 0);
  v_occurred timestamptz := coalesce((p_payload ->> 'occurred_at')::timestamptz, now());
  v_difficulty public.difficulty_level :=
    coalesce(nullif(p_payload ->> 'difficulty', '')::public.difficulty_level, 'moderate');
  v_local_date date;
  v_max_minutes integer;
  v_last timestamptz;
  v_day_count integer;
  v_str integer; v_agi integer; v_wis integer; v_dsc integer; v_end integer; v_player integer;
  v_day_str integer; v_day_agi integer; v_day_wis integer; v_day_dsc integer;
  v_day_end integer; v_day_player integer;
  v_requested integer;
  v_granted integer;
  v_activity public.activities;
  v_level_before integer;
  v_rank_before text;
  v_streak jsonb;
  v_quests jsonb;
  v_achievements jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));

  select * into v_profile from public.profiles where id = p_user;
  if not found then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  v_tz := coalesce(nullif(p_payload ->> 'timezone', ''), v_profile.timezone, 'UTC');
  v_local_date := public.app_local_date(v_tz, v_occurred);
  v_level_before := v_profile.level;
  v_rank_before := public.app_rank_label(v_profile.level);

  -- ---- validation -----------------------------------------------------
  select max_minutes into v_max_minutes from public.activity_catalog where code = v_type;
  if v_max_minutes is null then
    raise exception 'unknown_activity_type' using errcode = 'P0001';
  end if;
  if v_duration < 1 or v_duration > least(v_max_minutes, 480) then
    raise exception 'invalid_duration' using errcode = 'P0001';
  end if;
  if v_occurred > now() + (public.app_limit('future_skew_minutes') || ' minutes')::interval then
    raise exception 'activity_in_future' using errcode = 'P0001';
  end if;
  if v_occurred < now() - (public.app_limit('max_backdate_days') || ' days')::interval then
    raise exception 'activity_too_old' using errcode = 'P0001';
  end if;

  select max(created_at) into v_last from public.activities where user_id = p_user;
  if v_last is not null
     and v_last > now() - (public.app_limit('min_seconds_between_submissions') || ' seconds')::interval then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  select count(*) into v_day_count from public.activities
   where user_id = p_user and local_date = v_local_date;
  if v_day_count >= public.app_limit('max_activities_per_day') then
    raise exception 'daily_activity_limit' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.activities a
     where a.user_id = p_user
       and tstzrange(a.occurred_at, a.occurred_at + make_interval(mins => a.duration_minutes), '[)')
        && tstzrange(v_occurred, v_occurred + make_interval(mins => v_duration), '[)')
  ) then
    raise exception 'overlapping_activity' using errcode = 'P0001';
  end if;

  -- ---- authoritative clamping ------------------------------------------
  select
    coalesce(sum(strength_xp), 0), coalesce(sum(agility_xp), 0),
    coalesce(sum(wisdom_xp), 0),   coalesce(sum(discipline_xp), 0),
    coalesce(sum(endurance_xp), 0), coalesce(sum(player_xp), 0)
  into v_day_str, v_day_agi, v_day_wis, v_day_dsc, v_day_end, v_day_player
  from public.xp_ledger
  where user_id = p_user and local_date = v_local_date and source = 'activity';

  v_str := public.app_clamp_award((p_award ->> 'strength')::int,   v_day_str,   'daily_cap_strength');
  v_agi := public.app_clamp_award((p_award ->> 'agility')::int,    v_day_agi,   'daily_cap_agility');
  v_wis := public.app_clamp_award((p_award ->> 'wisdom')::int,     v_day_wis,   'daily_cap_wisdom');
  v_dsc := public.app_clamp_award((p_award ->> 'discipline')::int, v_day_dsc,   'daily_cap_discipline');
  v_end := public.app_clamp_award((p_award ->> 'endurance')::int,  v_day_end,   'daily_cap_endurance');

  v_requested := greatest(coalesce((p_award ->> 'player')::int, 0), 0);
  v_player := least(
    v_requested,
    public.app_limit('max_player_xp_per_activity')::int,
    greatest(public.app_limit('daily_player_xp_cap')::int - v_day_player, 0));

  -- ---- persist ----------------------------------------------------------
  insert into public.activities (
    user_id, activity_type, title, description, duration_minutes, difficulty,
    occurred_at, local_date, xp_total, strength_xp, agility_xp, wisdom_xp,
    discipline_xp, endurance_xp, proof_url, classification
  ) values (
    p_user, v_type,
    coalesce(nullif(p_payload ->> 'title', ''), 'Activity'),
    nullif(p_payload ->> 'description', ''),
    v_duration, v_difficulty, v_occurred, v_local_date,
    v_player, v_str, v_agi, v_wis, v_dsc, v_end,
    nullif(p_payload ->> 'proof_url', ''),
    p_payload -> 'classification'
  ) returning * into v_activity;

  v_after := public.app_grant_xp(p_user, 'activity', v_activity.id, v_local_date,
    v_str, v_agi, v_wis, v_dsc, v_end, v_player);

  update public.profiles
     set activities_count = activities_count + 1,
         total_minutes = total_minutes + v_duration
   where id = p_user
   returning * into v_after;

  v_granted := v_str + v_agi + v_wis + v_dsc + v_end;

  perform public.app_emit_feed(p_user, 'activity',
    v_activity.title,
    v_duration || ' min · +' || v_player || ' XP',
    jsonb_build_object('activity_id', v_activity.id, 'activity_type', v_type,
                       'duration', v_duration, 'xp', v_player,
                       'attribute_xp', v_granted));

  -- Only "real" effort keeps a streak alive.
  if v_granted > 0 then
    v_streak := public.app_touch_streak(p_user, v_local_date);
  else
    v_streak := jsonb_build_object(
      'current', v_after.current_streak, 'longest', v_after.longest_streak,
      'increased', false, 'shield_used', false, 'shields', v_after.streak_shields);
  end if;

  v_quests := public.app_progress_quests(p_user, v_local_date, v_type, v_duration, p_award);

  select * into v_after from public.profiles where id = p_user;

  if v_after.level > v_level_before then
    perform public.app_notify(p_user, 'level_up', 'Level ' || v_after.level,
      'You reached level ' || v_after.level || '.', '/profile',
      jsonb_build_object('level', v_after.level));
    perform public.app_emit_feed(p_user, 'level_up',
      'Reached level ' || v_after.level, null,
      jsonb_build_object('level', v_after.level));

    if public.app_rank_label(v_after.level) is distinct from v_rank_before then
      perform public.app_notify(p_user, 'rank_up',
        public.app_rank_label(v_after.level), 'New rank unlocked.', '/profile',
        jsonb_build_object('rank', public.app_rank_label(v_after.level)));
      perform public.app_emit_feed(p_user, 'rank_up',
        'Unlocked ' || public.app_rank_label(v_after.level), null,
        jsonb_build_object('rank', public.app_rank_label(v_after.level)));
    end if;
  end if;

  v_achievements := public.app_check_achievements(p_user);
  select * into v_after from public.profiles where id = p_user;

  return jsonb_build_object(
    'activity', to_jsonb(v_activity),
    'awarded', jsonb_build_object(
      'strength', v_str, 'agility', v_agi, 'wisdom', v_wis,
      'discipline', v_dsc, 'endurance', v_end, 'player', v_player),
    'clamped', (v_player < v_requested),
    'level', jsonb_build_object(
      'before', v_level_before, 'after', v_after.level,
      'total_xp', v_after.total_xp,
      'into_level', v_after.total_xp -
        coalesce((select cumulative_xp from public.level_curve where level = v_after.level), 0),
      'required', public.app_xp_required(v_after.level)),
    'rank', jsonb_build_object(
      'before', v_rank_before, 'after', public.app_rank_label(v_after.level)),
    'streak', v_streak,
    'quests_completed', v_quests,
    'achievements', v_achievements);
end $$;

-- Clamp helper: per-activity ceiling, then whatever the day has left.
create or replace function public.app_clamp_award(
  p_value integer, p_earned_today integer, p_cap_key text)
returns integer language sql stable as $$
  select greatest(0, least(
    greatest(coalesce(p_value, 0), 0),
    public.app_limit('max_attribute_xp_per_activity')::int,
    greatest(public.app_limit(p_cap_key)::int - coalesce(p_earned_today, 0), 0)
  ));
$$;

-- --------------------------------------------------------- delete an activity
create or replace function public.remove_activity(p_user uuid, p_activity uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_activity public.activities;
  v_profile public.profiles;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));

  select * into v_activity from public.activities
   where id = p_activity and user_id = p_user;
  if not found then
    raise exception 'activity_not_found' using errcode = 'P0002';
  end if;

  -- Reverse the exact grant that this activity produced.
  perform public.app_grant_xp(p_user, 'activity', v_activity.id, v_activity.local_date,
    -v_activity.strength_xp, -v_activity.agility_xp, -v_activity.wisdom_xp,
    -v_activity.discipline_xp, -v_activity.endurance_xp, -v_activity.xp_total);

  delete from public.xp_ledger
   where source = 'activity' and source_id = v_activity.id;

  delete from public.feed_events
   where user_id = p_user and kind = 'activity'
     and meta ->> 'activity_id' = v_activity.id::text;

  update public.profiles
     set activities_count = greatest(0, activities_count - 1),
         total_minutes = greatest(0, total_minutes - v_activity.duration_minutes)
   where id = p_user;

  delete from public.activities where id = v_activity.id;

  -- Rebuild the day's quest progress from what is left.
  update public.daily_quests d
     set progress = case d.kind
       when 'physical_minutes' then least(d.target, coalesce((
         select sum(a.duration_minutes) from public.activities a
          join public.activity_catalog c on c.code = a.activity_type
         where a.user_id = p_user and a.local_date = d.quest_date
           and c.activity_group = 'physical'), 0))
       when 'learning_minutes' then least(d.target, coalesce((
         select sum(a.duration_minutes) from public.activities a
          join public.activity_catalog c on c.code = a.activity_type
         where a.user_id = p_user and a.local_date = d.quest_date
           and c.activity_group = 'mind'), 0))
       when 'specific_type' then least(d.target, coalesce((
         select sum(a.duration_minutes) from public.activities a
         where a.user_id = p_user and a.local_date = d.quest_date
           and a.activity_type = d.activity_type), 0))
       when 'activity_minutes' then least(d.target, coalesce((
         select sum(a.duration_minutes) from public.activities a
         where a.user_id = p_user and a.local_date = d.quest_date), 0))
       else d.progress
     end
   where d.user_id = p_user and d.quest_date = v_activity.local_date
     and not d.completed and not d.is_bonus;

  select * into v_profile from public.profiles where id = p_user;

  return jsonb_build_object(
    'removed', v_activity.id,
    'level', v_profile.level,
    'total_xp', v_profile.total_xp);
end $$;

-- ------------------------------------------------------------------- friends
create or replace function public.friend_ids(p_user uuid)
returns table (friend_id uuid) language sql stable security definer set search_path = public as $$
  select case when f.user_1 = p_user then f.user_2 else f.user_1 end
    from public.friendships f
   where f.user_1 = p_user or f.user_2 = p_user;
$$;

create or replace function public.send_friend_request(p_user uuid, p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_target public.profiles;
  v_me public.profiles;
  v_existing public.friend_requests;
  v_a uuid; v_b uuid;
begin
  select * into v_me from public.profiles where id = p_user;
  if not found then raise exception 'profile_not_found' using errcode = 'P0002'; end if;

  select * into v_target from public.profiles
   where upper(friend_code) = upper(trim(p_code))
      or username = lower(trim(p_code));
  if not found then
    raise exception 'player_not_found' using errcode = 'P0002';
  end if;
  if v_target.id = p_user then
    raise exception 'cannot_add_self' using errcode = 'P0001';
  end if;

  v_a := least(p_user, v_target.id);
  v_b := greatest(p_user, v_target.id);
  if exists (select 1 from public.friendships where user_1 = v_a and user_2 = v_b) then
    raise exception 'already_friends' using errcode = 'P0001';
  end if;

  -- If they already invited us, accept instead of creating a mirror request.
  select * into v_existing from public.friend_requests
   where sender_id = v_target.id and receiver_id = p_user and status = 'pending';
  if found then
    return public.respond_friend_request(p_user, v_existing.id, true);
  end if;

  insert into public.friend_requests (sender_id, receiver_id)
  values (p_user, v_target.id)
  on conflict do nothing
  returning * into v_existing;

  if v_existing.id is null then
    raise exception 'request_already_pending' using errcode = 'P0001';
  end if;

  perform public.app_notify(v_target.id, 'friend_request',
    'Friend request', v_me.display_name || ' wants to team up.', '/friends',
    jsonb_build_object('from', v_me.username, 'request_id', v_existing.id));

  return jsonb_build_object(
    'status', 'pending',
    'request_id', v_existing.id,
    'target', jsonb_build_object(
      'username', v_target.username, 'display_name', v_target.display_name,
      'avatar_url', v_target.avatar_url, 'level', v_target.level));
end $$;

create or replace function public.respond_friend_request(
  p_user uuid, p_request uuid, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_request public.friend_requests;
  v_me public.profiles;
  v_a uuid; v_b uuid;
begin
  select * into v_request from public.friend_requests
   where id = p_request and receiver_id = p_user and status = 'pending';
  if not found then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;

  update public.friend_requests
     set status = case when p_accept then 'accepted' else 'declined' end::public.friend_request_status,
         responded_at = now()
   where id = p_request;

  if not p_accept then
    return jsonb_build_object('status', 'declined');
  end if;

  v_a := least(v_request.sender_id, v_request.receiver_id);
  v_b := greatest(v_request.sender_id, v_request.receiver_id);

  insert into public.friendships (user_1, user_2) values (v_a, v_b)
  on conflict do nothing;

  select * into v_me from public.profiles where id = p_user;

  perform public.app_notify(v_request.sender_id, 'friend_accepted',
    'Request accepted', v_me.display_name || ' is now your ally.', '/friends',
    jsonb_build_object('username', v_me.username));

  perform public.app_check_achievements(v_request.sender_id);
  perform public.app_check_achievements(p_user);

  return jsonb_build_object('status', 'accepted', 'friend_id', v_request.sender_id);
end $$;

create or replace function public.remove_friend(p_user uuid, p_friend uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  delete from public.friendships
   where (user_1 = least(p_user, p_friend) and user_2 = greatest(p_user, p_friend));
  delete from public.friend_requests
   where (sender_id = p_user and receiver_id = p_friend)
      or (sender_id = p_friend and receiver_id = p_user);
  return jsonb_build_object('removed', true);
end $$;

-- --------------------------------------------------------------- leaderboards
create or replace function public.leaderboard(
  p_user uuid,
  p_scope text default 'friends',
  p_metric text default 'weekly',
  p_limit integer default 50
) returns table (
  rank_position integer,
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  level integer,
  current_streak integer,
  value bigint,
  movement integer,
  is_self boolean
) language plpgsql stable security definer set search_path = public as $$
declare
  v_tz text;
  v_today date;
  v_start date;
  v_prev_start date;
  v_prev_end date;
begin
  select timezone into v_tz from public.profiles where id = p_user;
  v_today := public.app_local_date(coalesce(v_tz, 'UTC'));

  if p_metric = 'monthly' then
    v_start := date_trunc('month', v_today)::date;
    v_prev_start := (v_start - interval '1 month')::date;
    v_prev_end := v_start - 1;
  else
    -- ISO week, Monday start.
    v_start := (v_today - ((extract(isodow from v_today)::int - 1)))::date;
    v_prev_start := v_start - 7;
    v_prev_end := v_start - 1;
  end if;

  return query
  with candidates as (
    select p.* from public.profiles p
     where p.onboarded
       and (
         p_scope = 'global'
         or p.id = p_user
         or p.id in (select friend_id from public.friend_ids(p_user))
       )
       and (p_scope <> 'global' or coalesce(p.privacy ->> 'leaderboards', 'true') <> 'false')
  ),
  current_period as (
    select l.user_id, sum(l.player_xp)::bigint as xp
      from public.xp_ledger l
     where l.local_date >= v_start and l.local_date <= v_today
     group by l.user_id
  ),
  previous_period as (
    select l.user_id, sum(l.player_xp)::bigint as xp
      from public.xp_ledger l
     where l.local_date >= v_prev_start and l.local_date <= v_prev_end
     group by l.user_id
  ),
  scored as (
    select c.id,
           c.username,
           c.display_name,
           c.avatar_url,
           c.level,
           c.current_streak,
           case p_metric
             when 'weekly'     then coalesce(cur.xp, 0)
             when 'monthly'    then coalesce(cur.xp, 0)
             when 'level'      then c.total_xp
             when 'strength'   then c.strength_xp
             when 'agility'    then c.agility_xp
             when 'wisdom'     then c.wisdom_xp
             when 'discipline' then c.discipline_xp
             when 'endurance'  then c.endurance_xp
             when 'streak'     then c.current_streak::bigint
             else coalesce(cur.xp, 0)
           end as value,
           coalesce(prev.xp, 0) as prev_value
      from candidates c
      left join current_period cur on cur.user_id = c.id
      left join previous_period prev on prev.user_id = c.id
  ),
  ranked as (
    select s.*,
           row_number() over (order by s.value desc, s.level desc, s.username asc) as pos,
           case when p_metric in ('weekly', 'monthly')
                then row_number() over (order by s.prev_value desc, s.level desc, s.username asc)
                else null end as prev_pos
      from scored s
  )
  select r.pos::integer,
         r.id,
         r.username,
         r.display_name,
         r.avatar_url,
         r.level,
         r.current_streak,
         r.value,
         case when r.prev_pos is null then 0 else (r.prev_pos - r.pos)::integer end,
         (r.id = p_user)
    from ranked r
   order by r.pos
   limit greatest(p_limit, 1);
end $$;

-- ---------------------------------------------------------------- friend feed
create or replace function public.friend_feed(p_user uuid, p_limit integer default 30)
returns table (
  id uuid,
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  kind public.feed_kind,
  title text,
  detail text,
  meta jsonb,
  created_at timestamptz
) language sql stable security definer set search_path = public as $$
  select e.id, e.user_id, p.username, p.display_name, p.avatar_url,
         e.kind, e.title, e.detail, e.meta, e.created_at
    from public.feed_events e
    join public.profiles p on p.id = e.user_id
   where e.user_id in (select friend_id from public.friend_ids(p_user))
     and coalesce(p.privacy ->> 'activity', 'true') <> 'false'
     and e.created_at > now() - interval '14 days'
   order by e.created_at desc
   limit greatest(coalesce(p_limit, 30), 1);
$$;

-- ------------------------------------------------------------- public profile
-- Applies the target's privacy settings, so a locked-down profile still
-- resolves but hides its numbers.
create or replace function public.public_profile(p_viewer uuid, p_username text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_target public.profiles;
  v_is_friend boolean;
  v_is_self boolean;
  v_visible boolean;
  v_pending text;
begin
  select * into v_target from public.profiles where username = lower(p_username);
  if not found then return null; end if;

  v_is_self := (v_target.id = p_viewer);
  v_is_friend := exists (
    select 1 from public.friendships f
     where (f.user_1 = least(p_viewer, v_target.id) and f.user_2 = greatest(p_viewer, v_target.id)));

  v_visible := v_is_self or v_is_friend
    or coalesce(v_target.privacy ->> 'profile', 'friends') = 'public';

  select case
           when exists (select 1 from public.friend_requests r
                         where r.sender_id = p_viewer and r.receiver_id = v_target.id
                           and r.status = 'pending') then 'outgoing'
           when exists (select 1 from public.friend_requests r
                         where r.sender_id = v_target.id and r.receiver_id = p_viewer
                           and r.status = 'pending') then 'incoming'
           else null
         end into v_pending;

  return jsonb_build_object(
    'id', v_target.id,
    'username', v_target.username,
    'display_name', v_target.display_name,
    'avatar_url', v_target.avatar_url,
    'bio', v_target.bio,
    'created_at', v_target.created_at,
    'is_self', v_is_self,
    'is_friend', v_is_friend,
    'friend_request', v_pending,
    'visible', v_visible,
    'level', case when v_visible then v_target.level else null end,
    'total_xp', case when v_visible then v_target.total_xp else null end,
    'attributes', case when v_visible then jsonb_build_object(
        'strength', v_target.strength_xp, 'agility', v_target.agility_xp,
        'wisdom', v_target.wisdom_xp, 'discipline', v_target.discipline_xp,
        'endurance', v_target.endurance_xp) else null end,
    'current_streak', case when v_visible then v_target.current_streak else null end,
    'longest_streak', case when v_visible then v_target.longest_streak else null end,
    'activities_count', case when v_visible then v_target.activities_count else null end,
    'achievements', case when v_visible then (
        select count(*) from public.user_achievements ua where ua.user_id = v_target.id)
      else null end,
    'friends', (select count(*) from public.friendships f
                 where f.user_1 = v_target.id or f.user_2 = v_target.id));
end $$;

-- -------------------------------------------------------------- weekly report
create or replace function public.weekly_report(p_user uuid, p_week_start date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_tz text;
  v_today date;
  v_start date;
  v_end date;
  v_profile public.profiles;
  v_sum record;
  v_active integer;
  v_activities integer;
  v_minutes integer;
  v_rank integer;
  v_friend_count integer;
  v_level_start integer;
  v_best text;
  v_worst text;
begin
  select * into v_profile from public.profiles where id = p_user;
  if not found then return null; end if;

  v_tz := coalesce(v_profile.timezone, 'UTC');
  v_today := public.app_local_date(v_tz);
  v_start := coalesce(p_week_start, (v_today - ((extract(isodow from v_today)::int - 1)))::date);
  v_end := v_start + 6;

  select
    coalesce(sum(player_xp), 0)     as player,
    coalesce(sum(strength_xp), 0)   as strength,
    coalesce(sum(agility_xp), 0)    as agility,
    coalesce(sum(wisdom_xp), 0)     as wisdom,
    coalesce(sum(discipline_xp), 0) as discipline,
    coalesce(sum(endurance_xp), 0)  as endurance
  into v_sum
  from public.xp_ledger
  where user_id = p_user and local_date between v_start and v_end;

  select count(distinct local_date) into v_active
    from public.activities
   where user_id = p_user and local_date between v_start and v_end;

  select count(*), coalesce(sum(duration_minutes), 0) into v_activities, v_minutes
    from public.activities
   where user_id = p_user and local_date between v_start and v_end;

  v_level_start := public.app_level_for_xp(greatest(v_profile.total_xp - v_sum.player, 0));

  select lb.rank_position, (select count(*) from public.friend_ids(p_user))
    into v_rank, v_friend_count
    from public.leaderboard(p_user, 'friends', 'weekly', 100) lb
   where lb.is_self;

  select key into v_best from (
    values ('Strength', v_sum.strength), ('Agility', v_sum.agility),
           ('Wisdom', v_sum.wisdom), ('Discipline', v_sum.discipline),
           ('Endurance', v_sum.endurance)
  ) as t(key, val) order by val desc limit 1;

  select key into v_worst from (
    values ('Strength', v_sum.strength), ('Agility', v_sum.agility),
           ('Wisdom', v_sum.wisdom), ('Discipline', v_sum.discipline),
           ('Endurance', v_sum.endurance)
  ) as t(key, val) order by val asc limit 1;

  return jsonb_build_object(
    'week_start', v_start,
    'week_end', v_end,
    'level_start', v_level_start,
    'level_end', v_profile.level,
    'player_xp', v_sum.player,
    'attributes', jsonb_build_object(
      'strength', v_sum.strength, 'agility', v_sum.agility,
      'wisdom', v_sum.wisdom, 'discipline', v_sum.discipline,
      'endurance', v_sum.endurance),
    'active_days', v_active,
    'activities', v_activities,
    'minutes', v_minutes,
    'friend_rank', v_rank,
    'friend_count', v_friend_count,
    'strongest', v_best,
    'weakest', v_worst);
end $$;

-- ---------------------------------------------------------------- onboarding
create or replace function public.complete_onboarding(
  p_user uuid,
  p_username text,
  p_display_name text,
  p_goals text[],
  p_timezone text,
  p_avatar_url text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_username text := lower(trim(coalesce(p_username, '')));
  v_profile public.profiles;
begin
  if v_username !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'invalid_username' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.profiles where username = v_username and id <> p_user) then
    raise exception 'username_taken' using errcode = 'P0001';
  end if;

  update public.profiles
     set username = v_username,
         display_name = coalesce(nullif(trim(p_display_name), ''), display_name),
         goals = coalesce(p_goals, '{}'),
         timezone = coalesce(nullif(p_timezone, ''), 'UTC'),
         avatar_url = coalesce(p_avatar_url, avatar_url),
         friend_code = case
           when friend_code like 'PLAYER-%' or friend_code is null
             then public.generate_friend_code(v_username)
           else friend_code end,
         onboarded = true
   where id = p_user
   returning * into v_profile;

  if not found then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  perform public.ensure_daily_quests(p_user, public.app_local_date(v_profile.timezone));

  return to_jsonb(v_profile);
end $$;

-- ============================================================================
-- Privileges: game logic is server-only.
-- ============================================================================
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.award_activity(uuid, jsonb, jsonb)',
    'public.remove_activity(uuid, uuid)',
    'public.complete_manual_quest(uuid, uuid)',
    'public.ensure_daily_quests(uuid, date)',
    'public.send_friend_request(uuid, text)',
    'public.respond_friend_request(uuid, uuid, boolean)',
    'public.remove_friend(uuid, uuid)',
    'public.complete_onboarding(uuid, text, text, text[], text, text)',
    'public.app_grant_xp(uuid, public.xp_source, uuid, date, integer, integer, integer, integer, integer, integer)',
    'public.app_complete_quest(public.daily_quests)',
    'public.app_progress_quests(uuid, date, text, integer, jsonb)',
    'public.app_check_achievements(uuid)',
    'public.app_touch_streak(uuid, date)',
    'public.app_notify(uuid, public.notification_kind, text, text, text, jsonb)',
    'public.app_emit_feed(uuid, public.feed_kind, text, text, jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;

-- Read-only helpers stay available to signed-in players.
grant execute on function public.leaderboard(uuid, text, text, integer) to authenticated, service_role;
grant execute on function public.friend_feed(uuid, integer) to authenticated, service_role;
grant execute on function public.public_profile(uuid, text) to authenticated, service_role;
grant execute on function public.weekly_report(uuid, date) to authenticated, service_role;
grant execute on function public.friend_ids(uuid) to authenticated, service_role;
