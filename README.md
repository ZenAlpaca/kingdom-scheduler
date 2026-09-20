# Kingdom Scheduler

Nightclub staff scheduling — PIN login, department-based schedules, availability,
time off, shift swaps, and an admin schedule builder. Dark theme, bilingual
(English/Español), mobile-first.

**Want to get this live right now?** Skip to [`DEPLOY.md`](./DEPLOY.md) —
it's a step-by-step Supabase + Vercel walkthrough, about 20 minutes start to
finish. This README covers what's in the project and how it fits together.

## What's in here

```
index.html, vite.config.js      Vite app shell — this is a runnable project
src/main.jsx                    Mounts the app
src/KingdomScheduler.jsx       The whole app — one React component
api/db.js                       Supabase proxy (all reads/writes go through this)
api/telegram.js                 Sends a Telegram message
api/remind.js                   Weekly Sunday reminder job (Vercel Cron)
vercel.json                     Cron schedule for api/remind
schema.sql                      Supabase table definitions + seed data
package.json, .env.example
```

## Running it locally

```bash
npm install
npm run dev
```

This starts the Vite dev server. The `/api/*` functions won't run under
plain `vite dev` (they need Vercel's runtime) — see below for what happens
when they're unreachable, or use `vercel dev` instead if you want the full
stack locally.

## How the pieces fit together

The component never talks to Supabase directly — it calls `/api/db`, which
holds the service-role key server-side and does the actual query. This
avoids exposing Supabase credentials to the browser and sidesteps CORS. The
proxy also translates between the camelCase field names the app uses
(`userId`, `onCall`) and the snake_case columns in Postgres (`user_id`,
`on_call`), so neither side has to compromise on naming.

If `/api/db` isn't reachable — for instance under plain `vite dev`, or
before Supabase is wired up — the app quietly falls back to an in-memory
demo dataset (a handful of made-up staff and one upcoming weekend) so
everything still renders and behaves.

## Deploying

See [`DEPLOY.md`](./DEPLOY.md) for the full walkthrough (Supabase project,
Telegram bot, Vercel deploy, env vars). Short version:

1. Run `schema.sql` in a new Supabase project's SQL editor.
2. Create a Telegram bot and grab its token + your group's chat id.
3. Push this repo to GitHub, import it in Vercel, set four env vars
   (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`,
   `TELEGRAM_CHAT_ID`), deploy.

The app is a plain Vite React build plus three Vercel-style serverless
functions, so any host that supports both (Netlify, Cloudflare Pages, a
Node server you run yourself) will work with minor adaptation to the
`/api` functions' request/response shape — the Supabase and Telegram logic
inside stays the same either way.

## Notes on things you'll likely want to adjust

- **PINs are stored as plain text** in `users.pin`, matching the "PIN
  keypad, auto-submit at 4 digits" flow described in the brief. If staff PINs
  need to be more than a convenience lock, add hashing and check it
  server-side instead of comparing in the browser.
- **Conflict detection** in the schedule builder is a straightforward
  overlap check against the day's submitted availability; it doesn't (yet)
  account for things like max weekly hours or double-booking across
  departments.
- **CSV import** matches existing rows by name to decide whether to keep
  someone's manager/owner flag — rename someone in the sheet and re-import,
  and it'll be treated as a new hire. Match on an id column instead if that
  matters for your club.
- Fonts (DM Sans, Space Grotesk) load from Google Fonts via `@import` in the
  component's own `<style>` tag — swap that for self-hosted fonts if you'd
  rather not depend on Google Fonts at runtime.
