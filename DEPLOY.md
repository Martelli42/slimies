# Putting Shop Board on the internet (Vercel)

## The short way

If you have a terminal handy, one command does all of it:

```bash
git clone https://github.com/Martelli42/slimies.git
cd slimies
git checkout claude/coffee-shop-inventory-shifts-p28xqx
npm install
npm run deploy
```

It creates the database, generates the sign-in secret, sets all four environment
variables, deploys, and checks the result. You'll be asked to log in to Turso and
to Vercel — both open a browser window, and both are free with no card. Add
`-- --dry-run` to watch it narrate the steps without touching anything.

Re-running it later is safe: it reuses the same database and just redeploys.

The rest of this page is the same thing done by hand in the browser, if you'd
rather see each step.

## The manual way

Total time: about 10 minutes. Two free accounts, four values to paste, one Deploy
button. No terminal needed.

Vercel runs code but doesn't keep files, so the app needs a database that lives
somewhere else. Turso is a hosted version of exactly the database this app already
uses, and its free tier is far more than a coffee shop will ever need.

---

## 1. Create the database (Turso)

1. Go to **https://turso.tech** and sign up (GitHub login is fine).
2. Create a database — call it `shop-board`. Pick the region closest to the shop.
3. On the database page, copy these two values and keep them handy:
   - the **URL**, which looks like `libsql://shop-board-yourname.turso.io`
   - a **token** — click *Create Token* (choose read & write, no expiry)

## 2. Make up a sign-in secret

This is what keeps someone from forging a login. Any long random string works —
mash the keyboard for 40+ characters, or open a terminal and run
`openssl rand -base64 32`. Save it; you'll paste it in the next step and won't
need it again.

## 3. Deploy (Vercel)

1. Go to **https://vercel.com** and sign up with GitHub.
2. **Add New → Project**, pick the `slimies` repository.
3. Under **Branch**, choose `claude/coffee-shop-inventory-shifts-p28xqx`
   (or merge that branch into `main` first and leave this alone).
4. Leave the build settings alone — `vercel.json` already tells Vercel what to do.
5. Open **Environment Variables** and add four:

   | Name | Value |
   | --- | --- |
   | `TURSO_DATABASE_URL` | the `libsql://…` URL from step 1 |
   | `TURSO_AUTH_TOKEN` | the token from step 1 |
   | `SHOP_JWT_SECRET` | the random string from step 2 |
   | `SHOP_TZ` | your timezone, e.g. `America/Chicago` |

6. Click **Deploy**. When it finishes you get a URL like
   `shop-board-xyz.vercel.app`.

## 4. First run

Open the URL. It will ask you to create the first manager account — your name and
a 4–8 digit PIN. Everything else (the bakery menu, the opening/closing lists) is
already seeded and editable in the app.

Then:

- **Add your staff**: tap your initials (top right) → *Manage shop* → *Team*.
  Give each person a starting PIN; they can change it themselves.
- **Check the timezone**: *Manage shop* → *Shop*. Every date in the app keys off it.
- **Have everyone install it**: open the URL on their phone, then *Share → Add to
  Home Screen* (iPhone) or *Install app* (Android). It then behaves like an app,
  with the tab bar and no browser chrome.
- **Turn on notifications**: each person taps their initials → *Turn on
  notifications*, so board posts and cover requests reach their phone.

## Checking it's healthy

`https://your-app.vercel.app/api/health` returns something like:

```json
{ "ok": true, "staff": 4, "timezone": "America/Chicago",
  "database": "hosted", "jwt_secret_set": true }
```

If `database` says `local file` or `jwt_secret_set` is `false`, an environment
variable didn't get set — fix it in Vercel under *Settings → Environment
Variables*, then **Redeploy**.

## Things worth knowing

- **Live updates are near-live, not instant.** Vercel can't hold an open
  connection, so screens check for changes every 15 seconds (and immediately when
  you switch back to the app). Your own actions show up right away; a teammate's
  show up within about 15 seconds.
- **Backups.** Turso keeps point-in-time restores on the free tier. You can also
  pull a copy any time with the Turso CLI (`turso db shell shop-board .dump`).
- **Cost.** $0 on both, with no card required. Vercel's free Hobby plan gives
  100 GB of bandwidth a month and a 10-second limit per request; this app uses a
  rounding error of the first and milliseconds of the second. Turso's free tier is
  similarly far past what a shop generates.
- **One caveat on Vercel's free plan:** their terms describe Hobby as being for
  non-commercial, personal projects, and a shop tool is arguably commercial. It
  will work and it will cost nothing; whether to run a business tool there is your
  call. Their Pro plan is $20/month, or see the two free-of-that-question options
  below.
- **Hobby is a single-user Vercel account** — you can't invite people to the Vercel
  dashboard. That doesn't affect your staff at all; they use the app's URL and
  never see Vercel.
- **Don't lose `SHOP_JWT_SECRET`.** Changing it signs everyone out (they just sign
  in again with their PIN — no data is lost).

---

## Running it in the shop instead

If you'd rather not depend on the internet, the same code runs on any computer
with no database service at all — it uses a local file:

```bash
npm install
npm run shop        # http://localhost:4000
```

Everyone on the shop wifi reaches it at `http://<that computer's IP>:4000`, and
live updates are instant. A cheap mini PC that stays on behind the counter works
well. Trade-off: no access from home, and notifications and home-screen install
need HTTPS, which a plain local address doesn't have.

## Other hosts

Any host that runs a Node process with a persistent disk (Railway, Render, Fly.io,
a VPS) works without the Turso step — set `SHOP_JWT_SECRET`, point `SHOP_DB_URL`
at a file on the disk (`file:/data/shop.db`), and run `npm run shop`.
