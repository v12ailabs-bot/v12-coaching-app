import { useState } from "react";
import { S } from "../../theme.jsx";
import { Modal, Fld, Inp, RG, Btn, Alert } from "../../components/ui/index.js";
import { INTAKE_FIELDS } from "../../lib/constants.js";
import {
  LEAD_STATUS_LABEL, REJECT_STATUSES, CRM_GOAL_OPTIONS, CRM_CHANNEL_OPTIONS,
  CRM_STAGE_OPTIONS, CRM_RESPONSE_RATE_OPTIONS, BLANK_MANUAL_LEAD,
} from "./crmHelpers.js";

const CHECKBOXES = [
  ["dm_opener_sent", "DM Opener Sent"],
  ["application_submitted", "Application Submitted"],
  ["call_booked", "Call Booked"],
  ["moved_to_whatsapp", "Moved to WhatsApp"],
];

// One modal, two modes: `lead == null` is the "+ Add Lead" cold-outreach
// form; a real `lead` is the full detail/edit view. Same field set and
// save/accept/reject logic as the old inline-expanding CRMPanel card —
// just presented as a focused overlay instead of an inline accordion, since
// kanban columns are too narrow to expand a form of this size in place.
export function LeadModal({ lead, onClose, onAdd, onUpdate, onAccept, onReject }) {
  const isAdd = lead == null;
  const [form, setForm] = useState(isAdd ? BLANK_MANUAL_LEAD : null);
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState(null);
  const setField = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const submitAdd = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      setMsg({ ok: false, text: "Name and email are required." });
      return;
    }
    setAdding(true); setMsg(null);
    const result = await onAdd(form);
    setAdding(false);
    if (!result.ok) { setMsg({ ok: false, text: result.text }); return; }
    setMsg({ ok: true, text: result.text });
    setForm(BLANK_MANUAL_LEAD);
  };

  if (isAdd) {
    return (
      <Modal title="Add Lead" onClose={onClose}>
        <div style={{ fontSize: 12, color: S.muted, marginBottom: 16 }}>Log a cold-outreach contact — lands in New.</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Fld label="Name *"><Inp type="text" value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="Full name" /></Fld>
          <Fld label="Email *"><Inp type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} placeholder="name@email.com" /></Fld>
        </div>
        <Fld label="Goal"><RG options={CRM_GOAL_OPTIONS} value={form.goal} onChange={(v) => setField("goal", v)} /></Fld>
        <Fld label="Source"><RG options={CRM_CHANNEL_OPTIONS} value={form.channel} onChange={(v) => setField("channel", v)} /></Fld>
        <Fld label="Stage"><RG options={CRM_STAGE_OPTIONS} value={form.stage} onChange={(v) => setField("stage", v)} /></Fld>
        <Fld label="Response Rate"><RG options={CRM_RESPONSE_RATE_OPTIONS} value={form.response_rate} onChange={(v) => setField("response_rate", v)} /></Fld>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          <Fld label="Deal Value ($)"><Inp type="number" value={form.deal_value} onChange={(e) => setField("deal_value", e.target.value)} placeholder="e.g. 1500" /></Fld>
          <Fld label="Follow-up Date"><Inp type="date" value={form.follow_up_date} onChange={(e) => setField("follow_up_date", e.target.value)} /></Fld>
          <Fld label="Last Contact Date"><Inp type="date" value={form.last_contact_date} onChange={(e) => setField("last_contact_date", e.target.value)} /></Fld>
        </div>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", margin: "4px 0 16px" }}>
          {CHECKBOXES.map(([k, label]) => (
            <label key={k} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: S.muted, cursor: "pointer" }}>
              <input type="checkbox" checked={form[k]} onChange={(e) => setField(k, e.target.checked)} /> {label}
            </label>
          ))}
        </div>
        <Fld label="Notes">
          <textarea rows={2} value={form.notes} onChange={(e) => setField("notes", e.target.value)}
            style={{ width: "100%", background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "10px 14px", fontSize: 13, outline: "none", fontFamily: "inherit" }} />
        </Fld>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Btn onClick={submitAdd} disabled={adding}>{adding ? "Adding..." : "Add Lead"}</Btn>
          <Alert variant={msg?.ok ? "success" : "error"}>{msg?.text}</Alert>
        </div>
      </Modal>
    );
  }

  return <LeadEditModal lead={lead} onClose={onClose} onUpdate={onUpdate} onAccept={onAccept} onReject={onReject} />;
}

