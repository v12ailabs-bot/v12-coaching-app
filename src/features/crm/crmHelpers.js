// Shared CRM constants + small helpers. Status vocab and option lists are
// copied as-is from the old CRMPanel (App.jsx) — no new fields, no new
// statuses, just reorganized into the kanban structure below.

export const LEAD_STATUSES = ["new", "applied", "accepted", "closed_lost", "follow_up_later", "price_objection", "not_ready"];
export const LEAD_STATUS_LABEL = { new: "New", applied: "Applied", accepted: "Accepted", closed_lost: "Closed Lost", follow_up_later: "Follow-up Later", price_objection: "Price Objection", not_ready: "Not Ready" };
export const REJECT_STATUSES = ["closed_lost", "follow_up_later", "price_objection", "not_ready"];

// Kanban columns: New/Applied/Accepted map 1:1 to their status; Follow-up
// groups the three "still being nurtured" statuses so all 7 lead statuses
// land somewhere across exactly 4 columns, matching the reference design.
// closed_lost has no column on purpose — it drops off the active board and
// is reachable only via the toolbar's status filter dropdown.
export const COLUMNS = [
  { key: "new", label: "New", statuses: ["new"] },
  { key: "applied", label: "Applied", statuses: ["applied"] },
  { key: "accepted", label: "Accepted", statuses: ["accepted"] },
  { key: "follow_up", label: "Follow-up", statuses: ["follow_up_later", "price_objection", "not_ready"] },
];

export const CRM_GOAL_OPTIONS = ["Fat Loss", "Muscle Build", "Both", "Unknown"];
export const CRM_CHANNEL_OPTIONS = ["TikTok", "Instagram", "Facebook", "Referral", "WhatsApp Cold", "Other"];
export const CRM_STAGE_OPTIONS = ["New DM", "Qualifying", "Application Sent", "WhatsApp Moved", "Call Booked", "Call Done", "Closed Won", "Closed Lost", "Ghost"];
export const CRM_RESPONSE_RATE_OPTIONS = ["Replied", "No Response", "Ghosted After Interest"];

export const BLANK_MANUAL_LEAD = {
  name: "", email: "", goal: "", channel: "", stage: "New DM", response_rate: "",
  deal_value: "", follow_up_date: "", last_contact_date: "", notes: "",
  dm_opener_sent: false, application_submitted: false, call_booked: false, moved_to_whatsapp: false,
};

// "Today" / "1d ago" / "12d ago" for a lead's created_at, used on kanban
// cards that aren't showing a follow-up due date instead.
export function timeSince(dateStr) {
  if (!dateStr) return "—";
  const days = Math.round((new Date() - new Date(dateStr)) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}
