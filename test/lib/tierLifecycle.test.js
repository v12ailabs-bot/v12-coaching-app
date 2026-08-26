import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveLifecycleStatus, isReturningStarter, LIFECYCLE_STATUS } from "../../src/lib/tierLifecycle.js";

test("starter within the 30-day window -> Starter Active", () => {
  const profile = { client_type: "starter", starter_expires_at: "2026-10-10" };
  assert.equal(deriveLifecycleStatus(profile, "2026-09-15"), LIFECYCLE_STATUS.STARTER_ACTIVE);
});

test("starter past the expiration date -> Starter Expired", () => {
  const profile = { client_type: "starter", starter_expires_at: "2026-09-01" };
  assert.equal(deriveLifecycleStatus(profile, "2026-09-15"), LIFECYCLE_STATUS.STARTER_EXPIRED);
});

test("starter expiring exactly today still counts as active (inclusive)", () => {
  const profile = { client_type: "starter", starter_expires_at: "2026-09-15" };
  assert.equal(deriveLifecycleStatus(profile, "2026-09-15"), LIFECYCLE_STATUS.STARTER_ACTIVE);
});

test("program_only defaults to Program Active with no payment_status set", () => {
  assert.equal(deriveLifecycleStatus({ client_type: "program_only" }), LIFECYCLE_STATUS.PROGRAM_ACTIVE);
});

test("program_only with a failed recurring payment -> Program Past Due", () => {
  const profile = { client_type: "program_only", program_payment_status: "past_due" };
  assert.equal(deriveLifecycleStatus(profile), LIFECYCLE_STATUS.PROGRAM_PAST_DUE);
});

test("program_only canceled subscription -> Program Canceled", () => {
  const profile = { client_type: "program_only", program_payment_status: "canceled" };
  assert.equal(deriveLifecycleStatus(profile), LIFECYCLE_STATUS.PROGRAM_CANCELED);
});

test("coaching client_type -> Coaching Active", () => {
  assert.equal(deriveLifecycleStatus({ client_type: "coaching" }), LIFECYCLE_STATUS.COACHING_ACTIVE);
});

test("missing/unrecognized profile -> Unknown, never a guess", () => {
  assert.equal(deriveLifecycleStatus(null), LIFECYCLE_STATUS.UNKNOWN);
  assert.equal(deriveLifecycleStatus({ client_type: "something_else" }), LIFECYCLE_STATUS.UNKNOWN);
});

test("isReturningStarter: only true after a second Starter purchase", () => {
  assert.equal(isReturningStarter({ starter_purchase_count: 0 }), false);
  assert.equal(isReturningStarter({ starter_purchase_count: 1 }), false);
  assert.equal(isReturningStarter({ starter_purchase_count: 2 }), true);
  assert.equal(isReturningStarter({}), false);
});
