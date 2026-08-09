# ASCENDANT

**Level up your real life.** A mobile-first PWA that turns real-world
self-improvement into an RPG: log what you actually did, earn XP the server
decides you deserve, raise five attributes, keep a streak, clear daily quests,
and climb a rank ladder against your friends.

Original branding, terminology, artwork and rank system throughout — no
third-party franchise assets are used or referenced.

---

## Contents

- [What it does](#what-it-does)
- [Stack](#stack)
- [Quick start](#quick-start)
- [Configuring Supabase](#configuring-supabase)
- [Environment variables](#environment-variables)
- [Running locally](#running-locally)
- [Deploying to Vercel](#deploying-to-vercel)
- [Push notifications](#push-notifications)
- [Scheduled jobs](#scheduled-jobs)
- [How the XP engine works](#how-the-xp-engine-works)
- [Anti-farming rules](#anti-farming-rules)
- [Activity evaluation](#activity-evaluation)
- [Project layout](#project-layout)
- [Testing](#testing)
- [Extending it](#extending-it)

---

## What it does

**Five attributes.** Strength (STR), Agility (AGI), Wisdom (WIS), Discipline
(DSC) and Endurance (END). Adding more later is a one-line change to
`src/lib/constants.ts` plus a column.

**A character sheet.** Overall level, per-attribute tiers, a rank from Bronze III
to Mythic I, a streak, achievements and a radar chart of where your effort
actually goes.

**Daily quests.** Generated at your local midnight, biased toward the goals you
picked at onboarding, plus any recurring custom quests you write yourself.
Clearing the whole board pays a bonus.

**Friends and leaderboards.** Everyone gets a friend code like `NOVA-7F92`.
Weekly, monthly, level, streak and per-attribute boards, scoped to friends or
global, with movement arrows against the previous period.

**A record.** Every activity is stored with its XP breakdown and can be deleted
— which reverses the XP correctly, including quest progress.

**A weekly report.** Levels gained, XP by attribute, active days, where you rank
among friends, and which attribute to focus on next.

---

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, React 19, TypeScript) |
| Styling | Tailwind CSS v4 |
| Database, auth, storage, realtime | Supabase (PostgreSQL) |
| Notifications | Web Push (VAPID) |
| Hosting | Vercel |

There is no state management library, no chart library and no icon package —
the radar chart, rank insignia, icon set and app icons are all generated from
source in this repo.

---

## Quick start

```bash
git clone <this repo>
cd ascendant
npm install
cp .env.example .env.local     # then fill it in — see below
npm run dev
```

Open <http://localhost:3000>. Without Supabase credentials the landing page
still renders and the auth screens explain exactly what is missing.

---

## Configuring Supabase

1. **Create a project** at <https://supabase.com/dashboard>.

2. **Apply the schema.** Open the SQL Editor and run these files in order:

   ```
   supabase/migrations/0001_schema.sql       tables, RLS, triggers
   supabase/migrations/0002_generated.sql    level curve, limits, catalogues
   supabase/migrations/0003_functions.sql    the XP engine and game logic
   supabase/migrations/0004_achievements.sql achievement catalogue
   supabase/migrations/0005_storage.sql      avatar bucket and its policies
   ```

   With the Supabase CLI instead:

   ```bash
   supabase link --project-ref <your-ref>
   supabase db push
   ```

3. **Optional: seed demo players.** Run `supabase/seed.sql` to create six rival
   accounts (`shadowrunner`, `ironmike`, `nova`, `atlas`, `valkyrie`,
   `kestrel`) with a month of plausible history, so the leaderboards are not
   empty while you build. They all share the password `ascendant-demo`.

   After creating your own account, line them up against you:

   ```sql
   select public.demo_befriend('your_username');
   ```

4. **Copy your keys** from Project Settings → API into `.env.local`.

5. **Auth settings.** Under Authentication → URL Configuration, add your site
   URL and `<site>/auth/callback` as a redirect URL. Email confirmation can be
   on or off — the sign-up screen handles both.

---

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Browser client, always filtered by RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | **Server only.** Calls the game-logic functions |
| `NEXT_PUBLIC_SITE_URL` | in production | Builds email redirect links |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | optional | Enables Web Push |
| `VAPID_PRIVATE_KEY` | optional | Enables Web Push |
| `VAPID_SUBJECT` | optional | `mailto:` contact for push services |
| `CRON_SECRET` | optional | Required for cron endpoints in production |
| `OPENAI_API_KEY` | optional | Switches activity evaluation to an LLM |
| `OPENAI_MODEL` | optional | Defaults to `gpt-4o-mini` |

The service-role key bypasses Row Level Security. It is only ever imported by
route handlers (`src/lib/supabase/admin.ts`) and never reaches the browser.

---

## Running locally

```bash
npm run dev        # dev server
npm run build      # production build
npm run check      # generated SQL freshness + typecheck + lint + unit tests
npm test           # unit tests only
npm run icons      # regenerate the app icons from scripts/generate-icons.mjs
npm run db:generate  # re-render 0002_generated.sql from the TypeScript constants
npm run db:test    # apply migrations to a throwaway PostgreSQL and assert behaviour
```

`npm run db:test` needs a local PostgreSQL 15+ server. It stubs the parts of
Supabase the migrations touch (`scripts/supabase-stub.sql`), applies every
migration plus the seed, then runs `scripts/schema-assertions.sql`, which
exercises signup, onboarding, XP awards, daily caps, overlap rejection, quests,
achievements, friend requests, leaderboards and activity deletion.

```bash
PGHOST=/tmp PGPORT=5432 PGUSER=postgres npm run db:test
```

---

## Deploying to Vercel

1. Push this repository to GitHub and import it at
   <https://vercel.com/new>. The framework preset is detected automatically;
   no build settings need changing.
2. Add every variable from `.env.example` under Settings → Environment
   Variables. Set `NEXT_PUBLIC_SITE_URL` to your production URL.
3. Deploy. `vercel.json` registers the two cron jobs described below.
4. Back in Supabase, add the production URL to Authentication → URL
   Configuration so confirmation emails link to the right place.

---

## Push notifications

Push is optional. Without it the app still writes in-app notifications and the
settings screen says push is unconfigured rather than failing silently.

Generate a key pair:

```bash
npx web-push generate-vapid-keys
```

Put the public key in `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, the private key in
`VAPID_PRIVATE_KEY`, and set `VAPID_SUBJECT` to a `mailto:` address you own.
Redeploy, then open **Settings → Notifications** and press *Enable*. The *Test*
button next to it sends a real notification so you can confirm delivery.

Per-type preferences live in `user_settings` and are respected by every send.

**iOS:** Safari only permits push for web apps installed to the home screen.
Add the app via Share → Add to Home Screen, open it from there, then enable
notifications.

---

## Scheduled jobs

`vercel.json` schedules two endpoints:

| Path | Schedule (UTC) | Does |
| --- | --- | --- |
| `/api/cron/daily` | `0 12 * * *` | Issues quest boards, nudges quests and streaks at risk |
| `/api/cron/weekly` | `0 17 * * 0` | Writes and pushes the weekly report |

Both check `Authorization: Bearer $CRON_SECRET` and refuse to run in production
without it. The daily handler already filters by each player's *local* hour, so
if your plan allows more frequent crons you can change the schedule to `0 * * * *`
and everyone gets nudged at a sensible time of day for them.

---

## How the XP engine works

The client never sends an XP value. The flow is fixed:

```
submit  →  validate input (zod)
        →  evaluate the activity (classifier)
        →  read today's totals
        →  compute the award (pure TypeScript)
        →  award_activity() clamps and commits it in one transaction
        →  update level, streak, quests, achievements, feed, notifications
        →  return the rewards
        →  the client plays the animation
```

The split is deliberate:

- **`src/lib/xp/engine.ts`** is pure. No I/O, no framework imports. It decides
  what an activity is worth given rates, duration, difficulty and the day so
  far, and it is unit-tested.
- **`supabase/migrations/0003_functions.sql`** is authoritative. `award_activity`
  takes an advisory lock on the player, re-checks every limit against the day's
  real numbers, clamps the award, and writes the activity, the ledger row, the
  profile totals, the streak, the quest progress and the achievements together.
  If anything fails, none of it lands.

`xp_ledger` is append-only and is the source of truth for leaderboards, daily
caps and reports; the columns on `profiles` are a denormalised cache of it. The
schema assertions check the two never disagree, including after a deletion.

### One definition of the rules

The level curve, the anti-farming limits, the activity catalogue and the rank
ladder are defined once, in TypeScript, and rendered into
`supabase/migrations/0002_generated.sql` by `npm run db:generate`. `npm run check`
fails if that file is stale, so the database and the app can never disagree
about what a minute of squats is worth.

The curve itself (`src/lib/leveling.ts`) is a power curve with an early-game
boost: 100 XP for level 2, then 155, 200, 240… There is no maximum level.

---

## Anti-farming rules

Enforced in the database, previewed in the UI so the reduction is visible
*before* you submit:

- **Duration tiers.** The first 30 minutes of an activity count fully, the next
  30 at 80%, then 60%, then 45%.
- **Daily fatigue.** Each attribute fades as it approaches its daily cap:
  full rate, then 70%, then 45%, then nothing.
- **Hard caps.** 60 XP per attribute per activity, 60 player XP per activity,
  per-attribute daily caps and a daily player XP ceiling.
- **No overlaps.** An activity that overlaps one you already logged is refused.
- **Rate limiting**, a per-day activity count limit, a 7-day backdating window
  and a rejection of anything in the future.
- **Zero-value activities** earn nothing at all, and do not extend a streak.

Streaks are forgiving by design: one missed day is absorbed by a *streak
shield*, and milestones hand one back. Months of consistency are never destroyed
by a single bad day.

---

## Activity evaluation

`src/lib/classify/` decides what an activity actually was and how much genuine
progression it represents. Two implementations behind one interface:

- **`RuleBasedClassifier`** (default) — deterministic keyword scoring with an
  explicit block list for entertainment, and a scepticism rule: describing
  something as "learning" is not enough, the text has to name a subject.
- **`OpenAIClassifier`** — used automatically when `OPENAI_API_KEY` is set, and
  falls back to the rule-based one on any error or timeout.

Either way the model only chooses a *category* and a *usefulness rating*; the XP
is still computed by the engine from the catalogue rates, so a hallucinating or
compromised model cannot mint XP.

```
"45-minute video on how mortgages and compound interest work"
  → Wisdom, usefulness high        → +20 WIS, +5 DSC

"30 minutes of car burnout videos"
  → usefulness none                → 0 XP, "No meaningful skill progression detected"

"practiced pickleball for 90 minutes"
  → Sport                          → +24 AGI, +12 END, +5 DSC
```

To add a provider, implement `ActivityClassifier` and return it from
`getClassifier()`. Nothing else in the app knows which one is running.

---

## Project layout

```
src/
  app/
    page.tsx                  public landing page
    (auth)/                   login, register, forgot / reset password
    onboarding/               three-step awakening flow
    (app)/                    the signed-in shell — everything below is guarded
      dashboard/  quests/  activity/new/  activity/history/
      friends/  friends/add/  leaderboard/
      profile/  profile/[username]/  achievements/  settings/  notifications/
    api/                      route handlers; all mutations live here
  components/
    game/                     XP bars, radar, rank badge, quest board, rewards
    ui/                       primitives, toasts, modals
    nav/  pwa/                shell chrome, install prompt, push, service worker
  lib/
    leveling.ts  ranks.ts  activities.ts  format.ts     game definitions
    xp/engine.ts  xp/limits.ts                          the XP maths
    classify/                                           activity evaluation
    supabase/                                           client, server, admin
    data.ts  api.ts  validation.ts  time.ts             plumbing
  proxy.ts                    session refresh + route guarding
supabase/
  migrations/                 the schema, in order
  seed.sql                    demo players
scripts/
  generate-sql.ts             renders 0002_generated.sql from TypeScript
  verify-generated-sql.ts     fails CI if that file is stale
  generate-icons.mjs          renders every app icon (no binary assets committed)
  test-xp.ts                  unit tests
  test-schema.sh              end-to-end database tests
legacy-slimies/               the earlier Express prototype, kept for reference
```

### Security model

- RLS is on for every table holding user data.
- Players can `select` their own rows and other players' public profile
  columns. They can write only cosmetic fields; a trigger rejects any update
  that touches level, XP, streaks or the friend code.
- `activities`, `xp_ledger` and `daily_quests` have **no** insert or update
  policies at all — the only way in is through the server.
- The game-logic functions have `execute` revoked from `anon` and
  `authenticated` and granted to `service_role`, so they cannot be called from
  a browser even with a valid session.
- Route handlers resolve the session first and pass the verified user id; no
  endpoint accepts a user id from the request body.

---

## Testing

```bash
npm test        # level curve, ranks, XP engine, caps, classifier
npm run db:test # migrations + seed + behavioural assertions on real PostgreSQL
npm run check   # generated-SQL freshness, typecheck, lint, unit tests
```

---

## Extending it

The seams are already in place for the obvious next steps:

- **Health integrations** (Apple Health, Google Fit, Garmin, Strava) — write to
  `award_activity` exactly as the log screen does; the classifier can be
  bypassed for trusted sources.
- **New attributes** (Charisma, Creativity, Focus, Wealth, Recovery) — add to
  `ATTRIBUTE_KEYS`, add the columns, regenerate.
- **Photo verification** — `activities.proof_url` and the `classification`
  JSON column are already carried through the whole flow.
- **Guilds, teams, PvP, seasons** — `friendships` and `xp_ledger` give you
  membership and time-bounded scoring without a redesign.
- **Native apps** — every mutation is an HTTP route handler over a Supabase
  project, so a native client can reuse the same backend unchanged.
- **Premium** — nothing in the schema assumes a single tier.
