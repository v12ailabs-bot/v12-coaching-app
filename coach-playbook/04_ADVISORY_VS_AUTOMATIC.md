# What the app does by itself vs. what only you can do

## Happens automatically
- Scores and flags are recalculated every time a screen opens (no stale cache).
- Daily email digest of the last day of check-ins (around 12:00 UTC).
- Daily food-library sync from Notion (around 08:30 UTC); only foods you have marked verified get published.
- The rest timer starts after each logged set (client can switch it off); sound and vibration at zero.
- Clients are locked out of what you switched off in Edit Program (roadmap hidden, past check-in edits blocked), enforced by the database for those two.
- Immutable records: your original calculations, plan history, taper originals and override logs cannot be rewritten.

## Suggested by the app or AI, only done if you click
- AI program, nutrition plan, roadmap, plan details, goal insight, phase recommendation, monthly recap, Head Coach recommendation.
- Progression recommendations (increase / hold / decrease / progress / regression).
- Plan vs actual advice and "Ready to advance".
- Draft workouts for the next phase.
- Taper plans (calculated from the client's own logs).

## Only you can do
- Approve, edit or reject any recommendation.
- Tick an exit criterion complete. Time passing never does it.
- Activate a phase (changes the client's real workouts) and undo it.
- Publish a food (set verification status in Notion).
- Decide whether to flag, message, or change a client's targets.
- Move a lead's status.
