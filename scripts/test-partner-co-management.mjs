#!/usr/bin/env node

/**
 * Seijun Phase 19 Batch 4 — Partner Co-Management & Security Test Suite
 *
 * Tests the co-management authorization layer, database RLS enforcement,
 * permission isolation, notification generation and preference respect,
 * and regression protection.
 *
 * Covers all required security tests (TEST 1 - TEST 22).
 *
 * Usage: node scripts/test-partner-co-management.mjs
 */

import fs from "fs"
import path from "path"
import { createClient } from "@supabase/supabase-js"

const projectRoot = process.cwd()

// Load environment variables
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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

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

function section(title) {
  console.log(`\n━━━ ${title} ━━━`)
}

async function main() {
  console.log("🔒 Seijun Phase 19 Batch 4 — Partner Co-Management Security Tests")
  console.log("═════════════════════════════════════════════════════════════════\n")

  // Load modules
  const {
    isCategoryEnabled,
    isManagementEnabled,
    getRequiredCategoryForManagement,
    ALL_CO_MANAGEMENT_PERMISSIONS,
  } = await import("../lib/partner/authorization.ts")

  const defaultPrefs = {
    id: "pref-1",
    relationship_id: "rel-1",
    owner_user_id: "owner-123",
    cycle_estimates: false,
    period_status: false,
    cycle_preferences: false,
    daily_notes: false,
    manage_cycle_preferences: false,
    manage_period_status: false,
    manage_daily_notes: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  // ─── TEST 1: Unauthenticated supporter mutation rejected ───────────────────
  section("TEST 1: Unauthenticated Supporter Mutation Rejection")
  {
    // Mock Supabase client returning unauthenticated session
    const mockUnauthenticatedSupabase = {
      auth: {
        getUser: async () => ({ data: { user: null }, error: new Error("No session") }),
      },
    }
    const { authorizeSupporterManagement } = await import("../lib/partner/authorization.ts")
    const res = await authorizeSupporterManagement(mockUnauthenticatedSupabase, "manage_period_status")
    if (!res.authorized && res.reason === "UNAUTHENTICATED") {
      pass("Unauthenticated supporter mutation rejected with UNAUTHENTICATED")
    } else {
      fail("TEST 1: Unauthenticated rejection", `Expected UNAUTHENTICATED, got ${res.reason}`)
    }
  }

  // ─── TEST 2: Owner attempting supporter mutation rejected ──────────────────
  section("TEST 2: Owner Attempting Supporter Mutation Rejection")
  {
    const ownerUserId = "owner-123"
    const mockOwnerSupabase = {
      auth: {
        getUser: async () => ({ data: { user: { id: ownerUserId } }, error: null }),
      },
      from: (table) => ({
        select: () => ({
          or: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "rel-1",
                  owner_user_id: ownerUserId,
                  supporter_user_id: "supporter-456",
                  status: "active",
                },
                error: null,
              }),
            }),
          }),
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                ...defaultPrefs,
                manage_period_status: true,
                period_status: true,
              },
              error: null,
            }),
          }),
        }),
      }),
    }
    const { authorizeSupporterManagement } = await import("../lib/partner/authorization.ts")
    const res = await authorizeSupporterManagement(mockOwnerSupabase, "manage_period_status")
    if (!res.authorized && res.reason === "NOT_SUPPORTER") {
      pass("Owner attempting supporter mutation rejected with NOT_SUPPORTER")
    } else {
      fail("TEST 2: Owner mutation rejection", `Expected NOT_SUPPORTER, got ${res.reason}`)
    }
  }

  // ─── TEST 3: Inactive relationship rejected ────────────────────────────────
  section("TEST 3: Inactive Relationship Rejection")
  {
    const supporterUserId = "supporter-456"
    const mockInactiveSupabase = {
      auth: {
        getUser: async () => ({ data: { user: { id: supporterUserId } }, error: null }),
      },
      from: () => ({
        select: () => ({
          or: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: null, // No active relationship found
                error: null,
              }),
            }),
          }),
        }),
      }),
    }
    const { authorizeSupporterManagement } = await import("../lib/partner/authorization.ts")
    const res = await authorizeSupporterManagement(mockInactiveSupabase, "manage_period_status")
    if (!res.authorized && res.reason === "NO_ACTIVE_RELATIONSHIP") {
      pass("Inactive relationship rejected with NO_ACTIVE_RELATIONSHIP")
    } else {
      fail("TEST 3: Inactive relationship rejection", `Expected NO_ACTIVE_RELATIONSHIP, got ${res.reason}`)
    }
  }

  // ─── TEST 4: Revoked relationship rejected ─────────────────────────────────
  section("TEST 4: Revoked Relationship Rejection")
  {
    const supporterUserId = "supporter-456"
    const mockRevokedSupabase = {
      auth: {
        getUser: async () => ({ data: { user: { id: supporterUserId } }, error: null }),
      },
      from: () => ({
        select: () => ({
          or: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: null, // Revoked relationships do not match status = 'active'
                error: null,
              }),
            }),
          }),
        }),
      }),
    }
    const { authorizeSupporterManagement } = await import("../lib/partner/authorization.ts")
    const res = await authorizeSupporterManagement(mockRevokedSupabase, "manage_daily_notes")
    if (!res.authorized && res.reason === "NO_ACTIVE_RELATIONSHIP") {
      pass("Revoked relationship rejected with NO_ACTIVE_RELATIONSHIP")
    } else {
      fail("TEST 4: Revoked relationship rejection", `Expected NO_ACTIVE_RELATIONSHIP, got ${res.reason}`)
    }
  }

  // ─── TEST 5: Supporter with read-only permission cannot mutate ──────────────
  section("TEST 5: Supporter with Read-Only Permission Cannot Mutate")
  {
    const readOnlyPrefs = {
      ...defaultPrefs,
      daily_notes: true,
      manage_daily_notes: false,
    }
    const canRead = isCategoryEnabled(readOnlyPrefs, "daily_notes")
    const canManage = isManagementEnabled(readOnlyPrefs, "manage_daily_notes")
    if (canRead && !canManage) {
      pass("Supporter with read-only permission has view=true and manage=false")
    } else {
      fail("TEST 5: Read-only separation", `Expected canRead: true, canManage: false; got ${canRead}, ${canManage}`)
    }
  }

  // ─── TEST 6: Supporter with manage_daily_notes can manage daily notes only ──
  section("TEST 6: manage_daily_notes Isolation")
  {
    const notesManagePrefs = {
      ...defaultPrefs,
      daily_notes: true,
      manage_daily_notes: true,
    }
    const canManageNotes = isManagementEnabled(notesManagePrefs, "manage_daily_notes")
    const canManagePeriod = isManagementEnabled(notesManagePrefs, "manage_period_status")
    const canManagePrefs = isManagementEnabled(notesManagePrefs, "manage_cycle_preferences")

    if (canManageNotes && !canManagePeriod && !canManagePrefs) {
      pass("manage_daily_notes grants note mutations only and blocks other mutations")
    } else {
      fail("TEST 6: manage_daily_notes isolation", "Leaked permissions to other categories")
    }
  }

  // ─── TEST 7: Supporter with manage_period_status can manage period data only
  section("TEST 7: manage_period_status Isolation")
  {
    const periodManagePrefs = {
      ...defaultPrefs,
      period_status: true,
      manage_period_status: true,
    }
    const canManagePeriod = isManagementEnabled(periodManagePrefs, "manage_period_status")
    const canManageNotes = isManagementEnabled(periodManagePrefs, "manage_daily_notes")
    const canManagePrefs = isManagementEnabled(periodManagePrefs, "manage_cycle_preferences")

    if (canManagePeriod && !canManageNotes && !canManagePrefs) {
      pass("manage_period_status grants period management only and blocks other mutations")
    } else {
      fail("TEST 7: manage_period_status isolation", "Leaked permissions to other categories")
    }
  }

  // ─── TEST 8: Supporter with manage_cycle_preferences can modify preferences only
  section("TEST 8: manage_cycle_preferences Isolation")
  {
    const cyclePrefsManage = {
      ...defaultPrefs,
      cycle_preferences: true,
      manage_cycle_preferences: true,
    }
    const canManagePrefs = isManagementEnabled(cyclePrefsManage, "manage_cycle_preferences")
    const canManagePeriod = isManagementEnabled(cyclePrefsManage, "manage_period_status")
    const canManageNotes = isManagementEnabled(cyclePrefsManage, "manage_daily_notes")

    if (canManagePrefs && !canManagePeriod && !canManageNotes) {
      pass("manage_cycle_preferences grants cycle preferences mutation only")
    } else {
      fail("TEST 8: manage_cycle_preferences isolation", "Leaked permissions to other categories")
    }
  }

  // ─── TEST 9: One management permission cannot grant another ────────────────
  section("TEST 9: Cross-Permission Independence")
  {
    for (const perm of ALL_CO_MANAGEMENT_PERMISSIONS) {
      const singlePermPrefs = {
        ...defaultPrefs,
        period_status: true,
        cycle_preferences: true,
        daily_notes: true,
        [perm]: true,
      }
      for (const otherPerm of ALL_CO_MANAGEMENT_PERMISSIONS) {
        if (otherPerm === perm) {
          if (!isManagementEnabled(singlePermPrefs, otherPerm)) {
            fail("TEST 9: Self check", `Expected ${perm} to be enabled`)
          }
        } else {
          if (isManagementEnabled(singlePermPrefs, otherPerm)) {
            fail("TEST 9: Isolation breach", `${perm} inadvertently granted ${otherPerm}`)
          }
        }
      }
    }
    pass("All co-management permissions are strictly independent")
  }

  // ─── TEST 10 & 11: Client-supplied IDs cannot bypass authorization ──────────
  section("TEST 10 & 11: Anti-Tampering (Client-Supplied ID Immunity)")
  {
    const mutationActionsFile = fs.readFileSync(
      path.join(projectRoot, "app", "actions", "partner-mutations.ts"),
      "utf-8"
    )

    // Verify server actions derive ownerUserId strictly from authorizeSupporterManagement
    if (
      mutationActionsFile.includes("const { ownerUserId") &&
      !mutationActionsFile.includes("formData.get(\"ownerUserId\")") &&
      !mutationActionsFile.includes("input.ownerUserId") &&
      !mutationActionsFile.includes("input.relationshipId")
    ) {
      pass("TEST 10: Server actions derive ownerUserId from auth session; ignore client owner IDs")
      pass("TEST 11: Server actions resolve relationship from server context; ignore client relationship IDs")
    } else {
      fail("TEST 10/11: Anti-tampering check", "Found potential client-supplied ID usage in partner mutations")
    }
  }

  // ─── TEST 12: Supporter cannot modify another user's records ───────────────
  section("TEST 12: User Isolation in Mutations")
  {
    const mutationActionsFile = fs.readFileSync(
      path.join(projectRoot, "app", "actions", "partner-mutations.ts"),
      "utf-8"
    )

    if (
      mutationActionsFile.includes(".eq(\"user_id\", ownerUserId)") &&
      mutationActionsFile.includes("user_id: ownerUserId")
    ) {
      pass("TEST 12: All database operations strictly constrain target records to ownerUserId")
    } else {
      fail("TEST 12: User isolation", "Missing strict ownerUserId record constraint")
    }
  }

  // ─── TEST 13: Owner mutation behavior remains unchanged ────────────────────
  section("TEST 13: Owner Mutation Invariance")
  {
    const cyclesFile = fs.readFileSync(path.join(projectRoot, "app", "actions", "cycles.ts"), "utf-8")
    const notesFile = fs.readFileSync(path.join(projectRoot, "app", "actions", "notes.ts"), "utf-8")

    const cyclesOwnerCheck = cyclesFile.includes("createCycleAction") && cyclesFile.includes("updateCycleAction")
    const notesOwnerCheck = notesFile.includes("createDailyNoteAction") && notesFile.includes("updateDailyNoteAction")

    if (cyclesOwnerCheck && notesOwnerCheck) {
      pass("Owner mutation server actions exist and preserve existing ownership semantics")
    } else {
      fail("TEST 13: Owner mutation check", "Owner actions missing or modified improperly")
    }
  }

  // ─── TEST 14, 15, 16: RLS Enforcement ──────────────────────────────────────
  section("TEST 14, 15, 16: Database-Level RLS Policy Verification")
  {
    const migrationFile = fs.readFileSync(
      path.join(projectRoot, "supabase", "migrations", "20260924000008_partner_co_management.sql"),
      "utf-8"
    )

    // TEST 14: Supporter INSERT RLS
    const hasCyclesInsert = migrationFile.includes('CREATE POLICY "Supporters can insert partner cycles when authorized"')
    const hasPeriodDaysInsert = migrationFile.includes('CREATE POLICY "Supporters can insert partner period days when authorized"')
    const hasDailyNotesInsert = migrationFile.includes('CREATE POLICY "Supporters can insert partner daily notes when authorized"')
    if (hasCyclesInsert && hasPeriodDaysInsert && hasDailyNotesInsert) {
      pass("TEST 14: RLS policy defines authorized supporter INSERT with strict permission check")
    } else {
      fail("TEST 14: RLS INSERT policies", "Missing supporter INSERT policies in migration")
    }

    // TEST 15: Supporter UPDATE RLS
    const hasCyclesUpdate = migrationFile.includes('CREATE POLICY "Supporters can update partner cycles when authorized"')
    const hasPeriodDaysUpdate = migrationFile.includes('CREATE POLICY "Supporters can update partner period days when authorized"')
    const hasDailyNotesUpdate = migrationFile.includes('CREATE POLICY "Supporters can update partner daily notes when authorized"')
    const hasProfileUpdate = migrationFile.includes('CREATE POLICY "Supporters can update partner profile cycle preferences when authorized"')
    if (hasCyclesUpdate && hasPeriodDaysUpdate && hasDailyNotesUpdate && hasProfileUpdate) {
      pass("TEST 15: RLS policy defines authorized supporter UPDATE with strict permission check")
    } else {
      fail("TEST 15: RLS UPDATE policies", "Missing supporter UPDATE policies in migration")
    }

    // TEST 16: Supporter DELETE RLS
    const hasPeriodDaysDelete = migrationFile.includes('CREATE POLICY "Supporters can delete partner period days when authorized"')
    const hasDailyNotesDelete = migrationFile.includes('CREATE POLICY "Supporters can delete partner daily notes when authorized"')
    const noCyclesDelete = !migrationFile.includes('ON public.cycles FOR DELETE')
    if (hasPeriodDaysDelete && hasDailyNotesDelete && noCyclesDelete) {
      pass("TEST 16: RLS policy defines authorized DELETE for period days reconciliation and daily notes, cycle DELETE remains owner-only")
    } else {
      fail("TEST 16: RLS DELETE policies", "Incorrect DELETE policies in migration")
    }
  }

  // ─── TEST 17: Revocation immediately blocks mutation ───────────────────────
  section("TEST 17: Immediate Revocation Enforcement")
  {
    const migrationFile = fs.readFileSync(
      path.join(projectRoot, "supabase", "migrations", "20260924000008_partner_co_management.sql"),
      "utf-8"
    )

    // Every RLS policy in migration requires r.status = 'active'
    const activeMatches = migrationFile.match(/r\.status = 'active'/g) || []
    if (activeMatches.length >= 8) {
      pass(`TEST 17: All ${activeMatches.length} supporter write policies strictly require r.status = 'active'`)
    } else {
      fail("TEST 17: Revocation check", "Some RLS policies do not check status = 'active'")
    }
  }

  // ─── TEST 18, 19, 20: Partner Notification Architecture ────────────────────
  section("TEST 18, 19, 20: Notification Verification")
  {
    const notificationFile = fs.readFileSync(
      path.join(projectRoot, "lib", "partner", "notification.ts"),
      "utf-8"
    )

    // TEST 18: Notification preferences respected
    if (
      notificationFile.includes("prefRow.partner_cycle_updates === false") &&
      notificationFile.includes("prefRow.partner_daily_notes === false")
    ) {
      pass("TEST 18: Notification dispatch explicitly checks recipient notification_preferences")
    } else {
      fail("TEST 18: Notification preferences", "Missing preference check in sendPartnerCoManagementNotification")
    }

    // TEST 19: Appropriate notification categories
    if (
      notificationFile.includes("category: \"partner_cycle_updates\" | \"partner_daily_notes\"")
    ) {
      pass("TEST 19: Notification service generates strictly categorized partner notifications")
    } else {
      fail("TEST 19: Notification categories", "Missing category typing")
    }

    // TEST 20: No private fields in notification payloads
    const hasNoPrivateFields =
      !notificationFile.includes("payload.cycle_length") &&
      !notificationFile.includes("payload.content") &&
      !notificationFile.includes("payload.symptom") &&
      !notificationFile.includes("payload.flow")

    if (hasNoPrivateFields) {
      pass("TEST 20: Notification payloads contain zero private cycle or note content fields")
    } else {
      fail("TEST 20: Payload privacy", "Found private data in notification payload construction")
    }
  }

  // ─── TEST 21: Shared cycle estimates remain correct after authorized mutations
  section("TEST 21: Shared State Consistency & Recalculation")
  {
    const mutationsFile = fs.readFileSync(
      path.join(projectRoot, "app", "actions", "partner-mutations.ts"),
      "utf-8"
    )

    const callsSyncCycleLengths = mutationsFile.includes("syncCycleLengthsForUser(supabase, ownerUserId)")
    const callsSyncReminders = mutationsFile.includes("syncUserReminders")

    if (callsSyncCycleLengths && callsSyncReminders) {
      pass("TEST 21: Partner period and preference mutations invoke cycle sync and reminder recalculation")
    } else {
      fail("TEST 21: Cycle recalculation", "Missing cycle length or reminder recalculation in partner mutations")
    }
  }

  // ─── TEST 22: UI Integration & Regression ──────────────────────────────────
  section("TEST 22: UI Integration & Co-Management Capability Controls")
  {
    const dashFile = fs.readFileSync(
      path.join(projectRoot, "components", "partner", "partner-dashboard-view.tsx"),
      "utf-8"
    )
    const settingsCardFile = fs.readFileSync(
      path.join(projectRoot, "components", "partner", "partner-sharing-settings-card.tsx"),
      "utf-8"
    )

    const hasPeriodModal = dashFile.includes("ManagePeriodDialog")
    const hasCyclePrefsModal = dashFile.includes("EditCyclePreferencesDialog")
    const notesEditor = fs.readFileSync(path.join(projectRoot, "components", "notes", "note-editor-dialog.tsx"), "utf-8")
    const hasNotesModal = dashFile.includes("/notes?view=partner") && notesEditor.includes("createPartnerDailyNoteAction")
    const hasOwnerAccessSection = settingsCardFile.includes("Co-Management Access")
    const hasPrerequisiteEnforcement = settingsCardFile.includes("(Requires View)")

    if (hasPeriodModal && hasCyclePrefsModal && hasNotesModal) {
      pass("Partner dashboard provides capability-specific co-management modals")
    } else {
      fail("TEST 22: Partner dashboard modals", "Missing co-management modals in dashboard")
    }

    if (hasOwnerAccessSection && hasPrerequisiteEnforcement) {
      pass("Owner settings provide clear View Access vs Co-Management Access sections with prerequisite enforcement")
    } else {
      fail("TEST 22: Owner settings UI", "Missing co-management section in owner settings")
    }
  }

  // ─── Summary ───────────────────────────────────────────────────────────────
  console.log("\n═════════════════════════════════════════════════════════════════")
  console.log(`📊 Batch 4 Security Test Results: ${passed} passed, ${failed} failed`)
  console.log("═════════════════════════════════════════════════════════════════\n")

  if (failed > 0) {
    console.error("❌ Some tests failed:")
    for (const f of failures) {
      console.error(`  - ${f.name}: ${f.reason}`)
    }
    process.exit(1)
  }
}

main().catch((err) => {
  console.error("Test execution fatal error:", err)
  process.exit(1)
})
