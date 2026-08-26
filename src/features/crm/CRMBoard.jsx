import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../supabaseClient.js";
import { S, RADIUS, todayStr } from "../../theme.jsx";
import { PageTitle, Btn } from "../../components/ui/index.js";
import { COLUMNS } from "./crmHelpers.js";
import { LeadCard } from "./LeadCard.jsx";
import { LeadModal } from "./LeadModal.jsx";
import { TodayPanel } from "./TodayPanel.jsx";
import { PendingStarterCheckouts } from "./PendingStarterCheckouts.jsx";

const selStyle = { background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "8px 12px", fontSize: 12, outline: "none" };

const SORTS = {
  follow_up: { label: "Follow-up date (soonest)", fn: (a, b) => (a.follow_up_date || "9999-99-99") < (b.follow_up_date || "9999-99-99") ? -1 : 1 },
  newest: { label: "Newest added", fn: (a, b) => (a.created_at < b.created_at ? 1 : -1) },
  name: { label: "Name (A-Z)", fn: (a, b) => (a.name || a.email || "").localeCompare(b.name || b.email || "") },
};

// Kanban pipeline replacing the old flat status-tab list — same leads table,
// same add/accept/reject/sync logic, reorganized into 4 columns + a Today
// panel per the reference design. See crmHelpers.js for the 7-status ->
// 4-column mapping and what happens to closed_lost.
export function CRMBoard() {
  const [leads, setLeads] = useState([]);
  const [clientProfiles, setClientProfiles] = useState({}); // client_id -> profile, for converted leads' lifecycle badge
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusView, setStatusView] = useState("active"); // "active" | "closed_lost"
  const [dueOnly, setDueOnly] = useState(false);
  const [followupOnly, setFollowupOnly] = useState(false);
  const [sortKey, setSortKey] = useState("follow_up");
  const [showAdd, setShowAdd] = useState(false);
  const [activeLeadId, setActiveLeadId] = useState(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("leads").select("*").order("created_at", { ascending: false });
    setLeads(data || []);
    const clientIds = [...new Set((data || []).map((l) => l.client_id).filter(Boolean))];
    if (clientIds.length) {
      const { data: profiles } = await supabase.from("profiles")
        .select("id,client_type,starter_expires_at,program_payment_status,starter_purchase_count").in("id", clientIds);
      setClientProfiles(Object.fromEntries((profiles || []).map((p) => [p.id, p])));
    } else {
      setClientProfiles({});
    }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const syncToNotionCrm = (email, patch) => {
    if (!email) return;
    supabase.auth.getSession().then(({ data: { session } }) =>
      fetch("/api/sync-lead-to-notion", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
        body: JSON.stringify({ email, patch }),
      })
    ).catch(() => {});
  };

  const updateLead = async (id, patch) => {
    const lead = leads.find((l) => l.id === id);
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    await supabase.from("leads").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    syncToNotionCrm(lead?.email, patch);
  };

  const addLead = async (form) => {
    const payload = {
      name: form.name.trim(), email: form.email.trim().toLowerCase(),
      goal: form.goal || null, channel: form.channel || null, stage: form.stage || null,
      response_rate: form.response_rate || null,
      deal_value: form.deal_value === "" ? null : Number(form.deal_value),
      follow_up_date: form.follow_up_date || null, last_contact_date: form.last_contact_date || null,
      notes: form.notes.trim() || null,
      dm_opener_sent: form.dm_opener_sent, application_submitted: form.application_submitted,
      call_booked: form.call_booked, moved_to_whatsapp: form.moved_to_whatsapp,
      source: "manual", status: "new",
    };
    const { error } = await supabase.from("leads").insert(payload);
    if (error) return { ok: false, text: error.message };
    syncToNotionCrm(payload.email, payload);
    await load();
    return { ok: true, text: `${payload.name} added.` };
  };

  const accept = async (lead) => {
    const { data: match } = await supabase.from("profiles").select("id").ilike("email", lead.email).maybeSingle();
    await updateLead(lead.id, { status: "accepted", client_id: match?.id || null });
  };
  const reject = async (lead, status) => updateLead(lead.id, { status });

  if (loading) return <div className="spinner" style={{ margin: "80px auto" }} />;

  const today = todayStr();
  const q = search.trim().toLowerCase();
  let pool = leads.filter((l) => !q || (l.name || "").toLowerCase().includes(q) || (l.email || "").toLowerCase().includes(q));
  if (dueOnly) pool = pool.filter((l) => l.follow_up_date && l.follow_up_date <= today);
  if (followupOnly) pool = pool.filter((l) => l.needs_sales_followup);
  pool = [...pool].sort(SORTS[sortKey].fn);

  const closedLostCount = leads.filter((l) => l.status === "closed_lost").length;
  const dueCount = leads.filter((l) => l.follow_up_date && l.follow_up_date <= today).length;
  const followupCount = leads.filter((l) => l.needs_sales_followup).length;
  const activeLead = activeLeadId ? leads.find((l) => l.id === activeLeadId) : null;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <PageTitle title="Leads / CRM" sub="Track and manage inquiries through your coaching pipeline" />
        </div>
        <Btn onClick={() => setShowAdd(true)}>+ Add Lead</Btn>
      </div>

      <PendingStarterCheckouts />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 20 }}>
        <input
          type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search leads..."
          style={{ ...selStyle, minWidth: 200, flex: "1 1 200px" }}
        />
        <select value={statusView} onChange={(e) => setStatusView(e.target.value)} style={selStyle}>
          <option value="active">All active</option>
          <option value="closed_lost">Closed Lost ({closedLostCount})</option>
        </select>
        <button
          onClick={() => setDueOnly((v) => !v)}
          style={{ padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", borderRadius: RADIUS.sm, border: "1px solid " + (dueOnly ? S.danger : S.border), background: dueOnly ? "rgba(255,107,91,.1)" : "transparent", color: dueOnly ? S.danger : S.muted }}
        >
          Follow-up due ({dueCount})
        </button>
        <button
          onClick={() => setFollowupOnly((v) => !v)}
          title="Leads explicitly flagged as needing active sales follow-up — distinct from just existing in the pipeline"
          style={{ padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", borderRadius: RADIUS.sm, border: "1px solid " + (followupOnly ? S.accent : S.border), background: followupOnly ? "rgba(255,106,0,.1)" : "transparent", color: followupOnly ? S.accent : S.muted }}
        >
          🚩 Needs Follow-Up ({followupCount})
        </button>
        <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} style={selStyle}>
          {Object.entries(SORTS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
        </select>
      </div>

      <div className="crm-layout" style={{ display: "grid", gridTemplateColumns: "minmax(0,3fr) minmax(0,1fr)", gap: 20, alignItems: "start" }}>
        {statusView === "closed_lost" ? (
          <div style={{ minWidth: 0 }}>
            {pool.filter((l) => l.status === "closed_lost").length === 0 ? (
              <div style={{ color: S.muted, fontSize: 13 }}>No closed-lost leads.</div>
            ) : pool.filter((l) => l.status === "closed_lost").map((l) => (
              <LeadCard key={l.id} lead={l} clientProfile={l.client_id ? clientProfiles[l.client_id] : null}
                onToggleFollowup={() => updateLead(l.id, { needs_sales_followup: !l.needs_sales_followup })}
                onClick={() => setActiveLeadId(l.id)} />
            ))}
          </div>
        ) : (
          <div className="crm-columns" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(220px,1fr))", gap: 14, minWidth: 0, overflowX: "auto" }}>
            {COLUMNS.map((col) => {
              const colLeads = pool.filter((l) => col.statuses.includes(l.status));
              return (
                <div key={col.key} style={{ background: S.surface, border: "1px solid " + S.border, borderRadius: RADIUS.lg, padding: 12, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 16 }}>{col.label}</div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: S.surface2, color: S.muted }}>{colLeads.length}</span>
                  </div>
                  <div style={{ maxHeight: 560, overflowY: "auto" }}>
                    {colLeads.length === 0 ? (
                      <div style={{ fontSize: 11, color: S.muted, padding: "8px 0" }}>No leads here.</div>
                    ) : colLeads.map((l) => (
                      <LeadCard key={l.id} lead={l} clientProfile={l.client_id ? clientProfiles[l.client_id] : null}
                        onToggleFollowup={() => updateLead(l.id, { needs_sales_followup: !l.needs_sales_followup })}
                        onClick={() => setActiveLeadId(l.id)} />
                    ))}
                  </div>
                  <button
                    onClick={() => setShowAdd(true)}
                    style={{ width: "100%", background: "none", border: "1px dashed " + S.border, borderRadius: RADIUS.sm, color: S.muted, fontSize: 11, fontWeight: 600, padding: "8px 0", cursor: "pointer", marginTop: 6 }}
                  >
                    + Add lead
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <TodayPanel leads={leads} onOpen={(l) => setActiveLeadId(l.id)} />
      </div>

      {showAdd && <LeadModal lead={null} onClose={() => setShowAdd(false)} onAdd={addLead} />}
      {activeLead && (
        <LeadModal
          lead={activeLead}
          onClose={() => setActiveLeadId(null)}
          onUpdate={updateLead}
          onAccept={(l) => accept(l)}
          onReject={(l, s) => reject(l, s)}
        />
      )}
    </div>
  );
}
