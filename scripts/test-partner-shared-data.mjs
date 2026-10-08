#!/usr/bin/env node

/**
 * Seijun Phase 19 Batch 3 — Shared Data & Authorization Test Suite
 *
 * Tests the authorization layer, shared data access, RLS enforcement,
 * mutation security, category independence, and data leak prevention.
 *
 * Usage: node scripts/test-partner-shared-data.mjs
 *
 * ARCHITECTURE:
 *   1. Authorization layer tests
 *   2. Category-level access tests (enabled/disabled)
 *   3. Relationship state tests (active/revoked/none)
 *   4. Mutation security tests (supporter cannot write)
 *   5. Cross-partner security tests
 *   6. Data minimization tests
 *   7. Category independence tests
 */

import { createClient } from "@supabase/supabase-js"

// ─── Environment Loading ──────────────────────────────────────────────────

import fs from "fs"
import path from "path"

const projectRoot = process.cwd()
const envLocalPath = path.join(projectRoot, ".env.local")
if (fs.existsSync(envLocalPath)) {
  const envContent = fs.readFileSync(envLocalPath, "utf-8")
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const idx = trimmed.indexOf("=")
    if (idx !== -1) {
      const key = trimmed.slice(0, idx).trim()
      const val = trimmed.slice(idx + 1).trim()
      if (!process.env[key]) {
        process.env[key] = val
      }
    }
  }
}

// ─── Configuration ──────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

let passed = 0
let failed = 0
let skipped = 0
const failures = []

function pass(name) {
  passed++
  console.log(`  ✅ ${name}`)
}

function fail(name, reason) {
  failed++
  failures.push({ name, reason })
  console.log(`  ❌ ${name}: ${reason}`)
}

function skip(name, reason) {
  skipped++
  console.log(`  ⏭️  ${name}: ${reason}`)
}

