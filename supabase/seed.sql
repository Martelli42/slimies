-- ============================================================================
-- Demo data.
--
-- Creates six rival players with a month of plausible history so the
-- leaderboards, feed and profile pages have something to render during
-- development. Safe to run more than once.
--
-- All demo accounts share the password:  ascendant-demo
--
-- After creating your own account, run this to line them up against you:
--   select public.demo_befriend('your_username');
-- ============================================================================

do $$
declare
  v_users constant jsonb := jsonb_build_array(
    jsonb_build_object('username', 'shadowrunner', 'name', 'Shadow Runner', 'bias', 'agility',    'intensity', 1.00),
    jsonb_build_object('username', 'ironmike',     'name', 'Iron Mike',     'bias', 'strength',   'intensity', 0.92),
    jsonb_build_object('username', 'nova',         'name', 'Nova',          'bias', 'wisdom',     'intensity', 0.85),
    jsonb_build_object('username', 'atlas',        'name', 'Atlas',         'bias', 'endurance',  'intensity', 0.78),
    jsonb_build_object('username', 'valkyrie',     'name', 'Valkyrie',      'bias', 'discipline', 'intensity', 0.70),
    jsonb_build_object('username', 'kestrel',      'name', 'Kestrel',       'bias', 'agility',    'intensity', 0.55)
  );
  v_user jsonb;
  v_id uuid;
  v_email text;
  v_bias text;
  v_intensity numeric;
  v_day integer;
  v_date date;
  v_type text;
  v_minutes integer;
  v_str integer; v_agi integer; v_wis integer; v_dsc integer; v_end integer; v_player integer;
  v_activity uuid;
  v_streak integer;
  v_seed integer;
