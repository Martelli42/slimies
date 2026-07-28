# Shop Board

An internal app for the coffee shop. It tracks dates on baked goods from delivery
through the freezer to the case, runs the opening/mid/closing checklists, holds the
shift schedule and the trailer calendar, and gives the team one board so everybody
knows what's going on.

Everything is shared and live: when someone logs a delivery or ticks off a closing
task, every other phone or tablet updates within a second.

## Running it

```bash
npm install
npm run shop          # http://localhost:4000
npm run test:shop     # end-to-end check against a throwaway database
```

The first person to open it creates the manager account (name + a 4–8 digit PIN).
After that, managers add everyone else under **Account → Manage shop → Team**, and
each person signs in by tapping their name and entering their PIN — quick on a
shared iPad behind the counter.

Data lives in a single SQLite file (`shop.db` at the repo root by default). Back it
up by copying that file.

### Environment variables

| Variable | Default | Notes |
| --- | --- | --- |
| `SHOP_PORT` | `4000` | Port to listen on. |
| `SHOP_DB` | `<repo>/shop.db` | Path to the SQLite file. |
| `SHOP_JWT_SECRET` | dev value | **Set this in production.** Sign-in tokens are signed with it. |
| `SHOP_TZ` | `America/Chicago` | Starting timezone; changeable in-app under Shop settings. |
| `VAPID_PUBLIC` / `VAPID_PRIVATE` | generated once, stored in the DB | Web push keys. |

Put it behind HTTPS (a reverse proxy is fine). Service workers, push notifications,
and "add to home screen" all require it.

## The bakery side

Every delivery becomes a **batch** — a specific quantity of one item that moves
through states:

```
delivered ──▶ frozen ──▶ thawing ──▶ floor ──▶ sold out
    │            │           │          │
    └────────────┴───────────┴──────────┴──▶ discarded
```

Dates are computed from per-item shelf lives, which managers set under **Bakery
menu**:

- `fresh_life_days` — good for this long if it's delivered ready to sell
- `frozen_life_days` — how long it keeps in the freezer
- `thaw_hours` — how long from freezer to case-ready (drives the "thawed and ready"
  alert)
- `floor_life_days` — how long it can stay in the case; `0` means sell it that day

So a croissant frozen today gets a discard date 60 days out; pull it to thaw and the
app tells you when it's ready; put it in the case and the discard date becomes
tomorrow. Nobody has to do the arithmetic on a sticky note.

**Partial moves split the batch.** Pull 12 of 48 croissants out of the freezer and
you get a batch of 12 thawing plus 36 still frozen, each with its own honest dates.
The 36 keep the original freezer date rather than inheriting today's.

**Everything is logged.** Every delivery, freeze, thaw, case, sale-out, discard,
recount, and note is a row in `batch_events` with the timestamp and who did it —
visible per batch (the "History" button) and shop-wide under **Bakery → Log**.
Discards also notify the team, so waste isn't invisible.

The Today screen leads with what needs a decision: past discard date, thawed and
ready to case, and use-up-soon (how many days ahead is configurable).

## Shift checklists

Opening, mid-day, and closing lists come seeded with a realistic set of coffee shop
tasks — managers edit them under **Task lists**. Each list resets on its own
business day (in the shop's timezone), records who ticked each item and when, and
retiring a task keeps it on old days' records instead of erasing history. Use the
date arrows to look back at any previous day.

## Schedule

Managers post shifts; everyone sees the week grid with their own shifts outlined.
**Copy this week →** duplicates a week forward, skipping anything that would
collide, which is how a repeating schedule gets built in a few taps.

Cover requests run: someone flags a shift → a teammate offers to take it → a manager
approves, and only that approval actually reassigns the shift. Each step notifies the
team.

## Trailer calendar

Bookings hold the date, times, location, address, contact, menu, notes, and a
confirmed/tentative/cancelled status. Assigning crew to a booking creates a real
trailer shift on the schedule, so trailer work and shop work never live in two
places that disagree.

## Board

Short notes for the team, pinned if they matter. Each post shows **seen by X/Y** with
names and timestamps, so "did everyone see this?" has an actual answer rather than a
guess. Unread posts show a badge on the tab and, if notifications are on, arrive on
people's phones.

## Roles

- **Staff** — log deliveries and every batch move, tick off checklists, see the
  schedule and trailer calendar, request/claim cover, post to the board, view the
  team list and logs.
- **Managers** — everything above, plus the bakery menu, task lists, schedule,
  trailer bookings, staff accounts and PIN resets, and shop settings. The app won't
  let the last active manager lock themselves out.

Accounts are deactivated, never deleted, so their history stays readable.

## Layout

```
shop/
  server.js            Express + socket.io wiring
  lib/
    db.js              schema, settings, activity log, first-run seed data
    auth.js            PIN hashing, tokens, auth + manager guards
    dates.js           timezone-aware business dates and shelf-life math
    push.js            web push fan-out
    bus.js             live-update broadcast
    validate.js        input coercion
  routes/              session, dashboard, bakery, tasks, schedule, trailer, board, admin
  public/              the PWA (no build step, no CDN dependencies)
  test/smoke.js        end-to-end walkthrough of a full shift
```

The unrelated Slimies app still lives at the repo root (`npm run slimies`); this app
is entirely separate and uses its own database.
