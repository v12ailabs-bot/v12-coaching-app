# Obsolete and overlapping features (scan of 2026-10-12)

## Short answer
Yes, partly. Almost nothing is *dead code* (the scan found only a handful of unused functions), but several things now **overlap**: two or three ways to do the same job, which is why it feels like you keep building more. Nothing below is broken; each is a cleanup candidate that needs your say-so because it changes what you or clients see.

## A. Confirmed leftovers (safe to remove, nothing sees them)
- `PHASES` list in `src/lib/constants.js`: the old flat phase picker's list; only imported, never used (the import was removed in this PR; the constant itself can go).
- Unused functions: `LEAD_STATUSES` is used only through its label map; `fetchActiveModelsForPhase`, `SPACING`, `mergePlanDetails`, `getTask`, `parseWebhookEvent` (payments stub) are never called. `requireHeadCoachWorker` is an intentional spare.
- `exercise_upgrades` table: no screen or code uses it (planned "Advance to next phase" idea that was replaced by phase drafts and activation).
- `Templates` screen in the coach menu: legacy. Generation reads Notion templates. Editing here changes nothing in generated programs.
- Menu label "Progression Models" was stale (the page is now the Progression hub): renamed to "Progression" in this PR.

## B. Overlaps (two ways to do one thing)
| Job | The overlapping tools | Suggestion |
|-----|----------------------|------------|
| Edit a client's roadmap | **Edit Program** (4-step wizard) and **Edit & Generate Roadmap** (long editor) edit the same phase data | Keep both for now: wizard for tidy edits, long editor for AI generation. Later: put "Generate" buttons inside the wizard and retire the long editor |
| Change the current phase | **Program Phase tab → set phase by hand** only changes the *label*; **Draft workouts → Activate** changes the label **and** the workouts | Risk: moving the label by hand leaves the workouts behind. Suggest: hide the manual picker unless "emergency override" |
| Advice on a client | **Phase review AI recommendation**, **Plan vs actual**, **Head Coach review**, and the **Intervention window quick review** | Four advisors with different inputs. Suggest: treat Head Coach as the check-in advisor, plan vs actual as the phase advisor, and fold the AI phase recommendation into plan vs actual |
| Progression method knowledge | **AI methodology** tab (free text the AI reads) vs the **Method reference** (what the app really calculates). The AI text also has an old single `apre` entry beside the real APRE 3/6/10 | Risk of drifting apart. Suggest: keep AI methodology only for program generation and label the rest "calculated by the app" |
| A client's roadmap | Home shows the **V12 30-day journey** card, the **program roadmap** card, and More has **My Roadmap** (the 30-day journey) | Three "roadmaps". Suggest: keep one program roadmap on Home, and call the 30-day one "Your first 30 days" |
| A client's dashboard | **Home** and More → **Dashboard** (which is a static welcome page about the V12 philosophy) | Confusing name. Suggest: rename "Dashboard" to "Welcome guide" |
| Logging check-ins | **Daily** now lives on the Today screen; the old Habits page only remains for program-only clients | Fine; just remember they are different clients |
| Reading a client's progress | Client Overview tiles, Intervention window, Progression review, Plan vs actual | Different jobs; the only risk is numbers disagreeing: they now use one definition each (see Metric definitions) |

## C. What I did not find
I did not find buttons that do nothing. I did not click through the live app, so a button that looks fine in the code can still misbehave on screen: that is what the browser pass in `05_KNOWN_GAPS_AND_TODOS.md` is for.
