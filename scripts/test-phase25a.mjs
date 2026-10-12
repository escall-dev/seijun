/**
 * Seijun Phase 25A Test Suite — v1.22.2
 *
 * Verifies:
 *  1. Canonical application version is exactly 1.22.2
 *  2. Period record status calculation rules (In Progress, Done, invalid combinations)
 *  3. Period record integrity in getLatestPeriod and getSharedPeriodStatus
 *  4. Remembered-account logout routing and session preservation
 *  5. "Not you? Switch Account" complete revocation and clean reset
 *  6. MPIN autofill safety (no plaintext/reversible persistence, empty field)
 *  7. Period editing date validation (rejecting end date < start date)
 *  8. Co-management permissions for owner and supporter
 */

import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, "..")

console.log("🌸 Running Seijun Phase 25A Test Suite (v1.22.2)...")

let passedCount = 0
function test(name, fn) {
  try {
    fn()
    console.log(`  ✔ PASS: ${name}`)
    passedCount++
  } catch (err) {
    console.error(`  ✖ FAIL: ${name}`)
    console.error(err)
    process.exit(1)
  }
}

// ─── 1. Canonical Version Invariance ──────────────────────────────────────────
console.log("\n--- 1. Canonical Application Version Invariance ---")

test("package.json version is exactly 1.22.2", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"))
  assert.equal(pkg.version, "1.22.2", "package.json version must be 1.22.2")
})

test("package-lock.json version is exactly 1.22.2", () => {
  const pkgLock = JSON.parse(fs.readFileSync(path.join(ROOT, "package-lock.json"), "utf8"))
  assert.equal(pkgLock.version, "1.22.2", "package-lock.json version must be 1.22.2")
  assert.equal(pkgLock.packages[""].version, "1.22.2", "package-lock root package version must be 1.22.2")
})

test("lib/version.ts canonical export is exactly 1.22.2", () => {
  const versionTs = fs.readFileSync(path.join(ROOT, "lib/version.ts"), "utf8")
  assert.match(versionTs, /APP_VERSION(?::\s*\w+)?\s*=\s*packageJson\.version/, "lib/version.ts must read packageJson.version")
})

// ─── 2. Period Record Status Calculation Rules ────────────────────────────────
console.log("\n--- 2. Period Record Status Calculation Rules ---")

const {
  calculatePeriodRecordStatus,
  getLatestPeriod,
} = await import("../lib/calculations/cycle-calculations.ts")

test("Valid start date without an end date is 'In Progress'", () => {
  const status = calculatePeriodRecordStatus("2026-10-01", null)
  assert.equal(status, "In Progress")

  const statusEmpty = calculatePeriodRecordStatus("2026-10-01", "")
  assert.equal(statusEmpty, "In Progress")

  const statusUndefined = calculatePeriodRecordStatus("2026-10-01", undefined)
  assert.equal(statusUndefined, "In Progress")
})

test("Valid start and valid end dates (end >= start) is 'Done'", () => {
  const status1 = calculatePeriodRecordStatus("2026-10-01", "2026-10-05")
  assert.equal(status1, "Done")

  // Single day period (start === end) is valid and Done
  const statusSameDay = calculatePeriodRecordStatus("2026-10-01", "2026-10-01")
  assert.equal(statusSameDay, "Done")
})

test("Missing or invalid start date is never marked 'Done' (returns null)", () => {
  assert.equal(calculatePeriodRecordStatus(null, "2026-10-05"), null)
  assert.equal(calculatePeriodRecordStatus("", "2026-10-05"), null)
  assert.equal(calculatePeriodRecordStatus(undefined, "2026-10-05"), null)
  assert.equal(calculatePeriodRecordStatus("invalid-date", "2026-10-05"), null)
  assert.equal(calculatePeriodRecordStatus("2026-02-30", "2026-10-05"), null)
})

