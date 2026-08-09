/**
 * Renders the parts of the schema that are *derived* from TypeScript constants
 * into `supabase/migrations/0002_generated.sql`.
 *
 * The XP curve, the anti-farming limits, the activity catalogue and the rank
 * ladder all have exactly one definition — the TypeScript one — and the
 * database gets a generated copy so its functions can enforce the same rules
 * inside a transaction. Re-run with `npm run db:generate` after changing any of
 * them, and `npm run db:verify` will fail loudly if the checked-in SQL is stale.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ACTIVITY_TYPES } from "../src/lib/activities";
import { ATTRIBUTE_KEYS } from "../src/lib/constants";
import { levelCurveRows, MAX_TABLE_LEVEL } from "../src/lib/leveling";
import { RANK_LADDER, RANK_TIERS } from "../src/lib/ranks";
import {
  DAILY_ATTRIBUTE_CAP,
  DAILY_PLAYER_XP_CAP,
  MAX_ACTIVITIES_PER_DAY,
  MAX_ATTRIBUTE_XP_PER_ACTIVITY,
  MAX_BACKDATE_DAYS,
  MAX_PLAYER_XP_PER_ACTIVITY,
  FUTURE_SKEW_MINUTES,
  MIN_SECONDS_BETWEEN_SUBMISSIONS,
} from "../src/lib/xp/limits";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../supabase/migrations/0002_generated.sql");

const q = (value: string | null | undefined) =>
  value === null || value === undefined ? "null" : `'${value.replace(/'/g, "''")}'`;

function build(): string {
  const lines: string[] = [];
  const p = (s = "") => lines.push(s);

  p("-- ============================================================================");
  p("-- GENERATED FILE — do not edit by hand.");
  p("-- Produced by `npm run db:generate` from src/lib/{leveling,ranks,activities}.ts");
  p("-- and src/lib/xp/limits.ts. Verified in CI by `npm run db:verify`.");
  p("-- ============================================================================");
  p();

  // ------------------------------------------------------------- level curve
  p("create table if not exists public.level_curve (");
  p("  level         integer primary key,");
  p("  xp_required   integer not null,");
  p("  cumulative_xp bigint  not null");
  p(");");
  p("alter table public.level_curve enable row level security;");
  p("drop policy if exists level_curve_select on public.level_curve;");
  p("create policy level_curve_select on public.level_curve");
  p("  for select to authenticated using (true);");
  p("create index if not exists level_curve_cumulative_idx");
  p("  on public.level_curve (cumulative_xp);");
  p();
  p("truncate table public.level_curve;");
  p("insert into public.level_curve (level, xp_required, cumulative_xp) values");
  const curve = levelCurveRows(MAX_TABLE_LEVEL);
  p(
    curve
      .map((r) => `  (${r.level}, ${r.xpRequired}, ${r.cumulativeXp})`)
      .join(",\n") + ";",
  );
  p();

  // ---------------------------------------------------------------- xp limits
  p("create table if not exists public.xp_limits (");
  p("  key   text primary key,");
  p("  value numeric not null");
  p(");");
  p("alter table public.xp_limits enable row level security;");
  p("drop policy if exists xp_limits_select on public.xp_limits;");
  p("create policy xp_limits_select on public.xp_limits");
  p("  for select to authenticated using (true);");
  p();

  const limits: [string, number][] = [
    ["max_attribute_xp_per_activity", MAX_ATTRIBUTE_XP_PER_ACTIVITY],
    ["max_player_xp_per_activity", MAX_PLAYER_XP_PER_ACTIVITY],
    ["daily_player_xp_cap", DAILY_PLAYER_XP_CAP],
    ["max_activities_per_day", MAX_ACTIVITIES_PER_DAY],
    ["min_seconds_between_submissions", MIN_SECONDS_BETWEEN_SUBMISSIONS],
    ["max_backdate_days", MAX_BACKDATE_DAYS],
    ["future_skew_minutes", FUTURE_SKEW_MINUTES],
    ...ATTRIBUTE_KEYS.map(
      (k) => [`daily_cap_${k}`, DAILY_ATTRIBUTE_CAP[k]] as [string, number],
    ),
  ];

  p("truncate table public.xp_limits;");
  p("insert into public.xp_limits (key, value) values");
  p(limits.map(([k, v]) => `  (${q(k)}, ${v})`).join(",\n") + ";");
  p();

  // -------------------------------------------------------- activity catalogue
  p("create table if not exists public.activity_catalog (");
  p("  code           text primary key,");
  p("  label          text not null,");
  p("  activity_group text not null,");
  p("  icon           text not null,");
  p("  max_minutes    integer not null,");
  p("  evaluated      boolean not null default false,");
  ATTRIBUTE_KEYS.forEach((k) =>
    p(`  rate_${k}      numeric not null default 0,`),
  );
  p("  sort_order     smallint not null default 0");
  p(");");
  p("alter table public.activity_catalog enable row level security;");
  p("drop policy if exists activity_catalog_select on public.activity_catalog;");
  p("create policy activity_catalog_select on public.activity_catalog");
  p("  for select to authenticated using (true);");
  p();
  p("truncate table public.activity_catalog;");
  p(
    "insert into public.activity_catalog (code, label, activity_group, icon, max_minutes, evaluated, " +
      ATTRIBUTE_KEYS.map((k) => `rate_${k}`).join(", ") +
      ", sort_order) values",
  );
  p(
    ACTIVITY_TYPES.map((t, i) => {
      const rates = ATTRIBUTE_KEYS.map((k) => t.rates[k] ?? 0).join(", ");
      return `  (${q(t.code)}, ${q(t.label)}, ${q(t.group)}, ${q(t.icon)}, ${t.maxMinutes}, ${
        t.evaluated ? "true" : "false"
      }, ${rates}, ${i})`;
    }).join(",\n") + ";",
  );
  p();

  // -------------------------------------------------------------- rank ladder
  p("create table if not exists public.rank_ladder (");
  p("  position   smallint primary key,");
  p("  tier       text not null,");
  p("  tier_label text not null,");
  p("  division   smallint not null,");
  p("  label      text not null,");
  p("  min_level  integer not null");
  p(");");
  p("alter table public.rank_ladder enable row level security;");
  p("drop policy if exists rank_ladder_select on public.rank_ladder;");
  p("create policy rank_ladder_select on public.rank_ladder");
  p("  for select to authenticated using (true);");
  p();
  p("truncate table public.rank_ladder;");
  p(
    "insert into public.rank_ladder (position, tier, tier_label, division, label, min_level) values",
  );
  const roman: Record<number, string> = { 1: "I", 2: "II", 3: "III" };
  p(
    RANK_LADDER.map((step, i) => {
      const tier = RANK_TIERS[step.tier];
      const label = `${tier.label} ${roman[step.division]}`;
      return `  (${i}, ${q(step.tier)}, ${q(tier.label)}, ${step.division}, ${q(label)}, ${step.minLevel})`;
    }).join(",\n") + ";",
  );
  p();

  // ------------------------------------------------------------ helper lookups
  p(`-- Resolve a lifetime XP total into a level. Levels above the cached range
-- keep the last requirement, which only matters far beyond level ${MAX_TABLE_LEVEL}.
create or replace function public.app_level_for_xp(p_total bigint)
returns integer language sql stable as $$
  select coalesce(
    (select max(level) from public.level_curve where cumulative_xp <= greatest(p_total, 0)),
    1
  );
$$;

create or replace function public.app_xp_required(p_level integer)
returns integer language sql stable as $$
  select coalesce(
    (select xp_required from public.level_curve where level = p_level),
    (select xp_required from public.level_curve order by level desc limit 1)
  );
$$;

create or replace function public.app_rank_label(p_level integer)
returns text language sql stable as $$
  select label from public.rank_ladder
  where min_level <= greatest(p_level, 1)
  order by min_level desc limit 1;
$$;

create or replace function public.app_limit(p_key text)
returns numeric language sql stable as $$
  select value from public.xp_limits where key = p_key;
$$;`);
  p();

  return lines.join("\n");
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, build(), "utf8");
console.log(`Wrote ${OUT}`);
