-- ---------------------------------------------------------------------------
-- Exercises the game logic against a freshly migrated database.
-- Every check raises on failure, so `psql -v ON_ERROR_STOP=1` fails the build.
-- ---------------------------------------------------------------------------
\set ON_ERROR_STOP on

do $$
declare
  v_user uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_result jsonb;
  v_payload jsonb;
  v_award jsonb;
  v_profile public.profiles;
  v_quest public.daily_quests;
  v_count integer;
  v_request uuid;
  v_anchor timestamptz;
  v_today date;
begin
  -- Anchor every submission to midday of a single UTC day so the assertions
  -- do not straddle a local-date boundary when the suite runs near midnight.
  v_anchor := (date_trunc('day', (now() at time zone 'UTC')) + interval '12 hours')
                at time zone 'UTC';
  if v_anchor > now() - interval '3 hours' then
    v_anchor := v_anchor - interval '1 day';
  end if;
  v_today := public.app_local_date('UTC', v_anchor);
  -- ---------------------------------------------------------------- signup
  insert into auth.users (id, email, raw_user_meta_data)
  values (v_user, 'tester@example.com', '{"display_name": "Tester"}'::jsonb);
  insert into auth.users (id, email, raw_user_meta_data)
  values (v_other, 'rival@example.com', '{"display_name": "Rival"}'::jsonb);

  select * into v_profile from public.profiles where id = v_user;
  assert v_profile.id is not null, 'signup trigger did not create a profile';
  assert v_profile.friend_code ~ '^[A-Z0-9]{3,12}-[A-Z0-9]{4}$',
    'friend code has the wrong shape: ' || v_profile.friend_code;
  assert exists (select 1 from public.user_settings where user_id = v_user),
    'signup trigger did not create settings';

  -- ------------------------------------------------------------ onboarding
  perform public.complete_onboarding(v_user, 'tester', 'Tester',
    array['stronger','learn'], 'UTC', null);
  perform public.complete_onboarding(v_other, 'rival', 'Rival',
    array['athletic'], 'UTC', null);

  select * into v_profile from public.profiles where id = v_user;
  assert v_profile.onboarded, 'onboarding did not flag the profile';
  assert v_profile.username = 'tester', 'username was not applied';

  perform public.ensure_daily_quests(v_user, v_today);
  select count(*) into v_count from public.daily_quests
   where user_id = v_user and quest_date = v_today;
  assert v_count = 4, 'expected 3 quests + bonus, got ' || v_count;

  -- --------------------------------------------------------------- levels
  assert public.app_level_for_xp(0) = 1, 'level floor is wrong';
  assert public.app_level_for_xp(99) = 1, 'level 1 boundary is wrong';
  assert public.app_level_for_xp(100) = 2, 'level 2 boundary is wrong';
  assert public.app_level_for_xp(254) = 2, 'level 3 boundary is wrong';
  assert public.app_level_for_xp(255) = 3, 'level 3 boundary is wrong';
  assert public.app_rank_label(1) = 'Bronze III', 'rank floor is wrong';
  assert public.app_rank_label(17) = 'Gold III', 'rank at level 17 is wrong';
  assert public.app_rank_label(27) = 'Platinum III', 'rank at level 27 is wrong';

  -- ------------------------------------------------------- log an activity
  v_payload := jsonb_build_object(
    'activity_type', 'strength_training',
    'title', 'Chest and triceps',
    'description', 'Bench, incline, dips',
    'duration_minutes', 65,
    'difficulty', 'moderate',
    'occurred_at', v_anchor::text,
    'timezone', 'UTC');
  v_award := jsonb_build_object('strength', 28, 'discipline', 8, 'player', 22);

  v_result := public.award_activity(v_user, v_payload, v_award);
  assert (v_result -> 'awarded' ->> 'strength')::int = 28, 'strength award was altered';
  assert (v_result -> 'awarded' ->> 'player')::int = 22, 'player award was altered';
  assert (v_result -> 'streak' ->> 'current')::int = 1, 'first activity should start a streak';

  select * into v_profile from public.profiles where id = v_user;
  assert v_profile.strength_xp = 28, 'profile strength not updated';
  -- 22 from the activity plus the quest and achievement rewards it triggered.
  assert v_profile.total_xp >= 22, 'profile total xp not updated';
  assert v_profile.total_xp
    = (select coalesce(sum(player_xp), 0) from public.xp_ledger where user_id = v_user),
    'profile total xp disagrees with the ledger';
  assert v_profile.activities_count = 1, 'activity counter not updated';
  assert v_profile.total_minutes = 65, 'minute counter not updated';

  assert exists (select 1 from public.xp_ledger where user_id = v_user and source = 'activity'),
    'ledger row missing';
  assert exists (select 1 from public.feed_events where user_id = v_user and kind = 'activity'),
    'feed event missing';

  -- The physical quest should have completed (65 >= 30) and paid out.
  select * into v_quest from public.daily_quests
   where user_id = v_user and quest_date = v_today and kind = 'physical_minutes';
  assert v_quest.completed, 'physical quest did not complete';
  assert exists (select 1 from public.xp_ledger where user_id = v_user and source = 'quest'),
    'quest reward was not paid';

  -- "First Step" should have unlocked.
  assert exists (
    select 1 from public.user_achievements ua
      join public.achievements a on a.id = ua.achievement_id
     where ua.user_id = v_user and a.code = 'first_step'),
    'first_step achievement did not unlock';

  -- --------------------------------------------------------- anti-cheat
  -- Submitting again immediately is rate limited.
  begin
    perform public.award_activity(v_user,
      jsonb_set(v_payload, '{occurred_at}', to_jsonb((v_anchor + interval '5 hours')::text)),
      v_award);
    raise exception 'rate limit was not enforced';
  exception when sqlstate 'P0001' then
    null;
  end;

  -- Overlapping submission is refused.
  update public.activities set created_at = created_at - interval '10 minutes'
   where user_id = v_user;
  begin
    perform public.award_activity(v_user, v_payload, v_award);
    raise exception 'overlapping activity was accepted';
  exception when sqlstate 'P0001' then
    null;
  end;

  -- A submission in the future is refused.
  update public.activities set created_at = created_at - interval '10 minutes'
   where user_id = v_user;
  begin
    perform public.award_activity(v_user,
      jsonb_set(v_payload, '{occurred_at}', to_jsonb((now() + interval '2 days')::text)),
      v_award);
    raise exception 'future activity was accepted';
  exception when sqlstate 'P0001' then
    null;
  end;

  -- Daily attribute caps clamp an absurd award.
  update public.activities set created_at = created_at - interval '10 minutes'
   where user_id = v_user;

  v_result := public.award_activity(v_user,
    jsonb_build_object(
      'activity_type', 'strength_training', 'title', 'Farm attempt',
      'duration_minutes', 60, 'difficulty', 'moderate',
      'occurred_at', (v_anchor + interval '3 hours')::text, 'timezone', 'UTC'),
    jsonb_build_object('strength', 9999, 'player', 9999));

  -- The per-activity ceiling bites first.
  assert (v_result -> 'awarded' ->> 'strength')::int
    = (select value::int from public.xp_limits where key = 'max_attribute_xp_per_activity'),
    'per-activity strength ceiling was not enforced: ' || (v_result -> 'awarded' ->> 'strength');
  assert (v_result -> 'awarded' ->> 'player')::int
    = (select value::int from public.xp_limits where key = 'max_player_xp_per_activity'),
    'per-activity player cap was not enforced';

  -- A third attempt only gets whatever the day has left (110 - 28 - 60 = 22).
  update public.activities set created_at = created_at - interval '10 minutes'
   where user_id = v_user;
  v_result := public.award_activity(v_user,
    jsonb_build_object(
      'activity_type', 'strength_training', 'title', 'Second farm attempt',
      'duration_minutes', 60, 'difficulty', 'moderate',
      'occurred_at', (v_anchor + interval '6 hours')::text, 'timezone', 'UTC'),
    jsonb_build_object('strength', 9999, 'player', 9999));

  assert (v_result -> 'awarded' ->> 'strength')::int
    = (select value::int - 88 from public.xp_limits where key = 'daily_cap_strength'),
    'daily strength cap was not enforced: ' || (v_result -> 'awarded' ->> 'strength');

  -- And a fourth gets nothing at all.
  update public.activities set created_at = created_at - interval '10 minutes'
   where user_id = v_user;
  v_result := public.award_activity(v_user,
    jsonb_build_object(
      'activity_type', 'strength_training', 'title', 'Third farm attempt',
      'duration_minutes', 60, 'difficulty', 'moderate',
      'occurred_at', (v_anchor + interval '9 hours')::text, 'timezone', 'UTC'),
    jsonb_build_object('strength', 9999, 'player', 9999));
  assert (v_result -> 'awarded' ->> 'strength')::int = 0,
    'daily strength cap leaked XP';

  -- ------------------------------------------------------- manual quests
  select * into v_quest from public.daily_quests
   where user_id = v_user and quest_date = v_today and kind = 'manual';
  v_result := public.complete_manual_quest(v_user, v_quest.id);
  assert jsonb_array_length(v_result -> 'quests_completed') >= 1, 'manual quest did not complete';

  -- ------------------------------------------------------------- friends
  v_result := public.send_friend_request(v_user,
    (select friend_code from public.profiles where id = v_other));
  assert v_result ->> 'status' = 'pending', 'friend request was not created';

  select id into v_request from public.friend_requests
   where sender_id = v_user and receiver_id = v_other;
  v_result := public.respond_friend_request(v_other, v_request, true);
  assert v_result ->> 'status' = 'accepted', 'friend request was not accepted';
  assert exists (select 1 from public.friendships
                  where user_1 = least(v_user, v_other) and user_2 = greatest(v_user, v_other)),
    'friendship row missing';

  -- --------------------------------------------------------- leaderboards
  select count(*) into v_count from public.leaderboard(v_user, 'friends', 'weekly', 50);
  assert v_count = 2, 'friends leaderboard should hold both players, got ' || v_count;

  select count(*) into v_count from public.leaderboard(v_user, 'global', 'level', 50);
  assert v_count >= 6, 'global leaderboard should include the demo cohort, got ' || v_count;

  -- ------------------------------------------------------- public profile
  v_result := public.public_profile(v_other, 'tester');
  assert (v_result ->> 'is_friend')::boolean, 'friends should see each other';

  -- --------------------------------------------------------- weekly report
  -- Anchor the report on the week the test activities actually fall in.
  v_result := public.weekly_report(v_user,
    (v_today - (extract(isodow from v_today)::int - 1))::date);
  assert (v_result ->> 'activities')::int = 4, 'weekly report activity count is wrong';
  assert v_result ->> 'strongest' = 'Strength', 'weekly report strongest attribute is wrong';

  -- ------------------------------------------------------- delete reverses
  perform public.remove_activity(v_user,
    (select id from public.activities where user_id = v_user order by created_at limit 1));

  select * into v_profile from public.profiles where id = v_user;
  assert v_profile.strength_xp
    = (select coalesce(sum(strength_xp), 0) from public.xp_ledger where user_id = v_user),
    'deleting an activity left the ledger and profile out of sync';
  assert v_profile.activities_count = 3, 'activity counter was not decremented';

  raise notice 'all assertions passed';
end $$;

-- The demo cohort must exist and be internally consistent.
do $$
declare v_bad integer;
begin
  select count(*) into v_bad
    from public.profiles p
   where p.username in ('shadowrunner','ironmike','nova','atlas','valkyrie','kestrel')
     and p.total_xp <> (select coalesce(sum(l.player_xp), 0)
                          from public.xp_ledger l where l.user_id = p.id);
  assert v_bad = 0, v_bad || ' demo profiles disagree with their ledger';

  select count(*) into v_bad from public.profiles
   where username in ('shadowrunner','ironmike','nova','atlas','valkyrie','kestrel')
     and level < 2;
  assert v_bad = 0, 'demo players should have levelled up';
end $$;