begin
  for v_user in select * from jsonb_array_elements(v_users) loop
    v_email := (v_user ->> 'username') || '@demo.ascendant.app';
    v_bias := v_user ->> 'bias';
    v_intensity := (v_user ->> 'intensity')::numeric;

    select id into v_id from auth.users where email = v_email;

    if v_id is null then
      v_id := gen_random_uuid();
      insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                              email_confirmed_at, raw_user_meta_data, created_at, updated_at)
      values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
              v_email, crypt('ascendant-demo', gen_salt('bf')), now(),
              jsonb_build_object('username', v_user ->> 'username',
                                 'display_name', v_user ->> 'name'),
              now() - interval '45 days', now());
    end if;

    -- GoTrue needs an identity row for password sign-in on newer versions.
    if to_regclass('auth.identities') is not null then
      execute format(
        'insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
         select %L::uuid, %L::uuid, %L::jsonb, ''email'', %L, now(), now(), now()
         where not exists (select 1 from auth.identities where user_id = %L::uuid and provider = ''email'')',
        gen_random_uuid(), v_id,
        jsonb_build_object('sub', v_id::text, 'email', v_email)::text, v_id::text, v_id);
    end if;

    update public.profiles
       set username = v_user ->> 'username',
           display_name = v_user ->> 'name',
           onboarded = true,
           timezone = 'UTC',
           bio = 'Demo account — here to make the leaderboard interesting.',
           privacy = '{"profile": "public", "activity": true, "stats": true, "leaderboards": true}'::jsonb,
           friend_code = case when friend_code like 'PLAYER-%'
                              then public.generate_friend_code(v_user ->> 'username')
                              else friend_code end,
           created_at = now() - interval '45 days'
     where id = v_id;

    -- Wipe any previous demo history so re-running stays consistent.
    delete from public.xp_ledger where user_id = v_id;
    delete from public.feed_events where user_id = v_id;
    delete from public.activities where user_id = v_id;

    v_streak := 0;

    for v_day in reverse 29..0 loop
      v_date := (current_date - v_day);
      -- Deterministic pseudo-randomness: same demo data on every machine.
      v_seed := (abs(hashtext((v_user ->> 'username') || v_day::text)) % 100);

      if v_seed > (v_intensity * 100)::int then
        v_streak := 0;
        continue;
      end if;

      v_streak := v_streak + 1;

      v_type := case
        when v_bias = 'strength'   and v_seed % 3 = 0 then 'strength_training'
        when v_bias = 'strength'   then case when v_seed % 2 = 0 then 'calisthenics' else 'strength_training' end
        when v_bias = 'agility'    and v_seed % 3 = 0 then 'sport'
        when v_bias = 'agility'    then 'running'
        when v_bias = 'wisdom'     and v_seed % 3 = 0 then 'programming'
        when v_bias = 'wisdom'     then 'finance_education'
        when v_bias = 'endurance'  and v_seed % 3 = 0 then 'cycling'
        when v_bias = 'endurance'  then 'hiking'
        else case when v_seed % 2 = 0 then 'meditation' else 'deep_work' end
      end;

      v_minutes := 30 + (v_seed % 5) * 12;

      select
        round(c.rate_strength   * least(v_minutes, 60))::int,
        round(c.rate_agility    * least(v_minutes, 60))::int,
        round(c.rate_wisdom     * least(v_minutes, 60))::int,
        round(c.rate_discipline * least(v_minutes, 60))::int,
        round(c.rate_endurance  * least(v_minutes, 60))::int
      into v_str, v_agi, v_wis, v_dsc, v_end
      from public.activity_catalog c where c.code = v_type;

      v_player := round((v_str + v_agi + v_wis + v_dsc + v_end) * 0.6)::int;

      insert into public.activities (
        user_id, activity_type, title, description, duration_minutes, difficulty,
        occurred_at, local_date, xp_total, strength_xp, agility_xp, wisdom_xp,
        discipline_xp, endurance_xp)
      select v_id, v_type, c.label, 'Demo session', v_minutes, 'moderate',
             (v_date + time '18:00') at time zone 'UTC', v_date,
             v_player, v_str, v_agi, v_wis, v_dsc, v_end
      from public.activity_catalog c where c.code = v_type
      returning id into v_activity;

      insert into public.xp_ledger (user_id, source, source_id, local_date,
        strength_xp, agility_xp, wisdom_xp, discipline_xp, endurance_xp, player_xp)
      values (v_id, 'activity', v_activity, v_date,
        v_str, v_agi, v_wis, v_dsc, v_end, v_player);

      insert into public.feed_events (user_id, kind, title, detail, meta, created_at)
      select v_id, 'activity', c.label,
             v_minutes || ' min · +' || v_player || ' XP',
             jsonb_build_object('activity_id', v_activity, 'activity_type', v_type,
                                'duration', v_minutes, 'xp', v_player),
             (v_date + time '18:00') at time zone 'UTC'
      from public.activity_catalog c where c.code = v_type;
    end loop;

    -- Fold the generated history into the denormalised profile columns.
    update public.profiles p
       set strength_xp   = coalesce(l.strength, 0),
           agility_xp    = coalesce(l.agility, 0),
           wisdom_xp     = coalesce(l.wisdom, 0),
           discipline_xp = coalesce(l.discipline, 0),
           endurance_xp  = coalesce(l.endurance, 0),
           total_xp      = coalesce(l.player, 0),
           level         = public.app_level_for_xp(coalesce(l.player, 0)),
           activities_count = coalesce(a.count, 0),
           total_minutes = coalesce(a.minutes, 0),
           current_streak = v_streak,
           longest_streak = greatest(v_streak, 12),
           last_active_date = current_date
      from (select
              sum(strength_xp) strength, sum(agility_xp) agility, sum(wisdom_xp) wisdom,
              sum(discipline_xp) discipline, sum(endurance_xp) endurance, sum(player_xp) player
            from public.xp_ledger where user_id = v_id) l,
           (select count(*) count, coalesce(sum(duration_minutes), 0) minutes
            from public.activities where user_id = v_id) a
     where p.id = v_id;
  end loop;

  -- Everyone in the demo cohort knows everyone else.
  insert into public.friendships (user_1, user_2)
  select least(a.id, b.id), greatest(a.id, b.id)
    from public.profiles a
    join public.profiles b on a.id < b.id
   where a.username in ('shadowrunner','ironmike','nova','atlas','valkyrie','kestrel')
     and b.username in ('shadowrunner','ironmike','nova','atlas','valkyrie','kestrel')
  on conflict do nothing;

  -- A few unlocked achievements so the badge grid is not empty.
  insert into public.user_achievements (user_id, achievement_id)
  select p.id, ac.id
    from public.profiles p
    cross join public.achievements ac
   where p.username in ('shadowrunner','ironmike','nova','atlas','valkyrie','kestrel')
     and ac.code in ('first_step','getting_started','level_5','streak_3','streak_7')
  on conflict do nothing;
end $$;

-- Convenience helper for local development: befriend the whole demo cohort.
create or replace function public.demo_befriend(p_username text)
returns integer language plpgsql as $$
declare
  v_id uuid;
  v_count integer;
begin
  select id into v_id from public.profiles where username = lower(p_username);
  if v_id is null then
    raise exception 'No profile called %', p_username;
  end if;

  insert into public.friendships (user_1, user_2)
  select least(v_id, d.id), greatest(v_id, d.id)
    from public.profiles d
   where d.username in ('shadowrunner','ironmike','nova','atlas','valkyrie','kestrel')
     and d.id <> v_id
  on conflict do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end $$;
