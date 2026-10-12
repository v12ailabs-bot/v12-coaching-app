# V12 — How a high-performing coach runs this app (read-aloud script)

_Read each section out loud. Stop at "Check yourself" and answer before moving on._

---

## 1. The big picture

V12 is a loop. Your clients log things. The app measures them and raises flags. The AI helps by suggesting. You decide. Then the client sees the result and the loop starts again.

There are three kinds of client. A **coaching** client gets everything: daily and weekly check-ins, workouts, nutrition, goals, roadmap, and you watch them closely. A **program-only** client buys the program without the coaching: they log workouts and a simple habit tracker, they have no check-in flow, and you see them in a separate view. A **starter** client has the lightest version: a home screen, workouts, a schedule and the library, with no progress or plan tabs by design.

Three promises the app keeps. One: the AI only suggests. Nothing changes a client's workouts, phase or target weight until you click approve. Two: missing data is never turned into a zero or a success. If nothing is logged you will see a dash or a plain sentence saying what is missing. Three: when you look at a client, you are looking at their numbers as of yesterday, because most clients log at the end of the day and you read it the next morning.

**Check yourself:** What are the three client types, and what is the one thing the AI is never allowed to do on its own?

---

## 2. Your morning, in ten minutes

Always start on the **Coach Dashboard**, the first item on the left, called Overview. Work from the top down. The order is the order of importance.

First, the number cards across the top: how many clients, how many are at risk, how many are quiet. Glance, don't dwell.

Second, **Alerts and At-Risk Clients**. Each row is a client the system thinks needs you. Click a row and a window opens: the Intervention window. At the top it says the primary issue. Under it is the evidence: the actual numbers that triggered the flag. Under that is the recommended intervention. If a Head Coach recommendation is waiting you can Approve it, Edit it, or Dismiss it. If none exists you will see rule-based next steps, and a button called Run quick review that asks the Head Coach to look at the latest check-in. The window also has tabs for Strength, Body, Data and History, so you can see the picture without leaving the dashboard. Remember: every number in that window stops at yesterday.

Third, **Onboarding alerts**: new clients stuck waiting on you. Fourth, **Plan Checkpoints Due** and **Phase Check-ins Due**: reassessments, nutrition reviews and phases that are ending. Fifth, **Client messages**: clients who asked you a question or flagged something in a weekly check-in. Last, if there is an **Upgrade Requests** box, a program-only client wants more coaching: that is revenue, answer it today.

You also get one email a day, around noon UTC, with a digest of the last day of check-ins. It is a summary, not a to-do list. The dashboard is the to-do list.

**Check yourself:** Where do you start every morning, and what does the Intervention window show you, in order?

---

## 3. A lead becomes a client

Leads live in **Leads / CRM**, the third item on the left. It is a board. Every person who fills in your public application shows up there with a status: New, Applied, Accepted, or one of the "not now" statuses: Closed Lost, Follow-up Later, Price Objection, Not Ready. Move a lead along as you talk to them. The "not now" statuses are not failures, they are a to-do: Follow-up Later and Price Objection are the ones to revisit.

When you mark someone **Accepted**, they can create their account. The system recognises their email and links the account to their lead. The first time they sign in, anything you pre-staged for them is claimed automatically.

Your habit as a high performer: clear the New column every day, never leave a lead without a status, and set a follow-up for every "not now".

**Check yourself:** Which statuses are really reminders to follow up later?

---

## 4. Day 0: onboarding and building the program

A new coaching client goes through a three-step gate. Step one belongs to the client: complete the assessment. Step two belongs to you: **Review assessment and goals**. Step three belongs to you: **Confirm roadmap and program**. Until you finish steps two and three, the dashboard shows the client in Onboarding alerts. That is the app nagging you, on purpose.

To build the program, open **Clients**, pick the client, and use the Quick Actions box. Click **More Actions**, then **Generate AI Program**. You choose a program template, which now comes from your Notion program library, not from the old Templates screen. The app reads the client's intake, builds a weekly split with real exercises, and also builds a nutrition plan with calories and macros. This can take up to about a minute. Read what it made. Edit exercises directly. The AI gives you a draft: you are the coach.