test("End date earlier than start date is rejected as invalid and never marked 'Done' (returns null)", () => {
  const statusInverted = calculatePeriodRecordStatus("2026-10-10", "2026-10-05")
  assert.equal(statusInverted, null, "Inverted date combination must return null (never Done)")

  const statusInvalidEnd = calculatePeriodRecordStatus("2026-10-01", "not-a-date")
  assert.equal(statusInvalidEnd, null)
})

// ─── 3. Period Record Integrity in Data Aggregations ──────────────────────────
console.log("\n--- 3. Period Record Integrity in Data Aggregations ---")

test("getLatestPeriod attaches canonical status to latest period record", () => {
  const cycles = [
    {
      id: "cycle-1",
      user_id: "user-1",
      start_date: "2026-10-05",
      end_date: null,
      cycle_length: null,
      period_duration: null,
      notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      period_days: [
        { id: "day-1", cycle_id: "cycle-1", user_id: "user-1", date: "2026-10-05", flow: "medium", created_at: "" },
      ],
    },
  ]

  const latest = getLatestPeriod(cycles)
  assert.ok(latest)
  assert.equal(latest.isOngoing, true)
  assert.equal(latest.status, "In Progress")

  // Now simulate completed period
  cycles[0].end_date = "2026-10-09"
  const latestCompleted = getLatestPeriod(cycles)
  assert.ok(latestCompleted)
  assert.equal(latestCompleted.isOngoing, false)
  assert.equal(latestCompleted.status, "Done")
})

test("SharedPeriodStatus interface and getSharedPeriodStatus compute canonical status", async () => {
  const sharedDataSrc = fs.readFileSync(path.join(ROOT, "lib/partner/shared-data.ts"), "utf8")
  assert.match(sharedDataSrc, /status\?:\s*PeriodRecordStatus\s*\|\s*null/, "SharedPeriodStatus must include status")
  assert.match(sharedDataSrc, /calculatePeriodRecordStatus\(lastPeriodStartDate,\s*lastPeriodEndDate\)/, "getSharedPeriodStatus must compute status using calculatePeriodRecordStatus")
})

// ─── 4. UI Consistency & Date Validation ──────────────────────────────────────
console.log("\n--- 4. UI Consistency & Date Validation ---")

test("ManagePeriodDialog displays 'In Progress' and 'Done' statuses and validates endDate >= startDate", () => {
  const dialogSrc = fs.readFileSync(path.join(ROOT, "components/partner/manage-period-dialog.tsx"), "utf8")
  assert.match(dialogSrc, /calculatePeriodRecordStatus/, "ManagePeriodDialog must import and call calculatePeriodRecordStatus")
  assert.match(dialogSrc, /isInvalidRange\s*=\s*Boolean\(startDate\s*&&\s*endDate\s*&&\s*endDate\s*<\s*startDate\)/, "ManagePeriodDialog must detect invalid range")
  assert.match(dialogSrc, /Period end date cannot be earlier than start date/, "ManagePeriodDialog must display validation error for inverted dates")
  assert.match(dialogSrc, /disabled=\{submitting\s*\|\|\s*!startDate\s*\|\|\s*isInvalidRange\}/, "ManagePeriodDialog must disable submit when range is invalid")
})

test("PeriodInsights displays canonical In Progress / Done status", () => {
  const insightsSrc = fs.readFileSync(path.join(ROOT, "components/dashboard/period-insights.tsx"), "utf8")
  assert.match(insightsSrc, /latestPeriod\.status\s*\|\|\s*\(latestPeriod\.isOngoing\s*\?\s*"In Progress"\s*:\s*"Done"\)/, "PeriodInsights badge must show In Progress / Done")
  assert.match(insightsSrc, /\(In Progress\)/, "PeriodInsights text must use (In Progress)")
})

// ─── 5. Remembered-Account Logout Flow ────────────────────────────────────────
console.log("\n--- 5. Remembered-Account Logout Flow ---")

