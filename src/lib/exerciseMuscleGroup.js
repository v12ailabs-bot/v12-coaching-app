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
// Rules are checked in order, most specific single-muscle drills first, so
// e.g. "Clamshell + Glute Med Band Walk" hits Glutes before anything
// generic. The COMPOUND rule (explosive/olympic-style full-body lifts) is
// checked before the single-muscle tiers since none of its keywords
// (clean/snatch/thruster/etc.) overlap with them. GENERIC_FULL_BODY is
// checked LAST, after every specific tier has had a chance — it exists
// for warm-ups/cooldowns/mobility flows/stretches/conditioning circuits/
// cardio-equipment names that genuinely don't target one muscle group, so
// those count as a confident Full Body match rather than a real miss.
const COMPOUND = { group: "Full Body", re: /\bclean\b|\bsnatch\b|thruster|burpee|(kettlebell|kb|dumbbell)\s*swings?|turkish get-?up|farmer'?s? ?(carry|walk|hold)|box jumps?|broad jumps?|medicine ball|med ball|sled push/i };

const SPECIFIC_RULES = [
  { group: "Hamstrings", re: /\brdl\b|romanian dead ?lift|leg curls?|hamstring curls?|good morning|glute[- ]ham raise|stiff[- ]leg dead ?lift|nordic curl/i },
  { group: "Glutes", re: /hip thrust|glute bridge|glute kickback|cable kickback|hip abduction|donkey kick|clamshell|lateral( band)? walk|monster walk|band walk/i },
  { group: "Quads", re: /\bsquats?\b|leg press|\blunges?\b|leg extensions?|leg extentions?|split squat|step-?up|hack squat|front squat|goblet squat|terminal knee extension|\btke\b|sit-to-stand|sit to stand/i },
  { group: "Calves", re: /calf raises?|calf press/i },
  { group: "Core / Abs", re: /\bplank\b|crunch|sit-?up|ab wheel|russian twist|knee raises?|leg raises?|dead ?bug|hollow (body )?holds?|wood ?chop|\babs?\b|\babdominal\b|\bcore\b|pallof|anti-rotation|bird dog|toes?[\s-]*to[\s-]*bar/i },
  { group: "Back", re: /\brows?\b|pulldown|pull[\s-]?ups?|chin[\s-]?ups?|\blat\b|dead ?lift|back extension|\bshrug/i },
  { group: "Triceps", re: /tricep|pushdown|skull ?crusher|overhead extension|close[- ]grip bench|tricep dips?|bench dips?/i },
  { group: "Biceps", re: /bicep|curls?|preacher|concentration curl/i },
  { group: "Shoulders", re: /shoulder press|overhead press|military press|arnold press|push press|lateral raise|front raise|rear delt|face pull|upright row|shoulder dislocate|scap(ular)? wall slide/i },
  { group: "Chest", re: /bench press|chest press|incline press|decline press|\bflys?\b|pec deck|push[\s-]?ups?|\bdips?\b|\bflat\b.*\b(bench|press)\b|\bincline\b.*\b(bench|press)\b|floor press/i },
];

// Generic recovery/conditioning content and cardio-equipment name variants
// that don't target one specific muscle group — a confident Full Body
// match, not a gap, since there's no single-body-part diagram that would
// be more correct for "Full-Body Dynamic Warm-Up" or "RowErg Intervals".
const GENERIC_FULL_BODY = /warm-?up|cool-?down|mobility|\bflow\b|stretch|breathing|circuit|conditioning|finisher|metcon|\bemom\b|cat-?cow|cat-?camel|band pull-?apart|treadmill|\brower\b|rowing|row\s*erg|ski\s*erg|\brun\b|running|sprint|\bjog\b|\bbike\b|\bwalk\b|jump rope|mountain climber|elliptical|\bstair|speed work/i;

export function muscleGroupForExercise(name = "") {
  const n = String(name);
  if (COMPOUND.re.test(n)) return { group: "Full Body", confident: true };
  for (const { group, re } of SPECIFIC_RULES) {
    if (re.test(n)) return { group, confident: true };
  }
  if (GENERIC_FULL_BODY.test(n)) return { group: "Full Body", confident: true };
  return { group: "Full Body", confident: false };
}
