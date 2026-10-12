/**
 * Seijun Phase 25A.1 Migration & Authorization Hardening Test Suite
 *
 * Verifies the database authorization hardening migration:
 * `supabase/migrations/20261012000001_phase25a_mpin_verification_expiry.sql`
 *
 * Executed against an in-memory PostgreSQL engine (PGlite + pgcrypto)
 * with real RLS policies, schemas, triggers, and security definer functions.
 */

import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { PGlite } from "@electric-sql/pglite"
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, "..")

console.log("🌸 Running Seijun Phase 25A.1 Migration & Database Authorization Tests...")

const db = new PGlite({ extensions: { pgcrypto } })

const userA = "00000000-0000-4000-8000-000000000001"
const userB = "00000000-0000-4000-8000-000000000002"
const sessionA1 = "10000000-0000-4000-8000-000000000001"
const sessionA2 = "10000000-0000-4000-8000-000000000002"
const sessionB1 = "10000000-0000-4000-8000-000000000003"
const sessionStale = "10000000-0000-4000-8000-000000000099"

// Initialize Supabase Auth and Public schema mock
await db.exec(`
  CREATE ROLE anon;
  CREATE ROLE authenticated;
  CREATE ROLE authenticator;

  CREATE SCHEMA auth;
  CREATE TABLE auth.users(id uuid PRIMARY KEY);
  CREATE TABLE auth.sessions(id uuid PRIMARY KEY, user_id uuid NOT NULL, created_at timestamptz DEFAULT now());

  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('request.jwt', true), '')::jsonb $$;

  GRANT USAGE ON SCHEMA auth TO authenticated, anon;
  GRANT EXECUTE ON FUNCTION auth.uid(), auth.jwt() TO authenticated, anon;

  CREATE EXTENSION pgcrypto;

  CREATE TABLE public.profiles(
    user_id uuid PRIMARY KEY REFERENCES auth.users(id),
    has_mpin boolean NOT NULL DEFAULT false,
    onboarding_completed boolean NOT NULL DEFAULT true
  );

  CREATE TABLE public.cycles(
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id)
  );

  ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.cycles ENABLE ROW LEVEL SECURITY;

  CREATE POLICY own_profile ON public.profiles FOR ALL TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  CREATE POLICY own_cycles ON public.cycles FOR ALL TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

  GRANT USAGE ON SCHEMA public TO authenticated, anon;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles, public.cycles TO authenticated;

  INSERT INTO auth.users(id) VALUES ('${userA}'), ('${userB}');
  INSERT INTO auth.sessions(id, user_id, created_at) VALUES
    ('${sessionA1}', '${userA}', now()),
    ('${sessionA2}', '${userA}', now()),
    ('${sessionB1}', '${userB}', now()),
    ('${sessionStale}', '${userA}', now() - interval '10 hours');

  INSERT INTO public.profiles(user_id, has_mpin) VALUES ('${userA}', true), ('${userB}', false);
  INSERT INTO public.cycles(user_id) VALUES ('${userA}'), ('${userB}');
`)

// Apply Phase 24 migration
const phase24Sql = fs.readFileSync(path.join(ROOT, "supabase/migrations/20261010000000_phase24_account_mpin.sql"), "utf8")
await db.exec(phase24Sql)

// Simulate an existing verified session from Phase 24 that was verified 9 hours ago
await db.exec(`
  INSERT INTO private.mpin_verified_sessions(session_id, user_id, verified_at)
  VALUES ('${sessionStale}', '${userA}', now() - interval '9 hours');
`)

// Apply Phase 25A.1 migration
const phase25aSql = fs.readFileSync(path.join(ROOT, "supabase/migrations/20261012000001_phase25a_mpin_verification_expiry.sql"), "utf8")
await db.exec(phase25aSql)

async function asAdmin() {
  await db.exec("RESET ROLE")
}

