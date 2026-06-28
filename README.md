# V12 Coaching App

Fitness coaching portal with a client + coach experience. Coaches generate
personalized **training and nutrition** programs with AI, sourced from client
intake data in Notion and published to the client portal.

## Stack

- **Frontend:** React 18 + Vite, recharts, Supabase JS (auth + data)
- **Backend:** Vercel-style serverless API routes (`api/`)
- **AI:** Anthropic Claude (`claude-opus-4-8`)
- **Data sources:** Notion (client intake), Supabase (app database)

## Program generation flow

```
Client applies via Notion (intake row in the clients database)
        │
        ▼
Coach selects a client + a program template, clicks "Generate AI Program"
        │
        ▼
POST /api/generate-program  { client_email, template_id }
        │
        ├─ 1. Read client intake from Notion        (api/_lib/notion.js)
        ├─ 2. Load selected template from Supabase   (program_templates)
        ├─ 3. Generate training + nutrition plans    (api/_lib/anthropic.js, in parallel)
        │       training follows the chosen template; nutrition uses client data
        ├─ 4. Save to Supabase                       (api/_lib/supabaseAdmin.js)
        │       • programs            (metadata)
        │       • exercises           (weekly split, source='ai')
        │       • nutrition_plans     (macros + meals JSON, active)
        │       • profiles            (onboarding_complete = true)
        ▼
Client portal shows Training Plan + Nutrition pages
```

Templates live in the `program_templates` table (seeded with defaults in
`db/schema.sql`). The coach picks one in the Clients panel; if none is chosen,
the client's Notion `Program Template` property is used as a fallback.

## Setup

1. **Install**
   ```bash
   npm install
   ```

2. **Database** — apply the schema in the Supabase SQL editor:
   ```
   db/schema.sql
   ```
   The script is idempotent — **re-run it after pulling** to pick up new tables
   and columns (`habits`, `habit_logs`, `coach_notes`, `conversations`,
   `resources`, `program_versions`, plus `profiles.archived`, `programs.phase`,
   and `program_templates.category`). It also creates the private `progress-photos`
   storage bucket and its access policies (clients read/write their own folder;
   the coach reads all). Progress photos are served via short-lived signed URLs.

## Features

- **Client:** welcome gate, training plan (with current phase), nutrition plan,
  daily + weekly check-ins, daily **habits** tracker, workout logging + history,
  progress charts (weight, wellness, measurements, strength, goals, photos), and
  a **resource/recipe library**.
- **Coach:** priority dashboard (missed check-in / low-adherence / low-nutrition
  alerts), per-client **notes**, **conversation log**, **program-phase** control,
  **habit** management, AI program generation, V12 assessment, **client archive**,
  full read-only client history, **program version history** (auto-snapshot on
  generate, manual snapshot, view + restore), template management (categories +
  duplication), and library management.

3. **Environment** — copy `.env.example` to `.env` and fill in:
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — browser (publishable) Supabase creds
   - `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` — server-only service-role key
   - `ANTHROPIC_API_KEY` — AI generation
   - `NOTION_API_KEY`, `NOTION_DATABASE_ID` — client intake source

4. **Notion** — share your clients database with the integration, and make sure
   the property names match the `PROP` map in `api/_lib/notion.js` (Email, Name,
   Goal, Training Days, Experience Level, Injuries, Equipment, Session Length,
   Dietary Preference, Allergies, Calorie Target, Program Template). Adjust that
   map to your actual column names.

## Develop

```bash
npm run dev      # Vite frontend at http://localhost:5173
```

The `/api/*` routes run on Vercel's serverless runtime. To exercise the full
generation flow locally, run them with `vercel dev` (Vite alone does not execute
the `api/` handlers).

Coach login is determined by `COACH_EMAIL` in `src/App.jsx`
(`coach@v12system.com`); everyone else is a client.

## Migrating existing clients from Notion

`scripts/migrate-notion.js` pre-loads existing clients so their history is
waiting on first login. Because a client has no `profiles` row until they sign
up (it references `auth.users`), the script **stages** their Notion data keyed
by name; when they sign up, the app calls the `claim_staged_data()` RPC, which
matches the new profile **by name** and copies the staged rows into their real
tables (then flags the profile so it never repeats).

```bash
# 1. Apply db/schema.sql (creates staged_* tables + the claim function).
# 2. Ensure .env has NOTION_API_KEY, NOTION_DATABASE_ID, SUPABASE_URL,
#    SUPABASE_SERVICE_KEY.
npm run migrate:notion                 # dry run — prints what it found
npm run migrate:notion -- --write      # persist to the staged_* tables
npm run migrate:notion -- --names samer,phill,sidi,keana   # override targets
```

What imports reliably: intake + the V12 assessment from the main clients
database, plus every raw property and page text (kept in `staged_clients.raw` /
`.notes`). Check-in history and measurements import only if you keep them in
**separate** Notion databases — set `NOTION_CHECKINS_DB_ID` /
`NOTION_MEASUREMENTS_DB_ID` and confirm the property maps in the script's
`CONFIG`; otherwise those sections are skipped with a log. Programs and nutrition
aren't in Notion — once a migrated client signs up (intake + assessment already
populated), the coach generates those with one click.

Matching is by first name, normalized (`"Samer Haddad"` → `samer`), so the name
the client signs up with must start with the same first name as in Notion.

### Check-in history from Google Sheets

`scripts/migrate-checkins-sheet.js` imports daily check-in history from a Google
Sheet, matching by client name. A client who has already signed up gets rows
written straight to `daily_checkins`; one who hasn't is staged in
`staged_daily_checkins` and attached on signup (same claim flow).

```bash
# .env needs SUPABASE_URL, SUPABASE_SERVICE_KEY, GOOGLE_API_KEY
npm run migrate:checkins                 # dry run
npm run migrate:checkins -- --write      # persist
npm run migrate:checkins -- --range 'Sheet1!A:Z' --names 'keana shaw,samer'
```

Columns are matched by header name (case-insensitive — see `HEADER_ALIASES` in
the script); a name column and a date column are required. The sheet must be
shared **Anyone with the link – Viewer** for the API key to read it (for a
private sheet, share it with a service account instead).

## Build

```bash
npm run build    # outputs dist/
```
