-- ============================================================================
-- Achievement catalogue.
-- `metric` + `threshold` are evaluated by public.app_check_achievements().
-- Hidden achievements are not listed until unlocked.
-- ============================================================================

insert into public.achievements
  (code, name, description, icon, metric, threshold, activity_type, xp_reward, hidden, sort_order)
values
  -- first steps -------------------------------------------------------------
  ('first_step', 'First Step', 'Log your first activity.', 'flag', 'activities_count', 1, null, 10, false, 10),
  ('getting_started', 'Momentum', 'Log 10 activities.', 'flag', 'activities_count', 10, null, 20, false, 11),
  ('committed', 'Committed', 'Log 100 activities.', 'flag', 'activities_count', 100, null, 60, false, 12),
  ('relentless', 'Relentless', 'Log 500 activities.', 'flag', 'activities_count', 500, null, 150, false, 13),

  -- levels ------------------------------------------------------------------
  ('level_5', 'Awakened', 'Reach level 5.', 'chevron', 'level', 5, null, 15, false, 20),
  ('level_10', 'Ascending', 'Reach level 10.', 'chevron', 'level', 10, null, 25, false, 21),
  ('level_25', 'Proven', 'Reach level 25.', 'chevron', 'level', 25, null, 50, false, 22),
  ('level_50', 'Formidable', 'Reach level 50.', 'chevron', 'level', 50, null, 100, false, 23),
  ('centurion', 'Centurion', 'Reach level 100.', 'crown', 'level', 100, null, 250, false, 24),

  -- strength ----------------------------------------------------------------
  ('getting_stronger', 'Getting Stronger', 'Complete 10 strength workouts.', 'dumbbell', 'activity_type_count', 10, 'strength_training', 20, false, 30),
  ('iron_habit', 'Iron Habit', 'Complete 50 strength workouts.', 'dumbbell', 'activity_type_count', 50, 'strength_training', 60, false, 31),
  ('strength_1000', 'Forged', 'Earn 1,000 Strength XP.', 'dumbbell', 'strength_xp', 1000, null, 40, false, 32),
  ('strength_5000', 'Unbreakable', 'Earn 5,000 Strength XP.', 'dumbbell', 'strength_xp', 5000, null, 120, false, 33),

  -- agility -----------------------------------------------------------------
  ('road_runner', 'Road Runner', 'Log 20 running sessions.', 'run', 'activity_type_count', 20, 'running', 30, false, 40),
  ('agility_1000', 'Quicksilver', 'Earn 1,000 Agility XP.', 'run', 'agility_xp', 1000, null, 40, false, 41),
  ('court_regular', 'Court Regular', 'Log 25 sport sessions.', 'ball', 'activity_type_count', 25, 'sport', 40, false, 42),

  -- wisdom ------------------------------------------------------------------
  ('scholar', 'Scholar', 'Earn 1,000 Wisdom XP.', 'book', 'wisdom_xp', 1000, null, 40, false, 50),
  ('polymath', 'Polymath', 'Earn 5,000 Wisdom XP.', 'book', 'wisdom_xp', 5000, null, 120, false, 51),
  ('capital', 'Capital', 'Log 15 finance education sessions.', 'chart', 'activity_type_count', 15, 'finance_education', 35, false, 52),
  ('engineer', 'Engineer', 'Log 25 programming sessions.', 'code', 'activity_type_count', 25, 'programming', 40, false, 53),

  -- discipline & endurance ---------------------------------------------------
  ('discipline_1000', 'Self Governed', 'Earn 1,000 Discipline XP.', 'shield', 'discipline_xp', 1000, null, 40, false, 60),
  ('endurance_1000', 'Long Haul', 'Earn 1,000 Endurance XP.', 'wave', 'endurance_xp', 1000, null, 40, false, 61),
  ('ten_hours', 'Ten Hours Deep', 'Log 600 minutes of training.', 'clock', 'total_minutes', 600, null, 25, false, 62),
  ('hundred_hours', 'Hundred Hours', 'Log 6,000 minutes of training.', 'clock', 'total_minutes', 6000, null, 90, false, 63),

  -- streaks ------------------------------------------------------------------
  ('streak_3', 'Warming Up', 'Reach a 3 day streak.', 'flame', 'current_streak', 3, null, 10, false, 70),
  ('streak_7', 'One Week Strong', 'Reach a 7 day streak.', 'flame', 'current_streak', 7, null, 20, false, 71),
  ('streak_14', 'Fortnight', 'Reach a 14 day streak.', 'flame', 'current_streak', 14, null, 30, false, 72),
  ('consistent', 'Consistent', 'Reach a 30 day streak.', 'flame', 'current_streak', 30, null, 60, false, 73),
  ('unwavering', 'Unwavering', 'Reach a 100 day streak.', 'flame', 'current_streak', 100, null, 150, false, 74),
  ('year_one', 'Year One', 'Reach a 365 day streak.', 'flame', 'current_streak', 365, null, 400, false, 75),

  -- social -------------------------------------------------------------------
  ('first_ally', 'First Ally', 'Add your first friend.', 'users', 'friends_count', 1, null, 10, false, 80),
  ('squad', 'Squad', 'Build a party of 5 friends.', 'users', 'friends_count', 5, null, 25, false, 81),

  -- quests -------------------------------------------------------------------
  ('quest_10', 'Objective Driven', 'Complete 10 quests.', 'target', 'quests_completed', 10, null, 20, false, 90),
  ('quest_100', 'Quest Machine', 'Complete 100 quests.', 'target', 'quests_completed', 100, null, 70, false, 91),

  -- hidden -------------------------------------------------------------------
  ('night_owl', 'Ghost Protocol', 'Accumulate 2,000 Discipline XP without anyone noticing.', 'moon', 'discipline_xp', 2000, null, 50, true, 100),
  ('marathoner', 'Distance Demon', 'Log 1,000 minutes of running.', 'run', 'activity_type_minutes', 1000, 'running', 60, true, 101),
  ('renaissance', 'Renaissance', 'Reach 2,000 XP in every single attribute.', 'star', 'total_xp', 20000, null, 120, true, 102),
  ('mountain_mover', 'Mountain Mover', 'Log 30 hikes.', 'mountain', 'activity_type_count', 30, 'hiking', 60, true, 103)
on conflict (code) do update set
  name        = excluded.name,
  description = excluded.description,
  icon        = excluded.icon,
  metric      = excluded.metric,
  threshold   = excluded.threshold,
  activity_type = excluded.activity_type,
  xp_reward   = excluded.xp_reward,
  hidden      = excluded.hidden,
  sort_order  = excluded.sort_order;