Then set the client's goal and milestones (section 8), build the roadmap (section 5), and tick **Confirm roadmap and program**. The client now sees a real plan.

**Check yourself:** Which two onboarding steps are yours, and where is the Generate AI Program button?

---

## 5. The roadmap: phases, checkpoints and moving a client forward

A roadmap is a list of phases, for example Foundation, Strength, Hypertrophy, Performance. Each phase has weeks, an objective, a training focus, and **exit criteria**: the things that must be true before you move the client on, like attendance of 80 percent or a lift hitting a target.

On a client's Overview you will find the **Program Roadmap** card. It has three buttons that matter.

**Edit Program** opens a four-step guided editor: Details, Phases, Exit Criteria, Review. It edits a copy, and nothing is saved until you click Save program on the last step. Step one also holds three real switches for that client. Show roadmap to client: turn it off and the client cannot see the roadmap at all. Enable progress tracking: turn it off and their Progress screens, status ring and milestone bars are hidden. Allow client to edit past check-ins: turn it off and they can only fill in today's daily check-in and this week's weekly one.

**Edit and Generate Roadmap** opens the long editor. This is where **Generate Roadmap** asks the AI to propose all the phases, and **Generate plan details** proposes, for each phase, a one-line reason, planned exercise changes with reasons, and checkpoints. Everything it makes is a proposal. Nothing is live until you click **Save Roadmap**. Each save writes a numbered snapshot to **Plan history**, so you can always see the original plan.

The **phase cards** underneath show each phase as Complete, Current or Upcoming. Click a phase name for four tabs: Overview, Activities, Criteria and Notes. On the Criteria tab you tick criteria off yourself. The app never ticks a criterion for you, and passing time never completes one.

**Checkpoints** are dated reminders inside a phase: reassessment, nutrition review, goal review, and a Day 90 review on the last phase. Clients can see them on their roadmap. They show up on your dashboard under Plan Checkpoints Due when they are within a week, and you mark them done.

**Moving a client to the next phase** is deliberate. On the next phase's card click **Draft workouts**. The app builds a draft from the client's current exercises plus the changes planned for that phase. It starts as an exact copy, and only changes what the plan says to change, so progress stays comparable. Edit the draft, save it, then click **Review and activate**. You will see exactly what will change: what stays, what is updated in place, what is replaced, what is added, what is retired. If the current phase still has unfinished exit criteria you must type a reason, and it is stored. Activate, and the client's workouts and phase change in one step. Nothing is ever deleted: retired exercises keep their history. If you change your mind, there is an **Undo this transition** button on the same screen.

Above the cards, the **Plan vs actual** box on the current phase gives advice such as On track, Behind, Review or Ready to advance. It only advises. Inside the current phase's window (click its name, Overview tab) there is also a **Deeper AI read** that you can ask for; you approve or reject it.

The current phase only changes when you activate the next phase. Saving a note or start date on the Program Phase tab never changes it. There is an emergency override that changes the label only, and it needs a written reason.

**Check yourself:** What are the three switches in Edit Program step one, and what must you do before activating a phase whose exit criteria are not finished?

---

## 6. Training and progression

Open a client, scroll to **Workout Review**, open a day, and open an exercise. You will see the charts, the recent log, and a **Progression** box. This is where each exercise gets its own progression rule.

Pick a method and fill in its settings. The methods the app can calculate for you are: **Double progression** (build reps inside a range, then add weight), **Linear progression** (add a fixed amount each time the full prescription is hit), **Percentage-based** (load as a percentage of a verified one-rep max, which you must supply), **APRE 3, 6 and 10** (the reps on a max set decide the next load, using the published adjustment tables), **Density progression** (more work in the same time, the same work faster, or more output per interval), and **Performance taper**, which is planned at the client level, not per exercise. **Conjugate** (Westside style) is built too. Set each exercise's role: **dynamic effort** gives you the week's speed-work load from a three-week wave of percentages of the one-rep max; **max effort** compares today's heavy single, double or triple with that variation's own best, shows which variation is scheduled this week and next, and flags you if the athlete has been at 90 percent or more for more than three weeks in a row.

