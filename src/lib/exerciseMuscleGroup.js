// Maps an exercise name to one of the 11 muscle groups in the Notion
// "Muscle Group Diagrams" source (Full Body, Chest, Back, Shoulders,
// Biceps, Triceps, Quads, Hamstrings, Glutes, Calves, Core / Abs) --
// replaces WorkoutMannequin's old 4-bucket (upper/lower/core/cardio) name
// classifier now that there's a specific diagram per muscle group instead
// of one pose per coarse region. No `category` DB column reliance, same
// reasoning as before: that column is dual-purpose (AI training-pillar
// value vs. free-text coach label) and can't be trusted for body-region
// mapping.
//
// Rules are checked in order, most specific first, so a compound name like
// "Incline DB Press + Cable Fly" doesn't get caught by an earlier, broader
// pattern. Cardio/compound-olympic movements have no dedicated diagram in
// the source set, so they fall under Full Body deliberately (not a miss).
const RULES = [
  { group: "Full Body", re: /\bclean\b|\bsnatch\b|thruster|burpee|kettlebell swing|turkish get-?up|farmer'?s? (carry|walk)|\brun\b|running|sprint|\bbike\b|rowing machine|row erg|ski erg|jump rope|mountain climber|elliptical|\bstair/i },
  { group: "Hamstrings", re: /\brdl\b|romanian dead ?lift|leg curl|good morning|glute[- ]ham raise|stiff[- ]leg dead ?lift|nordic curl/i },
  { group: "Glutes", re: /hip thrust|glute bridge|glute kickback|cable kickback|hip abduction|donkey kick/i },
  { group: "Quads", re: /\bsquat\b|leg press|\blunge\b|leg extension|split squat|step-?up|hack squat|front squat|goblet squat/i },
  { group: "Calves", re: /calf raise|calf press/i },
  { group: "Core / Abs", re: /\bplank\b|crunch|sit-?up|ab wheel|russian twist|leg raise|dead ?bug|hollow hold|woodchopper|\babs?\b|\bcore\b/i },
  { group: "Back", re: /\brow\b|pulldown|pull-?up|chin-?up|\blat\b|dead ?lift|back extension|\bshrug/i },
  { group: "Triceps", re: /tricep|pushdown|skull ?crusher|overhead extension|close[- ]grip bench|tricep dip|bench dip/i },
  { group: "Biceps", re: /bicep|\bcurl\b|preacher|concentration curl/i },
  { group: "Shoulders", re: /shoulder press|overhead press|military press|arnold press|lateral raise|front raise|rear delt|face pull|upright row/i },
  { group: "Chest", re: /bench press|chest press|incline press|decline press|\bfly\b|pec deck|push-?up|\bdip\b/i },
];

// Cardio/compound movements matched by the Full Body rule ARE a confident
// match (there's just no dedicated diagram for them) -- only a name that
// hits none of these rules is a real gap in the keyword mapping.
export function muscleGroupForExercise(name = "") {
  const n = String(name);
  for (const { group, re } of RULES) {
    if (re.test(n)) return { group, confident: true };
  }
  return { group: "Full Body", confident: false };
}