async function asUser(user, session) {
  await db.exec("RESET ROLE")
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [user || ""])
  await db.query(
    "SELECT set_config('request.jwt', $1, false)",
    [JSON.stringify(user ? { sub: user, session_id: session, role: "authenticated" } : {})]
  )
  if (user) {
    await db.exec("SET ROLE authenticated")
  } else {
    await db.exec("SET ROLE anon")
  }
}

async function one(sql, params = []) {
  return (await db.query(sql, params)).rows[0]
}

let passed = 0
function check(name, ok) {
  if (ok) {
    console.log(`  ✔ PASS: ${name}`)
    passed++
  } else {
    console.error(`  ✖ FAIL: ${name}`)
    process.exit(1)
  }
}

// ─── Test Group 1: Backfill Semantics on Existing Phase 24 Sessions ───────────
console.log("\n--- 1. Backfill Semantics & Historical Expiry ---")

// SessionStale was verified 9 hours ago. With backfill (verified_at + 8h), verified_until is now - 1h.
await asUser(userA, sessionStale)
const staleAllowed = (await one("SELECT public.mpin_access_allowed() AS val")).val
check("Pre-existing session older than 8 hours is immediately expired after migration", staleAllowed === false)

const staleCyclesCount = (await one("SELECT count(*)::int AS count FROM public.cycles")).count
check("Expired pre-existing session cannot query protected cycles (RLS returns 0 rows)", staleCyclesCount === 0)

// ─── Test Group 2: Enrollment with Fresh Session & Expiry Initialization ──────
console.log("\n--- 2. Enrollment & Initial Expiration Window ---")

await asUser(userA, sessionA1)
// First-time enrollment for userA with valid 6-digit PIN
const enrolled = (await one("SELECT public.mpin_enroll($1) AS val", ["123456"])).val
check("Enrollment succeeds for active session (<5 min)", enrolled === true)

// Verify verified_until was established as now() + 8 hours
await asAdmin()
const a1Row = await one(
  "SELECT verified_at, verified_until, (verified_until > now()) AS unexpired FROM private.mpin_verified_sessions WHERE session_id = $1",
  [sessionA1]
)
check("Enrollment sets verified_until in the future", a1Row.unexpired === true)

// Access is granted
await asUser(userA, sessionA1)
const a1Allowed = (await one("SELECT public.mpin_access_allowed() AS val")).val
check("Newly enrolled session is authorized (mpin_access_allowed is true)", a1Allowed === true)

const a1Cycles = (await one("SELECT count(*)::int AS count FROM public.cycles")).count
check("Authorized session can query protected cycles table", a1Cycles === 1)

// ─── Test Group 3: Cross-Device & Cross-User Isolation ────────────────────────
console.log("\n--- 3. Cross-Device & Cross-User Isolation ---")

// User A on Device 2 (sessionA2) is NOT authorized yet
await asUser(userA, sessionA2)
const a2AllowedBefore = (await one("SELECT public.mpin_access_allowed() AS val")).val
check("Separate session for same user is not authorized before its own verification", a2AllowedBefore === false)

// User B on Device 3 (sessionB1) cannot access User A's data
await asUser(userB, sessionB1)
const b1Allowed = (await one("SELECT public.mpin_access_allowed() AS val")).val
check("User B is not authorized by User A's verification", b1Allowed === false)

// ─── Test Group 4: Verification, Renewal, and Rate Limiting ───────────────────
console.log("\n--- 4. Verification, Renewal & Progressive Lockout ---")

await asUser(userA, sessionA2)

// Wrong PIN does not authorize
const wrongPin = (await one("SELECT public.mpin_verify($1) AS val", ["000000"])).val
check("Incorrect PIN returns success = false", wrongPin.success === false)

const a2StillLocked = (await one("SELECT public.mpin_access_allowed() AS val")).val
check("Failed verification does not grant authorization", a2StillLocked === false)