function LeadEditModal({ lead, onClose, onUpdate, onAccept, onReject }) {
  const [notes, setNotes] = useState(lead.notes || "");
  const [invoiceLink, setInvoiceLink] = useState(lead.invoice_link || "");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Modal title={lead.name || lead.email} onClose={onClose}>
      <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700, color: S.accent, marginBottom: 16 }}>
        {LEAD_STATUS_LABEL[lead.status] || lead.status}
      </div>

      {lead.height && <div style={{ fontSize: 12, color: S.muted, marginBottom: 8 }}>Height: {lead.height}</div>}
      {lead.intake_data?.packageInterest && (
        <div style={{ fontSize: 12, color: S.text, marginBottom: 8 }}>Package: <strong>{lead.intake_data.packageInterest}</strong></div>
      )}
      {lead.intake_data && (
        <details style={{ marginBottom: 16 }}>
          <summary style={{ fontSize: 12, color: S.muted, cursor: "pointer" }}>Full intake data</summary>
          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
            {Object.entries(lead.intake_data)
              .filter(([, v]) => v != null && v !== "" && !(Array.isArray(v) && v.length === 0))
              .map(([k, v]) => (
                <div key={k} style={{ fontSize: 13, color: S.text, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ color: S.muted, minWidth: 180 }}>{INTAKE_FIELDS.find((f) => f.key === k)?.label || k}</span>
                  <span>{Array.isArray(v) ? v.join(", ") : String(v)}</span>
                </div>
              ))}
          </div>
        </details>
      )}

      {(lead.status === "new" || lead.status === "applied") && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          <Btn onClick={() => { if (window.confirm(`Accept ${lead.name || lead.email}?`)) onAccept(lead); }}>Accept</Btn>
          {REJECT_STATUSES.map((s) => (
            <button key={s} onClick={() => { if (window.confirm(`Mark ${lead.name || lead.email} as "${LEAD_STATUS_LABEL[s]}"?`)) onReject(lead, s); }}
              style={{ padding: "9px 14px", fontSize: 11, fontWeight: 600, cursor: "pointer", border: "1px solid " + S.border, background: "transparent", color: S.muted }}>
              {LEAD_STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      )}

      {lead.status === "accepted" && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: lead.client_id ? S.accent2 : S.muted, marginBottom: 12 }}>
            {lead.client_id ? "Linked to client record" : "Awaiting signup — links automatically once they sign up with this email"}
          </div>
          <Fld label="Manual PayPal invoice link">
            <Inp value={invoiceLink} placeholder="https://paypal.me/..."
              onChange={(e) => setInvoiceLink(e.target.value)}
              onBlur={(e) => onUpdate(lead.id, { invoice_link: e.target.value })} />
          </Fld>
          <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <Btn onClick={() => onUpdate(lead.id, { invoice_sent_at: new Date().toISOString() })}>
              {lead.invoice_sent_at ? "Invoice marked sent ✓" : "Mark invoice sent"}
            </Btn>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: S.muted, cursor: "pointer" }}>
              <input type="checkbox" checked={!!lead.paid} onChange={(e) => onUpdate(lead.id, { paid: e.target.checked })} /> Paid
            </label>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 4 }}>
        <Fld label="Stage"><RG options={CRM_STAGE_OPTIONS} value={lead.stage || ""} onChange={(v) => onUpdate(lead.id, { stage: v })} /></Fld>
        <Fld label="Source"><RG options={CRM_CHANNEL_OPTIONS} value={lead.channel || ""} onChange={(v) => onUpdate(lead.id, { channel: v })} /></Fld>
        <Fld label="Response Rate"><RG options={CRM_RESPONSE_RATE_OPTIONS} value={lead.response_rate || ""} onChange={(v) => onUpdate(lead.id, { response_rate: v })} /></Fld>
        <Fld label="Deal Value ($)">
          <Inp type="number" defaultValue={lead.deal_value ?? ""} placeholder="e.g. 1500"
            onBlur={(e) => onUpdate(lead.id, { deal_value: e.target.value === "" ? null : Number(e.target.value) })} />
        </Fld>
        <Fld label="Follow-up Date">
          <Inp type="date" value={lead.follow_up_date || ""} onChange={(e) => onUpdate(lead.id, { follow_up_date: e.target.value || null })} />
        </Fld>
        <Fld label="Last Contact Date">
          <Inp type="date" value={lead.last_contact_date || ""} onChange={(e) => onUpdate(lead.id, { last_contact_date: e.target.value || null })} />
        </Fld>
      </div>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", margin: "4px 0 16px" }}>
        {CHECKBOXES.map(([k, label]) => (
          <label key={k} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: S.muted, cursor: "pointer" }}>
            <input type="checkbox" checked={!!lead[k]} onChange={(e) => onUpdate(lead.id, { [k]: e.target.checked })} /> {label}
          </label>
        ))}
      </div>
      <Fld label="Notes">
        <textarea value={notes} rows={3}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={(e) => onUpdate(lead.id, { notes: e.target.value })}
          style={{ width: "100%", background: S.surface2, border: "1px solid " + S.border, color: S.text, padding: "10px 14px", fontSize: 13, outline: "none", fontFamily: "inherit" }} />
      </Fld>
      {lead.follow_up_date && (
        <div style={{ fontSize: 11, fontWeight: 700, color: lead.follow_up_date <= today ? S.danger : S.muted }}>
          {lead.follow_up_date <= today ? "Follow-up is due" : `Next follow-up ${lead.follow_up_date}`}
        </div>
      )}
    </Modal>
  );
}