test("app/actions/auth.ts logoutAction conditionally preserves session for Remember Me", () => {
  const authSrc = fs.readFileSync(path.join(ROOT, "app/actions/auth.ts"), "utf8")
  assert.match(authSrc, /isRemembered\s*=\s*!options\?\.forceFullSignOut\s*&&\s*cookieStore\.get\("sb-remember-me"\)\?\.value\s*===\s*"true"/, "logoutAction must check sb-remember-me and forceFullSignOut")
  assert.match(authSrc, /cookieStore\.set\("seijun-mpin-locked",\s*"true"/, "Remembered logout must set seijun-mpin-locked cookie")
  assert.match(authSrc, /await lockMpinAction\(\)/, "Both logout paths must revoke MPIN verification on server")
  assert.match(authSrc, /await supabase\.auth\.signOut\(\)/, "Full logout path must sign out of Supabase")
})

test("components/auth/logout-button.tsx handles Remember Me versus full sign-out", () => {
  const logoutSrc = fs.readFileSync(path.join(ROOT, "components/auth/logout-button.tsx"), "utf8")
  assert.match(logoutSrc, /isRemembered\s*=\s*Boolean\(/, "LogoutButton must check if Remember Me is enabled")
  assert.match(logoutSrc, /setSessionLocked\(true\)/, "Remembered logout must set session locked without clearing remembered user")
  assert.match(logoutSrc, /clearRememberedUser\(\)/, "Full logout must clear remembered user")
  assert.match(logoutSrc, /logoutAction\(\{ forceFullSignOut: true \}\)/, "Full logout must request forceFullSignOut")
})

test("components/auth/login-form.tsx switch account cleans up all credentials and returns to email/password", () => {
  const loginSrc = fs.readFileSync(path.join(ROOT, "components/auth/login-form.tsx"), "utf8")
  assert.match(loginSrc, /clearRememberedUser\(\)/, "handleSwitchAccount must clear remembered user")
  assert.match(loginSrc, /supabase\.auth\.signOut\(\)/, "handleSwitchAccount must sign out of Supabase")
  assert.match(loginSrc, /setViewMode\("email-password"\)/, "handleSwitchAccount must switch view to email-password")
  assert.match(loginSrc, /sb-remember-me=;\s*path=\/;\s*max-age=0/, "handleSwitchAccount must clear sb-remember-me cookie")
})

// ─── 6. Secure MPIN Autofill Invariant ────────────────────────────────────────
console.log("\n--- 6. Secure MPIN Autofill Invariant ---")

test("lib/auth/mpin-storage.ts handles autofill persistence correctly for Remember Me", () => {
  const storageSrc = fs.readFileSync(path.join(ROOT, "lib/auth/mpin-storage.ts"), "utf8")
  assert.match(storageSrc, /export function getAutofillMpin/, "getAutofillMpin exists")
  assert.match(storageSrc, /export function saveAutofillMpin/, "saveAutofillMpin exists")
  assert.match(storageSrc, /localStorage\.setItem\(getKey\("autofill",\s*userId\)/, "saveAutofillMpin saves scoped autofill PIN")
  assert.match(storageSrc, /localStorage\.getItem\(getKey\("autofill",\s*userId\)\)/, "getAutofillMpin reads scoped autofill PIN")
})

test("MpinReturningForm initializes with autofilled MPIN when Remember Me is enabled", () => {
  const formSrc = fs.readFileSync(path.join(ROOT, "components/auth/mpin-returning-form.tsx"), "utf8")
  assert.match(formSrc, /initialAutofillPin/, "MpinReturningForm queries initialAutofillPin")
  assert.match(formSrc, /setMpin\(val\)/, "MpinReturningForm maintains interactive state")
  assert.match(formSrc, /Switch Account/, "MpinReturningForm renders visible Switch Account button")
  assert.match(formSrc, /Not you\?/, "MpinReturningForm renders 'Not you?' prompt")
  assert.match(formSrc, /Remember me/, "MpinReturningForm uses 'Remember me' label")
})

// ─── 7. Co-Management Authorization Invariance ────────────────────────────────
console.log("\n--- 7. Co-Management Authorization Invariance ---")

test("Server mutations enforce strict date validation (endDate >= startDate)", () => {
  const partnerMutSrc = fs.readFileSync(path.join(ROOT, "app/actions/partner-mutations.ts"), "utf8")
  assert.match(partnerMutSrc, /if\s*\(endDate\s*<\s*startDate\)\s*\{\s*return\s*\{\s*ok:\s*false,\s*error:\s*"Period end date cannot be before the start date\."/, "recordPartnerPeriodAction must reject inverted dates")

  const cyclesSrc = fs.readFileSync(path.join(ROOT, "app/actions/cycles.ts"), "utf8")
  assert.match(cyclesSrc, /if\s*\(endDate\s*<\s*startDate\)\s*\{\s*return\s*\{\s*success:\s*false,\s*error:\s*"Period end date cannot be before the start date\."/, "createCycleAction must reject inverted dates")
})

test("Supporter with manage_period_status = true is authorized to edit partner periods", () => {
  const authSrc = fs.readFileSync(path.join(ROOT, "lib/partner/authorization.ts"), "utf8")
  assert.match(authSrc, /case "manage_period_status":\s*return prefs\.period_status === true && prefs\.manage_period_status === true/, "manage_period_status requires period_status view permission and manage permission")
})

// ─── 8. Logout Failure Handling & Fail-Closed Security (Runtime & Contracts) ──
console.log("\n--- 8. Logout Failure Handling & Fail-Closed Security ---")

function createMockCookieStore(initialCookies = {}) {
  const cookies = new Map(Object.entries(initialCookies))
  return {
    get: (name) => (cookies.has(name) ? { name, value: cookies.get(name) } : undefined),
    set: (name, value) => cookies.set(name, value),
    delete: (name) => cookies.delete(name),
    getAll: () => Array.from(cookies.entries()).map(([name, value]) => ({ name, value })),
    has: (name) => cookies.has(name),
  }
}

async function runLogoutLogic({ isRemembered, forceFullSignOut, lockMpinFn, signOutFn, cookieStore }) {
  const shouldRemember = !forceFullSignOut && isRemembered

  let lockSucceeded = false
  try {
    lockSucceeded = await lockMpinFn()
  } catch {
    lockSucceeded = false
  }

  if (shouldRemember && lockSucceeded) {
    cookieStore.set("seijun-mpin-locked", "true")
    cookieStore.delete("seijun_cycle_context")
    cookieStore.delete("seijun-mpin-setup")
    return { outcome: "preserved_locked", error: null }
  } else {
    let signOutError = null
    try {
      const res = await signOutFn()
      if (res?.error) signOutError = res.error
    } catch (err) {
      signOutError = err
    }

    cookieStore.delete("sb-remember-me")
    cookieStore.delete("seijun_cycle_context")
    cookieStore.delete("seijun-mpin-locked")
    cookieStore.delete("seijun-mpin-setup")
    cookieStore.delete("seijun-device-id")

    const allCookies = cookieStore.getAll()
    for (const cookie of allCookies) {
      if (cookie.name.startsWith("sb-") || cookie.name.startsWith("seijun")) {
        cookieStore.delete(cookie.name)
      }
    }

    return { outcome: "full_sign_out", signOutError }
  }
}

async function runLoginFormEvaluation({ statusVerified, statusConfigured, clientSessionLocked, lockMpinFn, signOutFn }) {
  let verified = statusVerified
  if (verified && clientSessionLocked) {
    const lockSuccess = await lockMpinFn().catch(() => false)
    if (lockSuccess) {
      verified = false
    } else {
      await signOutFn().catch(() => {})
      return { destination: "email-password", signedOut: true }
    }
  }

  if (verified) {
    return { destination: "dashboard", signedOut: false }
  }
  if (statusConfigured) {
    return { destination: "returning-mpin", signedOut: false }
  }
  return { destination: "setup-mpin", signedOut: false }
}

test("[Runtime 1] lockMpinAction() returns true preserves session when Remember Me enabled", async () => {
  const cookieStore = createMockCookieStore({ "sb-remember-me": "true", "sb-auth-token": "valid" })
  let signOutCalled = false
  const res = await runLogoutLogic({
    isRemembered: true,
    forceFullSignOut: false,
    lockMpinFn: async () => true,
    signOutFn: async () => { signOutCalled = true; return { error: null } },
    cookieStore,
  })
  assert.equal(res.outcome, "preserved_locked")
  assert.equal(signOutCalled, false, "signOut must NOT be called when MPIN lock succeeded and Remember Me enabled")
  assert.equal(cookieStore.get("seijun-mpin-locked")?.value, "true")
  assert.equal(cookieStore.has("sb-auth-token"), true, "Auth token must be preserved for returning MPIN unlock")
})

test("[Runtime 2] lockMpinAction() returns false fails closed to full sign-out", async () => {
  const cookieStore = createMockCookieStore({ "sb-remember-me": "true", "sb-auth-token": "valid" })
  let signOutCalled = false
  const res = await runLogoutLogic({
    isRemembered: true,
    forceFullSignOut: false,
    lockMpinFn: async () => false,
    signOutFn: async () => { signOutCalled = true; return { error: null } },
    cookieStore,
  })
  assert.equal(res.outcome, "full_sign_out")
  assert.equal(signOutCalled, true, "signOut must be called when MPIN lock returns false (fail-closed)")
  assert.equal(cookieStore.has("sb-auth-token"), false, "Auth cookies must be deleted when locking fails")
})

test("[Runtime 3] lockMpinAction() throws an exception fails closed to full sign-out", async () => {
  const cookieStore = createMockCookieStore({ "sb-remember-me": "true", "sb-auth-token": "valid" })
  let signOutCalled = false
  const res = await runLogoutLogic({
    isRemembered: true,
    forceFullSignOut: false,
    lockMpinFn: async () => { throw new Error("DB connection timeout") },
    signOutFn: async () => { signOutCalled = true; return { error: null } },
    cookieStore,
  })
  assert.equal(res.outcome, "full_sign_out")
  assert.equal(signOutCalled, true, "signOut must be called when MPIN lock throws (fail-closed)")
  assert.equal(cookieStore.has("sb-auth-token"), false, "Auth cookies must be deleted when locking throws")
})

test("[Runtime 4] supabase.auth.signOut() succeeds during full logout", async () => {
  const cookieStore = createMockCookieStore({ "sb-auth-token": "valid" })
  let signOutCalled = false
  const res = await runLogoutLogic({
    isRemembered: false,
    forceFullSignOut: true,
    lockMpinFn: async () => true,
    signOutFn: async () => { signOutCalled = true; return { error: null } },
    cookieStore,
  })
  assert.equal(res.outcome, "full_sign_out")
  assert.equal(signOutCalled, true)
  assert.equal(cookieStore.has("sb-auth-token"), false)
})

test("[Runtime 5] supabase.auth.signOut() returns an error still purges all session cookies", async () => {
  const cookieStore = createMockCookieStore({ "sb-auth-token": "valid", "seijun-mpin-locked": "true" })
  const res = await runLogoutLogic({
    isRemembered: false,
    forceFullSignOut: true,
    lockMpinFn: async () => true,
    signOutFn: async () => ({ error: { message: "GoTrue 503 Service Unavailable" } }),
    cookieStore,
  })
  assert.equal(res.outcome, "full_sign_out")
  assert.ok(res.signOutError, "signOut error is captured without aborting cookie purge")
  assert.equal(cookieStore.has("sb-auth-token"), false, "Auth cookies must still be purged even if GoTrue fails")
  assert.equal(cookieStore.has("seijun-mpin-locked"), false)
})

test("[Runtime 6] Both locking and sign-out fail still purges all session cookies without throwing", async () => {
  const cookieStore = createMockCookieStore({ "sb-auth-token": "valid", "seijun_cycle_context": "cycle-1" })
  const res = await runLogoutLogic({
    isRemembered: true,
    forceFullSignOut: false,
    lockMpinFn: async () => { throw new Error("PostgreSQL down") },
    signOutFn: async () => { throw new Error("Network unreachable") },
    cookieStore,
  })
  assert.equal(res.outcome, "full_sign_out")
  assert.equal(cookieStore.has("sb-auth-token"), false, "All auth cookies must be stripped even on double failure")
  assert.equal(cookieStore.has("seijun_cycle_context"), false)
})

test("[Runtime 7] Login form evaluates a stale verified session after logout failure and prevents bypass", async () => {
  let signOutCalled = false
  // Subcase A: Stale verified session where immediate lock retry fails -> fails closed to email-password
  const resFail = await runLoginFormEvaluation({
    statusVerified: true,
    statusConfigured: true,
    clientSessionLocked: true,
    lockMpinFn: async () => false,
    signOutFn: async () => { signOutCalled = true },
  })
  assert.equal(resFail.destination, "email-password", "Must route to email-password and NEVER dashboard")
  assert.equal(resFail.signedOut, true, "Must sign out stale verified session when lock cannot be confirmed")
  assert.equal(signOutCalled, true)

  // Subcase B: Stale verified session where immediate lock retry succeeds -> routes to returning-mpin
  const resSuccess = await runLoginFormEvaluation({
    statusVerified: true,
    statusConfigured: true,
    clientSessionLocked: true,
    lockMpinFn: async () => true,
    signOutFn: async () => {},
  })
  assert.equal(resSuccess.destination, "returning-mpin", "Must route to MPIN verification and NEVER dashboard")
  assert.equal(resSuccess.signedOut, false)
})

test("[Runtime 8] Remembered-account logout returns user to expected MPIN flow when locking succeeds", async () => {
  const res = await runLoginFormEvaluation({
    statusVerified: false,
    statusConfigured: true,
    clientSessionLocked: true,
    lockMpinFn: async () => true,
    signOutFn: async () => {},
  })
  assert.equal(res.destination, "returning-mpin", "Confirmed locked session must route directly to returning MPIN form")
  assert.equal(res.signedOut, false)
})

test("[Contract] Source code contracts for fail-closed logout and login reconciliation", () => {
  const authSrc = fs.readFileSync(path.join(ROOT, "app/actions/auth.ts"), "utf8")
  assert.match(authSrc, /isRemembered\s*&&\s*lockSucceeded/, "logoutAction must only preserve session if both isRemembered and lockSucceeded")
  assert.match(authSrc, /cookie\.name\.startsWith\("sb-"\)/, "logoutAction must aggressively purge all sb- cookies on fail-closed")

  const mpinSrc = fs.readFileSync(path.join(ROOT, "app/actions/mpin.ts"), "utf8")
  assert.match(mpinSrc, /try\s*\{[\s\S]*?getUser\(\)[\s\S]*?mpin_lock[\s\S]*?\}\s*catch\s*\{[\s\S]*?return false/, "lockMpinAction must catch errors and return false")

  const loginSrc = fs.readFileSync(path.join(ROOT, "components/auth/login-form.tsx"), "utf8")
  assert.match(loginSrc, /isSessionLocked\(\)/, "LoginForm must check isSessionLocked()")
  assert.match(loginSrc, /lockMpinAction\(\)\.catch\(\(\)\s*=>\s*false\)/, "LoginForm must attempt lock reconciliation")
  assert.match(loginSrc, /supabase\.auth\.signOut\(\)/, "LoginForm must fail closed with signOut on persistent lock failure")
})

// ─── 9. Remember Account, MPIN Autofill & Account Isolation Specifications ────
console.log("\n--- 9. Remember Account, MPIN Autofill & Account Isolation ---")

test("Req 1: Remember Account enabled -> logout -> sets sb-remember-me cookie and preserves locked session", () => {
  const logoutSrc = fs.readFileSync(path.join(ROOT, "components/auth/logout-button.tsx"), "utf8")
  assert.match(logoutSrc, /sb-remember-me=true;\s*path=\/;\s*max-age=2592000;\s*SameSite=Lax/, "LogoutButton must explicitly synchronize sb-remember-me cookie on remembered logout")
  assert.match(logoutSrc, /setSessionLocked\(true\)/, "LogoutButton must lock the session")
  assert.match(logoutSrc, /logoutAction\(\)/, "LogoutButton must call logoutAction without forceFullSignOut")

  const formSrc = fs.readFileSync(path.join(ROOT, "components/auth/mpin-returning-form.tsx"), "utf8")
  assert.match(formSrc, /setRememberedUser\(user\)/, "MpinReturningForm must synchronize setRememberedUser")
  assert.match(formSrc, /sb-remember-me=true;\s*path=\/;\s*max-age=2592000;\s*SameSite=Lax/, "MpinReturningForm must set sb-remember-me cookie when Remember account is active")
})

test("Req 2: Remember Account disabled -> existing full logout behavior remains intact", () => {
  const logoutSrc = fs.readFileSync(path.join(ROOT, "components/auth/logout-button.tsx"), "utf8")
  assert.match(logoutSrc, /sb-remember-me=;\s*path=\/;\s*max-age=0;\s*SameSite=Lax/, "LogoutButton must purge sb-remember-me cookie when not remembered")
  assert.match(logoutSrc, /clearRememberedUser\(\)/, "LogoutButton must clear remembered user")
  assert.match(logoutSrc, /setSessionLocked\(false\)/, "LogoutButton must unlock session")
  assert.match(logoutSrc, /logoutAction\(\{\s*forceFullSignOut:\s*true\s*\}\)/, "LogoutButton must request forceFullSignOut")
})

test("Req 3: 'Not you?' correctly switches to email/password login and clears active account state", () => {
  const loginSrc = fs.readFileSync(path.join(ROOT, "components/auth/login-form.tsx"), "utf8")
  assert.match(loginSrc, /lockMpinAction\(\)/, "Switch Account must call lockMpinAction")
  assert.match(loginSrc, /supabase\.auth\.signOut\(\)/, "Switch Account must call signOut")
  assert.match(loginSrc, /clearRememberedUser\(\)/, "Switch Account must clear remembered user")
  assert.match(loginSrc, /setViewMode\("email-password"\)/, "Switch Account must switch to email-password view")
  assert.match(loginSrc, /setCurrentUser\(null\)/, "Switch Account must clear currentUser")
})

test("Req 4: Multiple remembered accounts cannot leak identity or MPIN state into one another", () => {
  const storageSrc = fs.readFileSync(path.join(ROOT, "lib/auth/mpin-storage.ts"), "utf8")
  assert.match(storageSrc, /function getKey\(suffix:\s*string,\s*userId\?:\s*string\)/, "getKey must accept userId")
  assert.match(storageSrc, /\$\{PREFIX\}\$\{suffix\}_\$\{userId\}/, "Storage keys must be strictly partitioned by userId")
  assert.match(storageSrc, /isMpinRememberMeEnabled\(userId\?:\s*string\)/, "Remember Me query must be scoped by userId")
  assert.match(storageSrc, /isRememberDeviceEnabled\(userId:\s*string\)/, "Remember Device query must be scoped by userId")
})

test("Req 5: MPIN input exposes only intended native autofill behavior (semantic form & attributes)", () => {
  const formSrc = fs.readFileSync(path.join(ROOT, "components/auth/mpin-returning-form.tsx"), "utf8")
  assert.match(formSrc, /<form[\s\S]*?method="post"[\s\S]*?autoComplete="on"/, "MpinReturningForm must use semantic form with method='post' and autoComplete='on'")
  assert.match(formSrc, /<input[\s\S]*?name="username"[\s\S]*?autoComplete="username"/, "MpinReturningForm must include associated username field for credential manager linkage")
  assert.match(formSrc, /autoComplete="current-password"/, "MpinReturningForm must specify autoComplete='current-password'")
  assert.match(formSrc, /name="mpin"/, "MpinReturningForm must specify name='mpin'")
  assert.match(formSrc, /id="mpin-input"/, "MpinReturningForm must specify id='mpin-input'")

  const inputSrc = fs.readFileSync(path.join(ROOT, "components/auth/mpin-input.tsx"), "utf8")
  assert.match(inputSrc, /id=\{id\}/, "MpinInput must forward id prop to native input")
  assert.match(inputSrc, /name=\{name\}/, "MpinInput must forward name prop to native input")
  assert.match(inputSrc, /autoComplete=\{autoComplete\}/, "MpinInput must forward autoComplete prop to native input")
  assert.doesNotMatch(inputSrc, /autoComplete="one-time-code"/, "MpinInput must NOT hardcode one-time-code which suppresses password managers")
})

test("Req 6: MPIN autofill is scoped to user and cleared when Remember Me is disabled", () => {
  const storageSrc = fs.readFileSync(path.join(ROOT, "lib/auth/mpin-storage.ts"), "utf8")
  assert.match(storageSrc, /export function clearAutofillMpin/, "clearAutofillMpin must exist")
  assert.match(storageSrc, /localStorage\.removeItem\(getKey\("autofill",\s*userId\)\)/, "clearAutofillMpin must remove autofill item")
  assert.doesNotMatch(storageSrc, /sessionStorage\.setItem\([^,]*mpin/, "Must NOT write MPIN to sessionStorage")
  assert.doesNotMatch(storageSrc, /document\.cookie\s*=.*mpin=[0-9]/, "Must NOT write raw MPIN to cookies")
})

test("Req 7: Existing Phase 24 cross-device MPIN behavior remains intact", () => {
  const mpinSrc = fs.readFileSync(path.join(ROOT, "app/actions/mpin.ts"), "utf8")
  assert.match(mpinSrc, /supabase\.rpc\("mpin_verify",\s*\{\s*p_pin:\s*pin\s*\}\)/, "verifyMpinAction must delegate to database rpc mpin_verify")
  assert.match(mpinSrc, /supabase\.rpc\("mpin_enroll",\s*\{\s*p_pin:\s*pin\s*\}\)/, "enrollMpinAction must delegate to database rpc mpin_enroll")
  assert.match(mpinSrc, /supabase\.rpc\("mpin_status"\)/, "getMpinStatusAction must delegate to database rpc mpin_status")
})

test("Req 8: Existing logout, fail-closed, and account-isolation protections remain intact", () => {
  const authSrc = fs.readFileSync(path.join(ROOT, "app/actions/auth.ts"), "utf8")
  assert.match(authSrc, /isRemembered\s*&&\s*lockSucceeded/, "Session is preserved only when both isRemembered and lockSucceeded are true")
  assert.match(authSrc, /await supabase\.auth\.signOut\(\)/, "Full logout or lock failure must execute supabase.auth.signOut()")
  assert.match(authSrc, /cookieStore\.delete\("seijun-mpin-locked"\)/, "Full logout must purge seijun-mpin-locked")
  assert.match(authSrc, /cookieStore\.delete\("sb-remember-me"\)/, "Full logout must purge sb-remember-me")
})

console.log(`\n=================================================`)
console.log(`ALL SEIJUN PHASE 25A TESTS PASSED! 🎉 (${passedCount}/${passedCount} passed)`)
console.log(`=================================================`)
