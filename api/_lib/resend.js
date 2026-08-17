import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Alerts the coach by email that a new application came in. Best-effort: if
// Resend/COACH_NOTIFICATION_EMAIL isn't configured, resolves to null (no-op)
// instead of throwing, same as createNotionApplication in ./notion.js — a
// missing/misconfigured notification integration should never fail the
// applicant's submission.
export async function sendApplicationNotificationEmail(fields) {
  const to = process.env.COACH_NOTIFICATION_EMAIL;
  if (!resend || !to) return null;
  return resend.emails.send({
    from: "onboarding@resend.dev",
    to,
    subject: `New application: ${fields.name}`,
    text: `${fields.name} (${fields.email}) just submitted an application.\n\nOpen the Leads / CRM tab in the app to review it.`,
  });
}

// Once-daily summary of the last 24h of client check-ins (see api/checkin-digest.js,
// run on a Vercel Cron schedule) — one email per day instead of one per check-in,
// which would be unmanageable once there are more than a couple of clients.
// Best-effort/no-op like the other senders in this file.
export async function sendCheckinDigestEmail({ daily, weekly }) {
  const to = process.env.COACH_NOTIFICATION_EMAIL;
  if (!resend || !to) return null;
  if (!daily.length && !weekly.length) return null;

  const lines = [];
  if (daily.length) {
    lines.push(`DAILY CHECK-INS (${daily.length})`);
    daily.forEach((d) => {
      const parts = [d.workout];
      if (d.weight != null) parts.push(`${d.weight}lbs`);
      if (d.diet) parts.push(`diet: ${d.diet}`);
      if (d.energy != null) parts.push(`energy ${d.energy}/10`);
      if (d.sleep != null) parts.push(`sleep ${d.sleep}/10`);
      lines.push(`- ${d.name}: ${parts.join(", ")}`);
    });
  }
  if (weekly.length) {
    if (lines.length) lines.push("");
    lines.push(`WEEKLY CHECK-INS (${weekly.length})`);
    weekly.forEach((w) => {
      lines.push(`- ${w.name}${w.bodyweight != null ? `: ${w.bodyweight}lbs` : ""}`);
      if (w.coach_questions) lines.push(`  Question: ${w.coach_questions}`);
      if (w.adjustments) lines.push(`  Wants adjusted: ${w.adjustments}`);
    });
  }
  lines.push("", "Open the app for full details.");

  return resend.emails.send({
    from: "onboarding@resend.dev",
    to,
    subject: `Check-in digest: ${daily.length} daily, ${weekly.length} weekly`,
    text: lines.join("\n"),
  });
}
