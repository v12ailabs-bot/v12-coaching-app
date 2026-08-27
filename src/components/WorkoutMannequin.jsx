import { useState, useEffect } from "react";
import { S } from "../theme.jsx";
import { supabase } from "../supabaseClient.js";
import { muscleGroupForExercise } from "../lib/exerciseMuscleGroup.js";

// The 4-pose SVG line-art set below was the original icon (approved for the
// workout redesign, no per-exercise/muscle-group illustration existed
// before it). It's now only the fallback while exercise_diagrams hasn't
// loaded yet, or has no synced image for a given muscle group -- the
// primary render is the real muscle-group diagram synced from Notion (see
// scripts/sync-exercise-diagrams.mjs), matched via muscleGroupForExercise.
//
// Fetched once per page load and shared across every WorkoutMannequin
// instance (a workout screen renders this many times per render) rather
// than one Supabase call per icon.
let diagramsPromise = null;
function loadDiagrams() {
  if (!diagramsPromise) {
    diagramsPromise = supabase.from("exercise_diagrams").select("muscle_group,image_url")
      .then(({ data }) => Object.fromEntries((data || []).map((d) => [d.muscle_group, d.image_url])));
  }
  return diagramsPromise;
}

function UpperBodyPose({ size, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 60 80" fill="none">
      <circle cx="30" cy="12" r="8" stroke={color} strokeWidth="2.5" />
      <path d="M30 20 V46" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      {/* Arms raised in a pulling motion */}
      <path d="M30 26 L14 8 M30 26 L46 8" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M30 46 L18 44 M30 46 L42 44" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M30 46 L22 72 M30 46 L38 72" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function LowerBodyPose({ size, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 60 80" fill="none">
      <circle cx="30" cy="12" r="8" stroke={color} strokeWidth="2.5" />
      <path d="M30 20 V38" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M30 24 L16 32 M30 24 L44 32" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      {/* Bent legs in a squat stance */}
      <path d="M30 38 L18 52 L20 72" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M30 38 L42 52 L40 72" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CorePose({ size, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 60 80" fill="none">
      {/* Plank silhouette, rotated to read horizontally within the box */}
      <circle cx="12" cy="40" r="7" stroke={color} strokeWidth="2.5" />
      <path d="M19 40 H44" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M24 40 L20 30 M32 40 L34 28" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M44 40 L52 30 M44 40 L52 50" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M19 40 L14 58" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function CardioPose({ size, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 60 80" fill="none">
      <circle cx="26" cy="12" r="8" stroke={color} strokeWidth="2.5" />
      <path d="M26 20 L34 40" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      {/* Running arm/leg swing */}
      <path d="M34 26 L48 18 M34 26 L22 34" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M34 40 L48 46 L44 66" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M34 40 L18 52 L24 72" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const POSES = { upper: UpperBodyPose, lower: LowerBodyPose, core: CorePose, cardio: CardioPose };

// Name-keyword category mapping (approved): checks the more specific
// categories first (lower/core/cardio), falls back to upper body for
// everything else, including any unmatched name. "row"/"cable row"/"barbell
// row" (a pulling exercise) stays upper body; only "rowing machine"/"row
// erg" reads as cardio.
const LOWER_BODY_WORDS = /squat|lunge|deadlift|rdl|leg press|leg curl|leg extension|calf|glute|hip thrust|step-?up|bulgarian/i;
const CORE_WORDS = /plank|crunch|sit-?up|\babs?\b|\bcore\b|russian twist|dead ?bug|hollow|leg raise|woodchopper/i;
const CARDIO_WORDS = /\brun\b|running|sprint|\bbike\b|rowing machine|row erg|ski erg|jump rope|burpee|mountain climber|elliptical|\bstair/i;

export function poseForExercise(name = "") {
  const n = String(name);
  if (CARDIO_WORDS.test(n)) return "cardio";
  if (LOWER_BODY_WORDS.test(n)) return "lower";
  if (CORE_WORDS.test(n)) return "core";
  return "upper";
}

// `color` only affects the SVG fallback pose -- a synced diagram is a raster
// image at whatever colors it was uploaded in, so it renders as-is. The
// surrounding button/card already conveys selection via its own border and
// background tint (see App.jsx's exercise selector pills), so dropping the
// icon's own recoloring isn't a loss of the selection affordance.
export function WorkoutMannequin({ exerciseName, size = 56, color }) {
  const [diagrams, setDiagrams] = useState(null);
  useEffect(() => { loadDiagrams().then(setDiagrams); }, []);

  const { group } = muscleGroupForExercise(exerciseName);
  const imageUrl = diagrams?.[group];
  if (imageUrl) {
    return <img src={imageUrl} alt={`${group} diagram`} width={size} height={size} style={{ objectFit: "contain" }} />;
  }
  const pose = poseForExercise(exerciseName);
  const Pose = POSES[pose];
  return <Pose size={size} color={color || S.muted} />;
}