Press **Calculate recommendation**. You get one of a small set of answers: Increase, Hold, Decrease, Progress, Regression, or a plain message that data is missing, with the reason. You can **Approve**, **Edit and approve** with your own number, or **Reject**. When you approve a load, the client's workout screen shows a **Coach target** for that exercise, and for APRE exercises it shows all four set loads. Your original calculation is kept untouched beside your decision.

The **Progression** page on the left has four tabs. **Review queue** lists every exercise with a logged session nobody has evaluated yet, plus every recommendation waiting for you: work it like an inbox. **Method reference** explains each method with a worked example calculated live. **Metric definitions** is the written definition of every score. **AI program notes** is the older free text the AI reads when it builds a new program; it does not calculate anything.

When you change an exercise's method the app asks why and keeps a **Method history**: what it was, what it became, your reason, and the target in force at the time. Workout history is never rewritten.

Two rules of discipline. One bad session is a data point, not a decision. And never approve a progression on incomplete data. The app will say so when data is missing: believe it.

**Check yourself:** Which methods need a verified one-rep max from you, and what does the client see after you approve a load?

---

## 7. Tapers

A taper cuts volume before an event, such as a meet or a test, while intensity stays where you set it. On the client's Overview find **Performance Taper** and click **New taper**. Give it the event date, how many days, the percentage to reduce volume by, how to measure volume, which two weeks of training count as the baseline, and the training days. Press **Calculate preview**. You see the baseline, the target, every session and any warnings, or the exact thing to fix. Only a valid preview can be created. The suggested 7 to 14 days and 30 to 60 percent are starting points, not rules: you decide for this athlete.

After it is created you can see session-by-session volumes, review flags from readiness and pain if you configured them, and override any session with a required note. The original calculation can never be edited, and every override is kept in a history that cannot be changed. The taper ends the day before the event and never restarts or extends on its own.

**Check yourself:** What does the engine change in a taper, and what does it leave alone?

---

## 8. Nutrition

Each coaching client has a nutrition plan with calories and macros. From the client, **Quick Actions, More Actions, Update nutrition plan** lets you adjust it. Clients log food on the Nutrition page, per meal, from your food library, and also type totals on the daily check-in. The two are added together for each day.

The one **nutrition score** you see everywhere is the same number: how closely logged intake matches the plan, adjusted for how many days they actually logged. Days with nothing logged pull it down; they are never treated as on target. If a client has no plan or has logged no macros yet, the app falls back to their self-rated diet answer and tells you it did. Do not treat those two as the same thing.

Food search for clients only shows foods you have published. Foods are published from your Notion food library: fill in the nutrients and source, then change the verification status from Entered to your verified status, and the daily sync publishes them. Until you do that, food search is empty.

