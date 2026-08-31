// Single source of truth for a client's tier lifecycle status. Deliberately
// NOT a stored column on `profiles` -- always derived from real facts
// (client_type + starter_expires_at + program_payment_status), the same
// philosophy the rest of the app uses for on-track/ahead/behind status and
// check-in "done today": a derived value can't drift out of sync with
// reality, a stored one can.
//
// Lifecycle status (product/access state) is intentionally kept separate
// from customer-history attributes (see isReturningStarter below) and from
// CRM sales-follow-up state (leads.needs_sales_followup) -- three different
// questions that shouldn't collapse into one status field (spec Section 9I/10).

export const LIFECYCLE_STATUS = {
  STARTER_ACTIVE: "starter_active",
  STARTER_EXPIRED: "starter_expired",
  PROGRAM_ACTIVE: "program_active",
  PROGRAM_PAST_DUE: "program_past_due",
  PROGRAM_CANCELED: "program_canceled",
  COACHING_ACTIVE: "coaching_active",
  UNKNOWN: "unknown",
};

export const LIFECYCLE_LABEL = {
  [LIFECYCLE_STATUS.STARTER_ACTIVE]: "Starter — Active",
  [LIFECYCLE_STATUS.STARTER_EXPIRED]: "Starter — Expired",
  [LIFECYCLE_STATUS.PROGRAM_ACTIVE]: "V12 Program",
  [LIFECYCLE_STATUS.PROGRAM_PAST_DUE]: "Program — Payment Failed",
  [LIFECYCLE_STATUS.PROGRAM_CANCELED]: "Program — Canceled",
  [LIFECYCLE_STATUS.COACHING_ACTIVE]: "Coaching",
  [LIFECYCLE_STATUS.UNKNOWN]: "Unknown",
};

// `today` param (a 'YYYY-MM-DD' string) exists purely so callers/tests can
// pin "now" -- production callers can omit it and get the real date.
export function deriveLifecycleStatus(profile, today = new Date().toISOString().slice(0, 10)) {
  if (!profile) return LIFECYCLE_STATUS.UNKNOWN;
  if (profile.client_type === "starter") {
    if (profile.starter_expires_at && profile.starter_expires_at < today) return LIFECYCLE_STATUS.STARTER_EXPIRED;
    return LIFECYCLE_STATUS.STARTER_ACTIVE;
  }
  if (profile.client_type === "program_only") {
    if (profile.program_payment_status === "past_due") return LIFECYCLE_STATUS.PROGRAM_PAST_DUE;
    if (profile.program_payment_status === "canceled") return LIFECYCLE_STATUS.PROGRAM_CANCELED;
    return LIFECYCLE_STATUS.PROGRAM_ACTIVE;
  }
  if (profile.client_type === "coaching") return LIFECYCLE_STATUS.COACHING_ACTIVE;
  return LIFECYCLE_STATUS.UNKNOWN;
}

// Customer-history attribute (spec 9I) -- "the user previously
// completed/expired a Starter period and subsequently purchased another."
// Never gates or replaces lifecycle status; purely descriptive.
export function isReturningStarter(profile) {
  return (profile?.starter_purchase_count ?? 0) > 1;
}