// Correct PIN authorizes and establishes 8-hour window
const correctPin = (await one("SELECT public.mpin_verify($1) AS val", ["123456"])).val
check("Correct PIN returns success = true", correctPin.success === true)

const a2AllowedAfter = (await one("SELECT public.mpin_access_allowed() AS val")).val
check("Verified Device 2 is authorized", a2AllowedAfter === true)

// ─── Test Group 5: Natural Expiry & Returning-User Flow ───────────────────────
console.log("\n--- 5. Expiration & Status Reporting ---")

// Artificially expire sessionA2 by shifting verified_until into the past
await asAdmin()
await db.query(
  "UPDATE private.mpin_verified_sessions SET verified_until = now() - interval '1 second' WHERE session_id = $1",
  [sessionA2]
)

await asUser(userA, sessionA2)
const expiredAccess = (await one("SELECT public.mpin_access_allowed() AS val")).val
check("Expired session is immediately denied by mpin_access_allowed()", expiredAccess === false)

const status = (await one("SELECT public.mpin_status() AS val")).val
check("mpin_status reports configured = true after expiry", status.configured === true)
check("mpin_status reports verified = false after expiry", status.verified === false)

// PostgREST pre-request hook denies access to protected routes
await db.query("SELECT set_config('request.path', $1, false)", ["cycles"])
await db.query("SELECT set_config('request.method', $1, false)", ["GET"])
await assert.rejects(
  () => one("SELECT public.mpin_pre_request()"),
  /MPIN verification required/,
  "mpin_pre_request() throws 42501 for expired session on protected table"
)

// Re-verifying with valid PIN renews authorization for 8 hours
const renewed = (await one("SELECT public.mpin_verify($1) AS val", ["123456"])).val
check("Re-verification of expired session succeeds", renewed.success === true)

const renewedAccess = (await one("SELECT public.mpin_access_allowed() AS val")).val
check("Re-verified session is immediately authorized again", renewedAccess === true)

// ─── Test Group 6: Explicit Lock & Session Invalidation ───────────────────────
console.log("\n--- 6. Explicit Lock & Revocation ---")

await db.exec("SELECT public.mpin_lock()")
const lockedAccess = (await one("SELECT public.mpin_access_allowed() AS val")).val
check("mpin_lock() immediately deletes session record and revokes access", lockedAccess === false)

// ─── Test Group 7: Safe Rollback Simulation ───────────────────────────────────
console.log("\n--- 7. Safe Rollback Semantics (Preventing Silent Re-Authorization) ---")

// Set sessionA1 to expired
await asAdmin()
await db.query(
  "UPDATE private.mpin_verified_sessions SET verified_until = now() - interval '10 minutes' WHERE session_id = $1",
  [sessionA1]
)

// Safe Rollback Step 1: Purge expired sessions BEFORE restoring old predicate
await db.exec("DELETE FROM private.mpin_verified_sessions WHERE verified_until <= now()")

// Safe Rollback Step 2: Revert to Phase 24 predicate
await db.exec(`
  CREATE OR REPLACE FUNCTION public.mpin_access_allowed() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT auth.uid() IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM private.mpin_verified_sessions s
        WHERE s.user_id = auth.uid()
          AND s.session_id = NULLIF(auth.jwt()->>'session_id', '')::uuid
          AND EXISTS (SELECT 1 FROM auth.sessions a WHERE a.id = s.session_id AND a.user_id = s.user_id)
      );
  $$;
`)

await asUser(userA, sessionA1)
const rollbackSessionA1Allowed = (await one("SELECT public.mpin_access_allowed() AS val")).val
check("Safe rollback does not silently re-authorize session that had expired", rollbackSessionA1Allowed === false)

console.log(`\n=================================================`)
console.log(`ALL PHASE 25A.1 DATABASE TESTS PASSED! 🎉 (${passed} passed)`)
console.log(`=================================================`)