**Check yourself:** Why can a client look great on nutrition on one screen and poor on another? (Answer: they can't anymore. There is one score. If two screens disagree, report it.)

---

## 9. Goals, milestones and reading the numbers

Open **Goals** on a client. The weight goal has a baseline, a target and a date. The **goal score** blends progress toward the goal with behaviour: nutrition, training, recovery and habits. If the goal is under a week old, or the client has not weighed in during the last seven days, it says Gathering Data. The client sees Weigh-In Needed if they are checking in, and Not Enough Data only if they are not. That is a prompt, not a fail.

**Milestones** are exercise targets. Clients see them as sideways bars from where they started to the target. When one is hit, a Milestone Hit pop-up appears on that client's page, and you acknowledge it. Say something to the client, because this is the moment they care.

Know your numbers. Training adherence is completed sessions divided by completed plus missed. A rest day is neither. Check-in consistency is how often they log. Habit adherence counts every day in the window, so a brand-new habit looks worse than it is. Every metric's full definition is in Progression, Metric definitions.

**Check yourself:** Does a rest day lower a client's training adherence?

---

## 10. Check-ins, flags, interventions and the Head Coach

Clients log a **daily check-in** on the Today screen: targets and habits, weight, nutrition, sleep, energy and mood, and whether they trained, rested or missed. They also do a **weekly check-in** with body measurements, how it felt, and questions for you.

The system turns that into flags. **Needs attention** is about progress toward the goal. **Logging status** (good, fair, poor) is about whether they are showing up at all. They are kept separate on purpose: a quiet client and an off-track client need different conversations.

The **Head Coach** is the AI reviewer. On a client open the **Head Coach** tab and click **Review This Check-In**. It checks the rules first, and only then asks the AI. You get an observation and a recommendation. You can Approve, Modify, Defer or Reject. After an approved recommendation you carry it out yourself, then **Record outcome** so the system learns whether it helped. If it suggests a message to the client you can send it through Coach Messages, and you review it before it goes out.

If a review ever shows "the server hit an error", try again once and tell your developer: that is not normal.

**Check yourself:** What is the difference between Needs attention and Logging status?

---

## 11. Business and content

**Business + Content** is your daily numbers page: outreach and content metrics you type in, rolled up by week. It is manual, so it is only as good as your daily habit. Two minutes at the end of each day.

**Assessments** lets you pre-assess a prospect and saves it by email before they sign up. **Library** is where you keep guides, recipes and resources clients can browse. The old **Templates** screen has been removed: program generation reads templates from your Notion library.

**Check yourself:** Where do program templates now live?

---

## 12. What your client sees

Your coaching client's **Home** shows their status, reminders, today's check-in, their roadmap with the current phase and quick stats, milestone bars, and a nutrition card with a calorie ring and macro bars. **Check-In** is where they do daily and weekly. **Workouts** is where they log sets: there is a warm-up tick on every set, an optional RIR or RPE box when you asked for one, a **rest timer** pinned at the bottom of the phone that beeps and vibrates when rest is over (iPhones beep but cannot vibrate), and your **Coach target** where you approved one. **Progress** shows charts. **More** holds Nutrition, Schedule, the Library, their Program, and First 30 Days (the Day 0 to Day 30 journey).

If you turned a switch off in Edit Program, the client simply does not see that thing. They are not told it was hidden.

**Check yourself:** What does a client see on their phone while resting between sets?

---

## 13. Your weekly and monthly operating system

**Every day:** the ten-minute dashboard pass, the Progression review queue, clear the New leads, log your business numbers.

**Every week:** read each client's weekly check-in notes and questions; answer every question; check Plan Checkpoints Due; scan the Progression review queue; review any client who is Behind on plan-vs-actual; update any phase that is ending.

**Every month:** the AI generates a recap summary per client: read it and send the good ones; review the goal insight for clients who are off track; review nutrition targets against body-weight trend; look at who is quiet; check upgrade requests; do a plan-history look at any client whose roadmap you changed.

**Before any event:** build the taper at least two weeks ahead.

**When something looks wrong:** a screen that errors or a number that disagrees with another is a bug to report, not something to work around.

**Check yourself:** Name two things you do daily and two you do weekly.

---

## 14. Rules of thumb for a high performer

- Read first, act second: open the evidence before you click approve.
- Move one thing at a time. Change the program, then wait to see the data, then decide again.
- Never progress a client on missing data.
- Silence is a signal. A client who stops logging needs a message today, not a flag next week.
- Write the reason when you override or change a method. Future you will thank you.
- The AI proposes, you dispose. If a proposal does not sound like you, edit it before it reaches the client.
- Trust the dash. If a number is blank, there is nothing there yet. Ask the client to log, don't guess.

_End of script. Now read `03_CHECKLISTS.md` aloud and have the coach say each checklist back in their own words._
