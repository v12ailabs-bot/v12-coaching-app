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
