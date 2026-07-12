// ---------------------------------------------------------------------------
// Link two clients as training partners so they SHARE one training program.
// The partner's profile.shared_program_owner_id is set to the owner's id; the
// owner keeps their own rows. Nutrition, logs, and check-ins stay separate.
//
//   .env needs SUPABASE_URL + SUPABASE_SERVICE_KEY. Then:
//     npm run link:partners -- owner@email.com partner@email.com
//     npm run link:partners -- --unlink partner@email.com
//
// The first email is the OWNER (their training program becomes the shared one);
// the second is the PARTNER (their portal will read the owner's program).
// ---------------------------------------------------------------------------

import { createClient } from "@supabase/supabase-js";

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env");
  process.exit(1);
}
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findClient(email) {
  const { data, error } = await db
    .from("profiles")
    .select("id, name, email, shared_program_owner_id")
    .eq("email", email)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`No client found for ${email}`);
  return data;
}

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === "--unlink") {
    const email = args[1];
    if (!email) throw new Error("Usage: --unlink partner@email.com");
    const p = await findClient(email);
    const { error } = await db.from("profiles").update({ shared_program_owner_id: null }).eq("id", p.id);
    if (error) throw error;
    console.log(`Unlinked ${p.name || p.email} — their training program is independent again (nutrition unchanged).`);
    return;
  }

  const [ownerEmail, partnerEmail] = args;
  if (!ownerEmail || !partnerEmail) {
    throw new Error("Usage: npm run link:partners -- owner@email.com partner@email.com   (or  --unlink partner@email.com)");
  }
  if (ownerEmail === partnerEmail) throw new Error("Owner and partner must be different clients.");

  const owner = await findClient(ownerEmail);
  const partner = await findClient(partnerEmail);

  // Refuse to chain: the owner must have their own program, not be a partner.
  if (owner.shared_program_owner_id) {
    throw new Error(`${owner.email} is itself linked to another partner — pick the program OWNER as the first argument.`);
  }

  const { error } = await db.from("profiles").update({ shared_program_owner_id: owner.id }).eq("id", partner.id);
  if (error) throw error;
  console.log(
    `Linked: ${partner.name || partner.email} now shares ${owner.name || owner.email}'s training program.\n` +
    `Nutrition, logs, and check-ins remain separate for each. Generate/edit training on either account and both see it.`
  );
}

main().catch((e) => { console.error("Link failed:", e.message); process.exit(1); });
