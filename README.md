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
Coach clicks "Generate AI Program" (Clients panel)
        │
        ▼
POST /api/generate-program  { client_email }
        │
        ├─ 1. Read client intake from Notion        (api/_lib/notion.js)
        ├─ 2. Generate training + nutrition plans    (api/_lib/anthropic.js, in parallel)
        ├─ 3. Save to Supabase                       (api/_lib/supabaseAdmin.js)
        │       • programs            (metadata)
        │       • exercises           (weekly split, source='ai')
        │       • nutrition_plans     (macros + meals JSON, active)
        │       • profiles            (onboarding_complete = true)
        ▼
Client portal shows Training Plan + Nutrition pages
```

## Setup

1. **Install**
   ```bash
   npm install
   ```

2. **Database** — apply the schema in the Supabase SQL editor:
   ```
   db/schema.sql
   ```

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

## Build

```bash
npm run build    # outputs dist/
```