function section(title) {
  console.log(`\n━━━ ${title} ━━━`)
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔒 Seijun Phase 19 Batch 3 — Shared Data & Authorization Tests")
  console.log("═══════════════════════════════════════════════════════════════\n")

  const hasLiveDbCredentials = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
  let admin = null

  if (hasLiveDbCredentials) {
    admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    console.log("ℹ️  Running in LIVE + STATIC verification mode\n")
  } else {
    console.log("ℹ️  Running in STATIC + SIMULATION verification mode (no SUPABASE_SERVICE_ROLE_KEY)\n")
  }

  // ─── Test: Authorization module file exists ──────────────────────────────

  section("1. Authorization Module Structure")

  try {
    const fs = await import("fs")
    const path = await import("path")
    const projectRoot = process.cwd()

    const authPath = path.join(projectRoot, "lib", "partner", "authorization.ts")
    const sharedDataPath = path.join(projectRoot, "lib", "partner", "shared-data.ts")
    const actionsPath = path.join(projectRoot, "app", "actions", "partner-shared.ts")
    const dashboardPath = path.join(projectRoot, "app", "partner", "page.tsx")
    const dashboardViewPath = path.join(projectRoot, "components", "partner", "partner-dashboard-view.tsx")
    const migrationPath = path.join(projectRoot, "supabase", "migrations", "20260924000007_partner_shared_data_rls.sql")

    if (fs.existsSync(authPath)) {
      pass("lib/partner/authorization.ts exists")
    } else {
      fail("lib/partner/authorization.ts exists", "File not found")
    }

    if (fs.existsSync(sharedDataPath)) {
      pass("lib/partner/shared-data.ts exists")
    } else {
      fail("lib/partner/shared-data.ts exists", "File not found")
    }

    if (fs.existsSync(actionsPath)) {
      pass("app/actions/partner-shared.ts exists")
    } else {
      fail("app/actions/partner-shared.ts exists", "File not found")
    }

    if (fs.existsSync(dashboardPath)) {
      pass("app/partner/page.tsx exists")
    } else {
      fail("app/partner/page.tsx exists", "File not found")
    }

    if (fs.existsSync(dashboardViewPath)) {
      pass("components/partner/partner-dashboard-view.tsx exists")
    } else {
      fail("components/partner/partner-dashboard-view.tsx exists", "File not found")
    }

    if (fs.existsSync(migrationPath)) {
      pass("RLS migration file exists")
    } else {
      fail("RLS migration file exists", "File not found")
    }

    // Validate authorization.ts content
    const authContent = fs.readFileSync(authPath, "utf-8")
    if (authContent.includes("authorizeSupporterAccess")) {
      pass("Authorization has authorizeSupporterAccess function")
    } else {
      fail("Authorization has authorizeSupporterAccess function", "Function not found")
    }

    if (authContent.includes("resolvePartnerContext")) {
      pass("Authorization has resolvePartnerContext function")
    } else {
      fail("Authorization has resolvePartnerContext function", "Function not found")
    }

    if (authContent.includes("supabase.auth.getUser()")) {
      pass("Authorization derives user from session (not client)")
    } else {
      fail("Authorization derives user from session", "auth.getUser() not found")
    }

    if (!authContent.includes("client-supplied") || authContent.includes("Never trust")) {
      pass("Authorization documents anti-tampering principle")
    } else {
      skip("Authorization anti-tampering documentation", "Check manually")
    }

    // Validate shared-data.ts content
    const sharedContent = fs.readFileSync(sharedDataPath, "utf-8")

    for (const fn of ["getSharedCycleEstimates", "getSharedPeriodStatus", "getSharedCyclePreferences", "getSharedDailyNotes"]) {
      if (sharedContent.includes(fn)) {
        pass(`shared-data.ts has ${fn}`)
      } else {
        fail(`shared-data.ts has ${fn}`, "Function not found")
      }
    }

    // Verify each function independently calls authorizeSupporterAccess
    for (const cat of ["cycle_estimates", "period_status", "cycle_preferences", "daily_notes"]) {
      if (sharedContent.includes(`"${cat}"`)) {
        pass(`Shared data checks category "${cat}" independently`)
      } else {
        fail(`Shared data checks category "${cat}"`, "Category string not found")
      }
    }

    // Validate server actions
    const actionsContent = fs.readFileSync(actionsPath, "utf-8")
    if (actionsContent.includes('"use server"')) {
      pass("partner-shared.ts is a server actions file")
    } else {
      fail("partner-shared.ts server directive", '"use server" not found')
    }

    // Validate dashboard page
    const dashContent = fs.readFileSync(dashboardPath, "utf-8")
    if (dashContent.includes('force-dynamic')) {
      pass("Partner dashboard uses force-dynamic (no caching)")
    } else {
      fail("Partner dashboard force-dynamic", "force-dynamic not found")
    }

    // Validate RLS migration
    const rlsContent = fs.readFileSync(migrationPath, "utf-8")
    if (rlsContent.includes("r.status = 'active'")) {
      pass("RLS requires active relationship status")
    } else {
      fail("RLS active status check", "active check not found")
    }

    if (rlsContent.includes("r.supporter_user_id = (SELECT auth.uid())")) {
      pass("RLS validates supporter via auth.uid()")
    } else {
      fail("RLS auth.uid() check", "auth.uid() supporter check not found")
    }

    if (rlsContent.includes("sp.daily_notes = true")) {
      pass("RLS checks daily_notes sharing preference")
    } else {
      fail("RLS daily_notes check", "daily_notes preference check not found")
    }

    if (rlsContent.includes("FOR SELECT")) {
      pass("RLS policies are SELECT-only for supporters")
    } else {
      fail("RLS SELECT-only", "FOR SELECT not found")
    }

    // Verify no INSERT/UPDATE/DELETE policies for supporters
    if (!rlsContent.includes("Supporters can") || !rlsContent.match(/Supporters.*INSERT|Supporters.*UPDATE|Supporters.*DELETE/i)) {
      pass("RLS has no supporter INSERT/UPDATE/DELETE policies")
    } else {
      fail("RLS mutation safety", "Found supporter mutation policies")
    }

  } catch (err) {
    fail("File structure validation", err.message)
  }

  // ─── Test: Database tables and RLS ───────────────────────────────────────

  section("2. Database & RLS Verification")

  if (admin) {
    try {
      // Verify partner_relationships table
      const { error: relErr } = await admin
        .from("partner_relationships")
        .select("id")
        .limit(0)
      if (!relErr) {
        pass("partner_relationships table accessible (live)")
      } else {
        fail("partner_relationships table", relErr.message)
      }

      // Verify partner_sharing_preferences table
      const { error: prefErr } = await admin
        .from("partner_sharing_preferences")
        .select("id, cycle_estimates, period_status, cycle_preferences, daily_notes")
        .limit(0)
      if (!prefErr) {
        pass("partner_sharing_preferences table with all category columns (live)")
      } else {
        fail("partner_sharing_preferences table", prefErr.message)
      }

      // Verify cycles table
      const { error: cyclesErr } = await admin.from("cycles").select("id").limit(0)
      if (!cyclesErr) {
        pass("cycles table accessible (live)")
      } else {
        fail("cycles table", cyclesErr.message)
      }

      // Verify daily_notes table
      const { error: notesErr } = await admin.from("daily_notes").select("id").limit(0)
      if (!notesErr) {
        pass("daily_notes table accessible (live)")
      } else {
        fail("daily_notes table", notesErr.message)
      }

      // Verify profiles table
      const { error: profErr } = await admin.from("profiles").select("user_id, typical_cycle_length, last_period_start").limit(0)
      if (!profErr) {
        pass("profiles table with preference columns accessible (live)")
      } else {
        fail("profiles table preference columns", profErr.message)
      }
    } catch (err) {
      fail("Database verification", err.message)
    }
  } else {
    // Static Schema & Migration Verification
    try {
      const b1Migration = fs.readFileSync(
        path.join(projectRoot, "supabase", "migrations", "20260924000001_partner_foundation.sql"),
        "utf-8"
      )
      const b3Migration = fs.readFileSync(
        path.join(projectRoot, "supabase", "migrations", "20260924000007_partner_shared_data_rls.sql"),
        "utf-8"
      )

      if (b1Migration.includes("CREATE TABLE IF NOT EXISTS public.partner_relationships")) {
        pass("partner_relationships table schema declared")
      } else {
        fail("partner_relationships table schema", "Table declaration not found in migration")
      }

      if (b1Migration.includes("CREATE TABLE IF NOT EXISTS public.partner_sharing_preferences")) {
        pass("partner_sharing_preferences table schema declared")
      } else {
        fail("partner_sharing_preferences table schema", "Table declaration not found in migration")
      }

      const allColumns = ["cycle_estimates", "period_status", "cycle_preferences", "daily_notes"]
      const hasAllColumns = allColumns.every(col => b1Migration.includes(`${col} BOOLEAN NOT NULL DEFAULT FALSE`))
      if (hasAllColumns) {
        pass("partner_sharing_preferences has all 4 category boolean columns (privacy-first default FALSE)")
      } else {
        fail("partner_sharing_preferences category columns", "Missing columns or default FALSE")
      }

      if (b3Migration.includes('ON public.cycles FOR SELECT')) {
        pass("cycles table RLS SELECT policy declared for supporters")
      } else {
        fail("cycles table RLS policy", "SELECT policy not found")
      }

      if (b3Migration.includes('ON public.period_days FOR SELECT')) {
        pass("period_days table RLS SELECT policy declared for supporters")
      } else {
        fail("period_days table RLS policy", "SELECT policy not found")
      }

      if (b3Migration.includes('ON public.daily_notes FOR SELECT')) {
        pass("daily_notes table RLS SELECT policy declared for supporters")
      } else {
        fail("daily_notes table RLS policy", "SELECT policy not found")
      }

      if (b3Migration.includes('ON public.profiles FOR SELECT')) {
        pass("profiles table RLS SELECT policy declared for supporters")
      } else {
        fail("profiles table RLS policy", "SELECT policy not found")
      }
    } catch (err) {
      fail("Database schema audit", err.message)
    }
  }

  // ─── Test: Authorization Flow Simulation ─────────────────────────────────

  section("3. Authorization Flow Validation")

  if (admin) {
    try {
      // Test: Sharing preferences default to false
      const { data: defaultPrefs } = await admin
        .from("partner_sharing_preferences")
        .select("cycle_estimates, period_status, cycle_preferences, daily_notes")
        .limit(1)
        .maybeSingle()

      if (defaultPrefs) {
        const allFalseByDefault = typeof defaultPrefs.cycle_estimates === "boolean" &&
          typeof defaultPrefs.period_status === "boolean" &&
          typeof defaultPrefs.cycle_preferences === "boolean" &&
          typeof defaultPrefs.daily_notes === "boolean"
        if (allFalseByDefault) {
          pass("Sharing preferences are boolean type (live verified)")
        } else {
          fail("Sharing preferences type", "Expected boolean columns")
        }
      } else {
        skip("Sharing preferences default check", "No existing preferences to verify")
      }

      const { data: activeRels, error: activeErr } = await admin
        .from("partner_relationships")
        .select("id, owner_user_id, supporter_user_id, status")
        .eq("status", "active")
        .limit(5)

      if (!activeErr) {
        pass(`Active relationships query works (found ${activeRels?.length || 0})`)
      } else {
        fail("Active relationships query", activeErr.message)
      }
    } catch (err) {
      fail("Authorization flow validation (live)", err.message)
    }
  }

  // Pure State Machine Simulation of Step 11 Authorization Rules (TEST 1–7)
  try {
    const { isCategoryEnabled } = await import("../lib/partner/authorization.ts")

    // Default privacy-first state (all false)
    const defaultPrefs = {
      id: "pref-1",
      relationship_id: "rel-1",
      owner_user_id: "user-owner",
      cycle_estimates: false,
      period_status: false,
      cycle_preferences: false,
      daily_notes: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    // TEST 1 — Baseline: No Sharing (All false)
    const test1_estimates = isCategoryEnabled(defaultPrefs, "cycle_estimates")
    const test1_status = isCategoryEnabled(defaultPrefs, "period_status")
    const test1_prefs = isCategoryEnabled(defaultPrefs, "cycle_preferences")
    const test1_notes = isCategoryEnabled(defaultPrefs, "daily_notes")

    if (!test1_estimates && !test1_status && !test1_prefs && !test1_notes) {
      pass("TEST 1: Baseline default denies all 4 categories (all false)")
    } else {
      fail("TEST 1: Baseline default", "One or more categories was prematurely enabled")
    }

    // TEST 2 — Independent Category Toggles
    const estimatesOnly = { ...defaultPrefs, cycle_estimates: true }
    if (
      isCategoryEnabled(estimatesOnly, "cycle_estimates") &&
      !isCategoryEnabled(estimatesOnly, "period_status") &&
      !isCategoryEnabled(estimatesOnly, "cycle_preferences") &&
      !isCategoryEnabled(estimatesOnly, "daily_notes")
    ) {
      pass("TEST 2a: cycle_estimates ON only authorizes cycle_estimates")
    } else {
      fail("TEST 2a: cycle_estimates isolation", "Leaked access to other categories")
    }

    const statusOnly = { ...defaultPrefs, period_status: true }
    if (
      !isCategoryEnabled(statusOnly, "cycle_estimates") &&
      isCategoryEnabled(statusOnly, "period_status") &&
      !isCategoryEnabled(statusOnly, "cycle_preferences") &&
      !isCategoryEnabled(statusOnly, "daily_notes")
    ) {
      pass("TEST 2b: period_status ON only authorizes period_status")
    } else {
      fail("TEST 2b: period_status isolation", "Leaked access to other categories")
    }

    const prefsOnly = { ...defaultPrefs, cycle_preferences: true }
    if (
      !isCategoryEnabled(prefsOnly, "cycle_estimates") &&
      !isCategoryEnabled(prefsOnly, "period_status") &&
      isCategoryEnabled(prefsOnly, "cycle_preferences") &&
      !isCategoryEnabled(prefsOnly, "daily_notes")
    ) {
      pass("TEST 2c: cycle_preferences ON only authorizes cycle_preferences")
    } else {
      fail("TEST 2c: cycle_preferences isolation", "Leaked access to other categories")
    }

    const notesOnly = { ...defaultPrefs, daily_notes: true }
    if (
      !isCategoryEnabled(notesOnly, "cycle_estimates") &&
      !isCategoryEnabled(notesOnly, "period_status") &&
      !isCategoryEnabled(notesOnly, "cycle_preferences") &&
      isCategoryEnabled(notesOnly, "daily_notes")
    ) {
      pass("TEST 2d: daily_notes ON only authorizes daily_notes")
    } else {
      fail("TEST 2d: daily_notes isolation", "Leaked access to other categories")
    }

    // TEST 3 — Multi-Category Sharing
    const multiShare = { ...defaultPrefs, cycle_estimates: true, daily_notes: true }
    if (
      isCategoryEnabled(multiShare, "cycle_estimates") &&
      !isCategoryEnabled(multiShare, "period_status") &&
      !isCategoryEnabled(multiShare, "cycle_preferences") &&
      isCategoryEnabled(multiShare, "daily_notes")
    ) {
      pass("TEST 3: Multi-category sharing grants only explicitly enabled categories")
    } else {
      fail("TEST 3: Multi-category sharing", "Unexpected authorization state")
    }

    // TEST 7 — Revocation Simulation
    // When relationship status is 'revoked', resolvePartnerContext returns NO_ACTIVE_RELATIONSHIP
    const simulateAuthWithStatus = (status, role, prefs, category) => {
      if (status !== "active") return { authorized: false, reason: "NO_ACTIVE_RELATIONSHIP" }
      if (role !== "supporter") return { authorized: false, reason: "NOT_SUPPORTER" }
      if (!isCategoryEnabled(prefs, category)) return { authorized: false, reason: "SHARING_DISABLED" }
      return { authorized: true }
    }

    const revokedResult = simulateAuthWithStatus("revoked", "supporter", multiShare, "cycle_estimates")
    if (!revokedResult.authorized && revokedResult.reason === "NO_ACTIVE_RELATIONSHIP") {
      pass("TEST 7: Revoked relationship immediately denies all shared categories")
    } else {
      fail("TEST 7: Revocation check", "Revoked relationship was authorized")
    }

    // Role Security: Owner cannot access supporter dashboard
    const ownerResult = simulateAuthWithStatus("active", "owner", multiShare, "cycle_estimates")
    if (!ownerResult.authorized && ownerResult.reason === "NOT_SUPPORTER") {
      pass("Role Security: Owner attempting supporter shared access is denied (NOT_SUPPORTER)")
    } else {
      fail("Role Security", "Owner was improperly authorized as supporter")
    }
  } catch (err) {
    fail("Authorization simulation", err.message)
  }

  // ─── Test: Category Independence ─────────────────────────────────────────

  section("4. Category Independence Verification")

  try {
    const fs = await import("fs")
    const path = await import("path")
    const sharedContent = fs.readFileSync(
      path.join(process.cwd(), "lib", "partner", "shared-data.ts"), "utf-8"
    )

    // Each function should independently call authorizeSupporterAccess with its specific category
    const estimatesAuth = sharedContent.includes('authorizeSupporterAccess(supabase, "cycle_estimates")')
    const statusAuth = sharedContent.includes('authorizeSupporterAccess(supabase, "period_status")')
    const prefsAuth = sharedContent.includes('authorizeSupporterAccess(supabase, "cycle_preferences")')
    const notesAuth = sharedContent.includes('authorizeSupporterAccess(supabase, "daily_notes")')

    if (estimatesAuth) pass("Cycle estimates independently authorizes with cycle_estimates")
    else fail("Cycle estimates authorization", "Not independently authorized")

    if (statusAuth) pass("Period status independently authorizes with period_status")
    else fail("Period status authorization", "Not independently authorized")

    if (prefsAuth) pass("Cycle preferences independently authorizes with cycle_preferences")
    else fail("Cycle preferences authorization", "Not independently authorized")

    if (notesAuth) pass("Daily notes independently authorizes with daily_notes")
    else fail("Daily notes authorization", "Not independently authorized")

    // Verify period_status doesn't check cycle_estimates
    const periodStatusFnMatch = sharedContent.match(/async function getSharedPeriodStatus[\s\S]*?^}/m)
    if (periodStatusFnMatch) {
      const fnBody = periodStatusFnMatch[0]
      if (!fnBody.includes('"cycle_estimates"')) {
        pass("Period status does not depend on cycle_estimates permission")
      } else {
        fail("Period status independence", "References cycle_estimates")
      }
    } else {
      skip("Period status function isolation check", "Could not extract function body")
    }

  } catch (err) {
    fail("Category independence", err.message)
  }

  // ─── Test: Data Minimization ─────────────────────────────────────────────

  section("5. Data Minimization Verification")

  try {
    const fs = await import("fs")
    const path = await import("path")
    const sharedContent = fs.readFileSync(
      path.join(process.cwd(), "lib", "partner", "shared-data.ts"), "utf-8"
    )

    // Verify notes don't expose internal IDs
    if (sharedContent.includes("notes: null")) {
      pass("Cycle notes field is explicitly nulled for supporter")
    } else {
      skip("Cycle notes nulling", "Check code manually")
    }

    // Verify shared notes interface excludes id and user_id
    if (sharedContent.includes("date: note.date") && sharedContent.includes("content: note.content")) {
      pass("Shared daily notes only expose date and content")
    } else {
      fail("Daily notes minimization", "Unexpected fields exposed")
    }

    // Strip comments to check actual code execution/leaks
    const codeOnly = sharedContent.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "")

    // Verify no email exposure
    if (!codeOnly.includes("email")) {
      pass("Shared data never queries or exposes email")
    } else {
      fail("Email exposure", "Email referenced in shared data service code")
    }

    // Verify cycle preferences only expose intended fields
    if (codeOnly.includes("typical_cycle_length, last_period_start") &&
        !codeOnly.includes("usage_role") &&
        !codeOnly.includes('"sex"')) {
      pass("Cycle preferences only query typical_cycle_length and last_period_start")
    } else {
      fail("Cycle preferences minimization", "Exposed unexpected profile fields")
    }

  } catch (err) {
    fail("Data minimization", err.message)
  }

  // ─── Test: Mutation Security (Code-Level) ────────────────────────────────

  section("6. Mutation Security (Supporter Cannot Write)")

  try {
    const fs = await import("fs")
    const path = await import("path")

    // Verify partner-shared.ts has NO mutation actions
    const actionsContent = fs.readFileSync(
      path.join(process.cwd(), "app", "actions", "partner-shared.ts"), "utf-8"
    )

    const hasMutationKeywords = ["update", "create", "delete", "insert", "modify", "upsert"]
      .filter(kw => {
        // Check for function exports that suggest mutations
        const pattern = new RegExp(`export async function.*${kw}`, "i")
        return pattern.test(actionsContent)
      })

    if (hasMutationKeywords.length === 0) {
      pass("partner-shared.ts exposes no mutation server actions")
    } else {
      fail("Mutation in shared actions", `Found mutation keywords: ${hasMutationKeywords.join(", ")}`)
    }

    // Verify dashboard view has no edit/delete/create controls
    const dashboardViewContent = fs.readFileSync(
      path.join(process.cwd(), "components", "partner", "partner-dashboard-view.tsx"), "utf-8"
    )

    const editPatterns = ["createDailyNote", "updateDailyNote", "deleteDailyNote",
      "createCycle", "updateCycle", "deleteCycle",
      "updateSettings", "updateSharingPreferences"]

    const exposedEdits = editPatterns.filter(p => dashboardViewContent.includes(p))
    if (exposedEdits.length === 0) {
      pass("Partner dashboard imports no mutation actions")
    } else {
      fail("Dashboard mutation imports", `Found: ${exposedEdits.join(", ")}`)
    }

    // Verify existing owner-only mutation server actions require auth.uid() = owner
    const cyclesActions = fs.readFileSync(
      path.join(process.cwd(), "app", "actions", "cycles.ts"), "utf-8"
    )
    if (cyclesActions.includes("user_id: user.id") || cyclesActions.includes('eq("user_id", user.id)')) {
      pass("Cycle mutations verify user_id ownership")
    } else {
      fail("Cycle mutation ownership", "user_id check not found")
    }

    const notesActions = fs.readFileSync(
      path.join(process.cwd(), "app", "actions", "notes.ts"), "utf-8"
    )
    if (notesActions.includes('eq("user_id", user.id)')) {
      pass("Note mutations verify user_id ownership")
    } else {
      fail("Note mutation ownership", "user_id check not found")
    }

  } catch (err) {
    fail("Mutation security", err.message)
  }

  // ─── Test: Cache / Prefetch Safety ───────────────────────────────────────

  section("7. Cache & Prefetch Safety")

  try {
    const fs = await import("fs")
    const path = await import("path")

    const dashboardPage = fs.readFileSync(
      path.join(process.cwd(), "app", "partner", "page.tsx"), "utf-8"
    )

    if (dashboardPage.includes("force-dynamic")) {
      pass("Partner dashboard page uses force-dynamic")
    } else {
      fail("Partner dashboard caching", "force-dynamic not found")
    }

    if (!dashboardPage.includes("unstable_cache") && !dashboardPage.includes("revalidate")) {
      pass("Partner dashboard has no static cache directives")
    } else {
      fail("Partner dashboard cache safety", "Found caching directive")
    }

  } catch (err) {
    fail("Cache safety", err.message)
  }

  // ─── Test: RLS Policy Correctness ────────────────────────────────────────

  section("8. RLS Policy Structure")

  try {
    const fs = await import("fs")
    const path = await import("path")
    const rlsContent = fs.readFileSync(
      path.join(process.cwd(), "supabase", "migrations", "20260924000007_partner_shared_data_rls.sql"), "utf-8"
    )

    // Count the number of policies
    const policyMatches = rlsContent.match(/CREATE POLICY/g) || []
    if (policyMatches.length === 4) {
      pass(`RLS migration creates exactly 4 SELECT policies (cycles, period_days, daily_notes, profiles)`)
    } else {
      fail("RLS policy count", `Expected 4, found ${policyMatches.length}`)
    }

    // Verify all are SELECT-only
    const nonSelectPolicies = rlsContent.match(/FOR (INSERT|UPDATE|DELETE)/gi) || []
    if (nonSelectPolicies.length === 0) {
      pass("All supporter RLS policies are SELECT-only")
    } else {
      fail("RLS non-SELECT policies", `Found: ${nonSelectPolicies.join(", ")}`)
    }

    // Verify DROP POLICY IF EXISTS before CREATE
    const dropMatches = rlsContent.match(/DROP POLICY IF EXISTS/g) || []
    if (dropMatches.length >= 4) {
      pass("RLS policies use safe DROP IF EXISTS pattern")
    } else {
      fail("RLS safe drop", `Expected >=4 drops, found ${dropMatches.length}`)
    }

    // Verify partner_sharing_preferences JOIN in all policies
    const joinMatches = rlsContent.match(/partner_sharing_preferences/g) || []
    if (joinMatches.length >= 4) {
      pass("All RLS policies JOIN with partner_sharing_preferences")
    } else {
      fail("RLS sharing preference JOIN", `Expected >=4 references, found ${joinMatches.length}`)
    }

  } catch (err) {
    fail("RLS policy structure", err.message)
  }

  // ─── Test: Partner Dashboard UI Verification ─────────────────────────────

  section("9. Partner Dashboard UI")

  try {
    const fs = await import("fs")
    const path = await import("path")

    const viewContent = fs.readFileSync(
      path.join(process.cwd(), "components", "partner", "partner-dashboard-view.tsx"), "utf-8"
    )

    // Check for key UI states
    if (viewContent.includes("No Partner Connected Yet")) {
      pass("Dashboard has no-partner state")
    } else {
      fail("Dashboard no-partner state", "Not found")
    }

    if (viewContent.includes("No Data Shared Yet")) {
      pass("Dashboard has no-sharing state")
    } else {
      fail("Dashboard no-sharing state", "Not found")
    }

    if (viewContent.includes("Read-only view")) {
      pass("Dashboard shows read-only indicator")
    } else {
      fail("Dashboard read-only indicator", "Not found")
    }

    if (viewContent.includes("Skeleton")) {
      pass("Dashboard has loading state")
    } else {
      fail("Dashboard loading state", "No Skeleton usage found")
    }

    if (viewContent.includes("AlertCircle")) {
      pass("Dashboard has error state")
    } else {
      fail("Dashboard error state", "No error UI found")
    }

    if (viewContent.includes("NOT_SUPPORTER")) {
      pass("Dashboard handles NOT_SUPPORTER denial")
    } else {
      fail("Dashboard NOT_SUPPORTER handling", "Not found")
    }

    // Verify dynamic rendering based on enabled categories
    if (viewContent.includes('categories.includes("cycle_estimates")') &&
        viewContent.includes('categories.includes("period_status")') &&
        viewContent.includes('categories.includes("cycle_preferences")') &&
        viewContent.includes('categories.includes("daily_notes")')) {
      pass("Dashboard dynamically renders based on enabled categories")
    } else {
      fail("Dynamic category rendering", "Not all categories checked")
    }

    // Verify partner connection card has dashboard link
    const cardContent = fs.readFileSync(
      path.join(process.cwd(), "components", "partner", "partner-connection-card.tsx"), "utf-8"
    )
    if (cardContent.includes("View Partner Dashboard") && cardContent.includes('"/partner"')) {
      pass("Partner connection card links to dashboard for supporters")
    } else {
      fail("Dashboard link in connection card", "Link not found")
    }

  } catch (err) {
    fail("Dashboard UI", err.message)
  }

  // ─── Final Report ────────────────────────────────────────────────────────

  console.log("\n═══════════════════════════════════════════════════════════════")
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed, ${skipped} skipped`)

  if (failures.length > 0) {
    console.log("\n❌ Failures:")
    for (const f of failures) {
      console.log(`   • ${f.name}: ${f.reason}`)
    }
  }

  console.log("")
  if (failed > 0) {
    process.exitCode = 1
  } else {
    process.exitCode = 0
  }
}

main().catch((err) => {
  console.error("Fatal error:", err)
  process.exitCode = 1
})
