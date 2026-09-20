# Deploying Kingdom Scheduler (Vercel + Supabase)

This is the path of least resistance: Vercel hosts the site and the three
`/api` functions for free on their hobby tier, Supabase hosts the database
for free on theirs, and the two talk to each other over plain HTTPS. Nothing
else to run or pay for unless the club outgrows the free tiers.

Total time: ~20 minutes, no local setup required if you use the web UIs
(steps below use the web UI; a CLI alternative is at the bottom).

---

## 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) → **New project**.
2. Pick a name (e.g. "kingdom-scheduler"), a database password (save it
   somewhere — you likely won't need it again, but don't lose it), and a
   region close to the club.
3. Wait ~2 minutes for it to spin up.
4. Open **SQL Editor** → **New query**, paste in the contents of
   `schema.sql` from this project, and run it. This creates all the tables
   and seeds:
   - the 5 default departments
   - one owner login: PIN **1234**
5. Open **Project Settings → API**. You'll need two values from here in a
   minute:
   - **Project URL**
   - **service_role key** (not the `anon` key — the proxy needs the
     privileged one because it runs server-side, never in the browser)

## 2. Create the Telegram bot

1. In Telegram, message **[@BotFather](https://t.me/BotFather)** →
   `/newbot` → follow the prompts. You'll get back a **bot token**
   (looks like `123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`).
2. Create (or pick) a Telegram group for the staff, and add the bot to it.
3. Get the group's **chat id**:
   - Send any message in the group.
   - Visit `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` in a
     browser (with your real token in place of `<YOUR_TOKEN>`).
   - Look for `"chat":{"id":-1001234567890,...}` in the response — that
     number (including the minus sign, if there is one) is your chat id.

## 3. Push this project to GitHub

Vercel deploys from a Git repo. If you don't already have one:

```bash
cd kingdom-scheduler
git init
git add .
git commit -m "Kingdom Scheduler"
gh repo create kingdom-scheduler --private --source=. --push
```

(No `gh` CLI? Create an empty repo on github.com, then
`git remote add origin <url> && git push -u origin main`.)

## 4. Deploy on Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New → Project** → import
   the GitHub repo you just pushed.
2. Vercel auto-detects Vite; leave the build settings as-is
   (`npm run build`, output `dist`).
3. Before clicking Deploy, open **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `SUPABASE_URL` | the Project URL from step 1 |
   | `SUPABASE_SERVICE_ROLE_KEY` | the service_role key from step 1 |
   | `TELEGRAM_BOT_TOKEN` | the bot token from step 2 |
   | `TELEGRAM_CHAT_ID` | the chat id from step 2 |

4. Click **Deploy**. In ~1 minute you'll get a live URL
   (`kingdom-scheduler.vercel.app` or similar).

The cron in `vercel.json` (`api/remind`, Sundays at 13:00 UTC) is picked up
automatically — no extra step. Adjust the schedule string if the club's
timezone means 13:00 UTC isn't actually 1pm locally, or swap it for
whatever hour you want the weekly reminder to fire.

## 5. Log in and take it from here

Visit the Vercel URL, pick the **Owner** profile, PIN **1234** — then
immediately go to **Setup** and either edit that account's PIN or add
real staff and remove the placeholder. From there:

- Mark some **Show Days** on the calendar.
- Add real staff under **Setup**, or bulk-import via the CSV tool.
- Build and publish a week from the **Builder** tab — this is what fires
  the first real Telegram message, so it doubles as a connection test.

---

## Everyday changes after this

Once it's deployed, any further edits to `src/KingdomScheduler.jsx` (or
the `api/` files) just need:

```bash
git add -A
git commit -m "describe the change"
git push
```

Vercel redeploys automatically on every push to the main branch — no
redeploy button to remember.

---

## CLI alternative to steps 3–4

If you'd rather skip GitHub and deploy straight from your machine:

```bash
npm install -g vercel
cd kingdom-scheduler
vercel          # first run walks you through linking/creating the project
vercel env add SUPABASE_URL
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add TELEGRAM_BOT_TOKEN
vercel env add TELEGRAM_CHAT_ID
vercel --prod
```

## Troubleshooting

- **Login screen shows demo staff, not your real ones** → the app falls
  back to built-in sample data whenever `/api/db` fails. Open the deployed
  site's browser console (or Vercel's function logs) for the actual error
  — almost always a missing/misspelled `SUPABASE_URL` or
  `SUPABASE_SERVICE_ROLE_KEY` env var, or `schema.sql` not having been run
  yet.
- **Publishing a schedule doesn't message Telegram** → double check the bot
  was actually added *to the group* (not just created), and that
  `TELEGRAM_CHAT_ID` includes the leading `-` if the group id has one.
- **Sunday reminder never fires** → Vercel Cron only runs on the
  **Pro** plan for schedules more frequent than daily, but a once-a-week
  cron like this one is fine on the free Hobby plan. If it's still silent,
  check **Project → Cron Jobs** in the Vercel dashboard for the run log.
