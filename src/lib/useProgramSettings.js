import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient.js";
import { trainingOwnerId } from "../theme.jsx";

// The coach's per-program switches, as the CLIENT's screens need them. Defaults
// are today's behaviour, and they are also what's used while loading or if the
// settings can't be read — a failure never locks a client out of anything.
// (The two that protect data — roadmap visibility and check-in editing — are
// enforced in the database too; this only keeps the UI from offering what the
// database will refuse.)
const DEFAULTS = { loaded: false, showRoadmap: true, progressTracking: true, clientCanEditCheckins: true };

export function useProgramSettings(profile) {
  const [s, setS] = useState(DEFAULTS);
  useEffect(() => {
    if (!profile?.id) return;
    let live = true;
    const cols = "show_roadmap_to_client,progress_tracking_enabled,client_can_edit_checkins";
    const latest = (clientId) => supabase.from("programs").select(cols).eq("client_id", clientId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    Promise.all([latest(trainingOwnerId(profile)), latest(profile.id)]).then(([owner, own]) => {
      if (!live) return;
      setS({
        loaded: true,
        showRoadmap: owner.data?.show_roadmap_to_client ?? true,
        progressTracking: owner.data?.progress_tracking_enabled ?? true,
        clientCanEditCheckins: own.data?.client_can_edit_checkins ?? true,
      });
    });
    return () => { live = false; };
  }, [profile?.id, profile?.shared_program_owner_id]);
  return s;
}
