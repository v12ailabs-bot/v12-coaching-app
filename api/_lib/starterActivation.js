import { supabaseAdmin } from "./supabaseAdmin.js";

const STARTER_DAYS = 30;
const addDays = (dateStr, n) => {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// The ONLY place a Starter account gets created/activated. Called on
// confirmed payment -- a real Payoneer webhook once that's wired, or the
// coach-only manual-confirm endpoint in the meantime (see
// admin-confirm-starter-payment.js). Idempotent: confirming an
// already-confirmed session returns without creating a second account or
// re-incrementing the purchase count.
export async function activateStarterSignup({ sessionId }) {
  const { data: session } = await supabaseAdmin.from("starter_checkout_sessions").select("*").eq("id", sessionId).maybeSingle();
  if (!session) throw new Error("Unknown checkout session.");
  if (session.status === "confirmed") return { alreadyConfirmed: true, profileId: session.provider_ref || null };

  const email = session.email.toLowerCase();
  const today = new Date().toISOString().slice(0, 10);
  const expires = addDays(today, STARTER_DAYS);

  // Never create a duplicate account -- a returning Starter (or anyone who
  // already exists for any other reason) reuses their existing profile
  // (spec 9G/9H/9I).
  const { data: existing } = await supabaseAdmin.from("profiles").select("id,starter_purchase_count").ilike("email", email).maybeSingle();

  let profileId;
  if (existing) {
    profileId = existing.id;
    await supabaseAdmin.from("profiles").update({
      client_type: "starter",
      starter_started_at: today,
      starter_expires_at: expires,
      starter_purchase_count: (existing.starter_purchase_count || 0) + 1,
    }).eq("id", profileId);
  } else {
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({ email, email_confirm: true });
    if (error) throw error;
    profileId = created.user.id;
    // Upsert (onConflict: id), not insert -- a DB trigger on auth.users may
    // already have inserted a default profiles row (existing signup flow
    // relies on one); this fills in the Starter-specific fields either way
    // without assuming which case applies.
    await supabaseAdmin.from("profiles").upsert({
      id: profileId, email,
      client_type: "starter",
      starter_started_at: today,
      starter_expires_at: expires,
      starter_purchase_count: 1,
    }, { onConflict: "id" });
  }

  await supabaseAdmin.from("starter_checkout_sessions").update({ status: "confirmed", confirmed_at: new Date().toISOString() }).eq("id", sessionId);

  // Every Starter signup enters the CRM immediately (spec Section 10) --
  // no separate unique constraint on leads.email to upsert against (other
  // flows intentionally allow multiple lead rows per email over time), so
  // check-then-write against this specific client_id instead.
  const { data: existingLead } = await supabaseAdmin.from("leads").select("id").eq("client_id", profileId).maybeSingle();
  if (existingLead) {
    await supabaseAdmin.from("leads").update({ status: "accepted", updated_at: new Date().toISOString() }).eq("id", existingLead.id);
  } else {
    await supabaseAdmin.from("leads").insert({ email, source: "starter_signup", status: "accepted", client_id: profileId });
  }

  // Password-setup link via Supabase's own auth email delivery -- not
  // Resend, which is limited to the coach's own verified address until a
  // custom domain is set up (see api/_lib/resend.js).
  await supabaseAdmin.auth.admin.generateLink({ type: "invite", email });

  return { profileId };
}
