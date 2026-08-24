import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../supabaseClient.js";
import { S } from "../../../theme.jsx";
import { Card, CardTitle, Inp, Btn } from "../../../components/ui/index.js";

// Coach defines the client's daily habits; the client checks them off.
// `embedded` skips the outer Card/title so this can nest inside another
// card (e.g. DailyHabitsPanel's combined manage+adherence layout) without a
// redundant double border/title. `onChanged` lets a parent showing adherence
// data alongside this list refresh after an add/remove.
export function CoachHabits({ clientId, embedded = false, onChanged }) {
  const [habits, setHabits] = useState([]);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("habits").select("*").eq("client_id", clientId).eq("active", true).order("order_index");
    setHabits(data || []);
  }, [clientId]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await supabase.from("habits").insert({ client_id: clientId, name: name.trim(), order_index: habits.length });
    setName(""); setSaving(false); load(); onChanged?.();
  };
  const remove = async (h) => {
    await supabase.from("habits").update({ active: false }).eq("id", h.id);
    load(); onChanged?.();
  };

  const body = (
    <>
      {!embedded && <div style={{ fontSize: 11, color: S.muted, marginBottom: 14 }}>These appear on the client's Habits page to check off each day.</div>}
      {habits.length === 0 && <div style={{ color: S.muted, fontSize: 13, marginBottom: 12 }}>No habits set yet.</div>}
      {habits.map((h) => (
        <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: "1px solid " + S.border }}>
          <span style={{ fontSize: 13 }}>{h.name}</span>
          <button onClick={() => remove(h)} style={{ background: "none", border: "none", color: S.danger, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>Remove</button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <Inp type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 10k steps, 1 gallon water, sleep 8h"
          onKeyDown={(e) => e.key === "Enter" && add()} style={{ flex: 1 }} />
        <Btn sm onClick={add} disabled={saving}>{saving ? "..." : "+ Add"}</Btn>
      </div>
    </>
  );

  if (embedded) return body;
  return (
    <Card style={{ marginBottom: 20 }}>
      <CardTitle>Manage Habits</CardTitle>
      {body}
    </Card>
  );
}
