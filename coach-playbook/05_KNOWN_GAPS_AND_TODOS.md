# Known gaps, and your to-dos (honest list as of 2026-10-12)

## Your to-dos (the app cannot do these for you)
1. **Click through everything once.** Nothing built in October has had a browser pass by a human. Start with: an APRE exercise (set up, log set 3 as the client, calculate, approve, check the client's Coach target); the Edit Program switches on a test client; a phase draft → activate → undo on a **test** client.
2. **Publish foods.** In your Notion food library, 38 foods now have nutrients and sources but are held at verification status "Entered", and 26 still have no nutrient data. Fill in the rest, set the verified status on the ones you trust, then the daily sync (or `npm run sync:foods`) publishes them. Until then client food search is empty.
3. **Compare the APRE tables with your own chart.** The app uses the range that every published source I could find agrees on, in pounds (file `src/lib/progression/apre.js`). If your chart differs, tell the developer which row.
4. **Decide the Conjugate rules** (below).
5. **Check the "plan vs actual" cut-offs** suit you: 80% is good, 70% is weak, at least 4 scheduled sessions before it will judge (file `src/lib/phaseAssessment.js`).

## Not finished
- **Conjugate progression** is not implemented. It is listed as "Not implemented". To build it the app needs your decisions: (a) the main lifts that get max-effort days; (b) the pool of variations to rotate through and how often to rotate (for example every 1 to 3 weeks, or when no new best); (c) how a max-effort day counts as a record (best single/triple of that variation family?); (d) the dynamic-effort wave: percentages by week, sets and reps, and rest; (e) where the one-rep max comes from (entered by you, or the best logged lift). The developer can also research the published Westside rules and cross-check them, as was done for APRE; the rotation choices still need you.
- **Taper pain flag.** The taper screen can flag poor readiness (from the daily energy, sleep or mood values you choose), but nothing in the app records pain yet, so the pain flag cannot trigger from the screen.
- **Density progression** needs you to type all its thresholds. Technique and pain are your inputs because the app cannot see failed or sloppy reps. Straight-set sessions do not record total time or actual rest.
- **Payments.** Payoneer is not built. Starter checkout falls back to you confirming payment by hand.
- **Old scaffolding:** the `exercise_upgrades` table and the `client_goal_scores` history have no screens using them.

## Things that behave a certain way on purpose
- iPhones can beep but cannot vibrate from a web page (Android can do both).
- Habit adherence counts every day in the window, so a brand-new habit looks low.
- Coach screens read check-ins as of yesterday; client screens include today.
- A client with only a few scheduled sessions gets "Not enough data" from plan vs actual, not a grade.
- The daily email arrives around 12:00 UTC.

## What happened to the Head Coach
From late September until 12 October the Head Coach review (and other AI actions in the same function: goal insights, phase recommendations, Generate Roadmap) failed on the live site because of a packaging problem. It was fixed on 12 October. If a review ever errors again, try once, then report it.

## For the developer (short)
Vercel Hobby: 12 serverless functions maximum and 60-second limit per function, so new actions are added inside existing files and every AI call is time-limited. Never put `.ts` files under `api/` that a function imports. Database logic can be tested with `npm run test:phase-activation`, `test:progression-decision`, `test:program-settings`, `test:food-db` (need Docker).
