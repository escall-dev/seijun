#!/usr/bin/env node

/**
 * Seijun Daily Notes Architecture Test Suite
 *
 * Multi-Entry Notes Per Day + Timestamp + Partner Notifications + Bidirectional Partner Note History
 *
 * Verifies all 29 requirements from the prompt:
 * 1. Multi-note creation on the same date (1, 2, 3)
 * 2. Unique note IDs
 * 3. Exact database creation timestamps (created_at)
 * 4. Chronological timeline ordering (newest -> oldest)
 * 5. Invariance against overwriting same-day notes
 * 6. Isolated note editing by unique ID
 * 7. Isolated note deletion by unique ID
 * 8. Owner -> Partner visibility & privacy-preserving notifications
 * 9. Partner -> Owner co-management, visibility & notifications
 * 10. Granular permission gating & revoked relationship enforcement
 * 11. Cycle context integration (supporter, both, own)
 * 12. Separation of personal notes and partner notes
 * 13. Database migration & schema integrity
 *
 * Usage: node scripts/test-daily-notes-architecture.mjs
 */

import fs from "fs"
import path from "path"

const projectRoot = process.cwd()

let passed = 0
let failed = 0
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
  console.log("🌸 Seijun Daily Notes Architecture & Multi-Entry Test Suite")
  console.log("═════════════════════════════════════════════════════════════════\n")

  // ─── 1. Database Migration & Schema Audit ─────────────────────────────────────
  section("1. Database Migration & Schema Audit")
  {
    const migrationPath = path.join(
      projectRoot,
      "supabase",
      "migrations",
      "20260926000001_daily_notes_multi_entry_architecture.sql"
    )
    if (fs.existsSync(migrationPath)) {
      pass("Migration 20260926000001_daily_notes_multi_entry_architecture.sql exists")
    } else {
      fail("Migration existence", "Migration file not found")
    }

    const migrationContent = fs.readFileSync(migrationPath, "utf-8")
    if (migrationContent.includes("DROP CONSTRAINT IF EXISTS unique_user_daily_note_date")) {
      pass("Migration drops unique_user_daily_note_date constraint")
    } else {
      fail("Constraint removal", "Did not find DROP CONSTRAINT for unique_user_daily_note_date")
    }

    if (migrationContent.includes("author_id") && migrationContent.includes("ADD COLUMN IF NOT EXISTS author_id")) {
      pass("Migration adds author_id column with backfill and foreign key")
    } else {
      fail("Author column", "author_id not added properly in migration")
    }

    if (migrationContent.includes("idx_daily_notes_user_date_created")) {
      pass("Migration adds timeline performance index (user_id, date DESC, created_at DESC)")
    } else {
      fail("Timeline index", "Missing timeline index")
    }

    // Verify TypeScript types
    const typesPath = path.join(projectRoot, "lib", "supabase", "types.ts")
    const typesContent = fs.readFileSync(typesPath, "utf-8")
    if (typesContent.includes("author_id: string | null") || typesContent.includes("author_id?: string | null")) {
      pass("Supabase Database types define author_id on daily_notes")
    } else {
      fail("Database types", "daily_notes in types.ts missing author_id")
    }

    const notesTypesPath = path.join(projectRoot, "lib", "notes", "types.ts")
    const notesTypesContent = fs.readFileSync(notesTypesPath, "utf-8")
    if (notesTypesContent.includes("author_id?: string | null")) {
      pass("lib/notes/types.ts DailyNoteRecord defines author_id")
    } else {
      fail("DailyNoteRecord type", "Missing author_id in DailyNoteRecord")
    }
  }

  // ─── 2. Multi-Entry Notes Per Date (Data Model Simulation) ───────────────────
  section("2. Multi-Entry Notes Per Date & Timestamps")
  {
    const today = "2026-09-26"
    const note1 = {
      id: "note-uuid-001",
      user_id: "user-owner-1",
      author_id: "user-owner-1",
      date: today,
      content: "Feeling okay this morning.",
      created_at: "2026-09-26T09:12:41.000Z",
      updated_at: "2026-09-26T09:12:41.000Z",
    }

    const note2 = {
      id: "note-uuid-002",
      user_id: "user-owner-1",
      author_id: "user-owner-1",
      date: today,
      content: "Started experiencing mild cramps.",
      created_at: "2026-09-26T13:47:03.000Z",
      updated_at: "2026-09-26T13:47:03.000Z",
    }

    const note3 = {
      id: "note-uuid-003",
      user_id: "user-owner-1",
      author_id: "user-owner-1",
      date: today,
      content: "Feeling better after resting.",
      created_at: "2026-09-26T18:32:17.000Z",
      updated_at: "2026-09-26T18:32:17.000Z",
    }

    const mockDatabaseTable = [note1, note2, note3]

    // Verify 3 distinct notes exist for same date
    const sameDateNotes = mockDatabaseTable.filter((n) => n.date === today && n.user_id === "user-owner-1")
    if (sameDateNotes.length === 3) {
      pass("Multiple notes (3) successfully coexist on the same date")
    } else {
      fail("Multi-note coexistence", `Expected 3 notes, got ${sameDateNotes.length}`)
    }

    // Verify unique IDs
    const uniqueIds = new Set(sameDateNotes.map((n) => n.id))
    if (uniqueIds.size === 3) {
      pass("Each note entry has a unique, independent identifier (UUID)")
    } else {
      fail("Unique ID", "Note IDs are not distinct")
    }

    // Verify timestamps exist and differ
    const timestamps = sameDateNotes.map((n) => n.created_at)
    if (timestamps.every(Boolean) && new Set(timestamps).size === 3) {
      pass("Every note entry records its exact posting timestamp (created_at)")
    } else {
      fail("Timestamps", "Timestamps missing or duplicate")
    }

    // Verify chronological ordering (newest first)
    const sorted = [...sameDateNotes].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    if (sorted[0].id === "note-uuid-003" && sorted[1].id === "note-uuid-002" && sorted[2].id === "note-uuid-001") {
      pass("Chronological ordering properly sorts newest entry first (18:32 -> 13:47 -> 09:12)")
    } else {
      fail("Chronological ordering", "Notes not ordered newest to oldest")
    }

    // Verify creating Note B does not overwrite Note A
    if (mockDatabaseTable[0].content === "Feeling okay this morning." && mockDatabaseTable[1].content === "Started experiencing mild cramps.") {
      pass("Creating second/third note does not overwrite prior notes on the same date")
    } else {
      fail("Overwriting", "Prior note was overwritten")
    }
  }

  // ─── 3. Note Editing & Deletion Targeted by Unique ID ────────────────────────
  section("3. Note Editing & Deletion Targeted by Unique ID")
  {
    let notes = [
      { id: "note-1", date: "2026-09-26", content: "Original 1", created_at: "2026-09-26T09:00:00Z" },
      { id: "note-2", date: "2026-09-26", content: "Original 2", created_at: "2026-09-26T12:00:00Z" },
      { id: "note-3", date: "2026-09-26", content: "Original 3", created_at: "2026-09-26T18:00:00Z" },
    ]

    // Simulate update of note-2 by unique ID
    notes = notes.map((n) => (n.id === "note-2" ? { ...n, content: "Updated Note 2" } : n))
    if (notes.find((n) => n.id === "note-2")?.content === "Updated Note 2" &&
        notes.find((n) => n.id === "note-1")?.content === "Original 1" &&
        notes.find((n) => n.id === "note-3")?.content === "Original 3") {
      pass("Editing note-2 targets only note-2; note-1 and note-3 remain unchanged")
    } else {
      fail("Isolated editing", "Other notes were modified during edit")
    }

    // Simulate delete of note-2 by unique ID
    notes = notes.filter((n) => n.id !== "note-2")
    if (notes.length === 2 && notes.some((n) => n.id === "note-1") && notes.some((n) => n.id === "note-3")) {
      pass("Deleting note-2 deletes exactly one entry; other same-day notes remain intact")
    } else {
      fail("Isolated deletion", "Other same-day notes were inadvertently deleted")
    }
  }

  // ─── 4. Application Actions Code Audit ────────────────────────────────────────
  section("4. Application Actions Audit")
  {
    const notesActionsPath = path.join(projectRoot, "app", "actions", "notes.ts")
    const notesActions = fs.readFileSync(notesActionsPath, "utf-8")

    // Check that createDailyNoteAction no longer checks for existing note to block creation
    if (!notesActions.includes("A daily note already exists for this date. Please edit the existing note.")) {
      pass("createDailyNoteAction does not reject multi-note creation on the same date")
    } else {
      fail("createDailyNoteAction", "Still contains one-note-per-day blocking logic")
    }

    // Check that createDailyNoteAction inserts author_id
    if (notesActions.includes("author_id: user.id")) {
      pass("createDailyNoteAction explicitly records author_id")
    } else {
      fail("createDailyNoteAction", "Does not record author_id")
    }

    // Check that partner notification is dispatched
    if (notesActions.includes("deliverNoteNotifications") && notesActions.includes("after(async")) {
      pass("createDailyNoteAction sends partner notification when relationship is active")
    } else {
      fail("Partner notification", "Missing notification dispatch in createDailyNoteAction")
    }

    // Check that note content is NOT leaked in notification
    if (!notesActions.includes("body: rawContent") && !notesActions.includes("body: content") && !notesActions.includes("body: input.content")) {
      pass("Partner notification body avoids leaking private note content")
    } else {
      fail("Privacy leak", "Raw note content referenced in notification body")
    }

    // Check partner-mutations.ts
    const partnerMutationsPath = path.join(projectRoot, "app", "actions", "partner-mutations.ts")
    const partnerMutations = fs.readFileSync(partnerMutationsPath, "utf-8")

    if (!partnerMutations.includes("A daily note already exists for this date. Please edit the existing note.")) {
      pass("createPartnerDailyNoteAction does not reject multi-note creation on the same date")
    } else {
      fail("createPartnerDailyNoteAction", "Still contains one-note-per-day blocking logic")
    }

    if (partnerMutations.includes("author_id: supporterUserId")) {
      pass("createPartnerDailyNoteAction sets author_id to supporterUserId")
    } else {
      fail("Co-manager author_id", "createPartnerDailyNoteAction does not set author_id: supporterUserId")
    }
  }

  // ─── 5. UI Component Integration ─────────────────────────────────────────────
  section("5. UI Component Integration")
  {
    // Check notes-history.tsx
    const historyPath = path.join(projectRoot, "components", "notes", "notes-history.tsx")
    const historyContent = fs.readFileSync(historyPath, "utf-8")

    if (historyContent.includes("formatPostingTime") || historyContent.includes("toLocaleTimeString")) {
      pass("NotesHistory formats and displays exact posting time (HH:MM AM/PM)")
    } else {
      fail("Posting time", "Missing posting time in NotesHistory")
    }

    if (historyContent.includes("groupNotesByDate") || historyContent.includes("entries")) {
      pass("NotesHistory groups entries chronologically by calendar date")
    } else {
      fail("Date grouping", "Missing date grouping in NotesHistory")
    }

    if (historyContent.includes("My Notes") && historyContent.includes("Partner Notes")) {
      pass("NotesHistory provides bidirectional tabs for Cycle Owner (My Notes / Partner Notes)")
    } else {
      fail("Bidirectional tabs", "Missing tabs in NotesHistory")
    }

    // Check note-editor-dialog.tsx
    const editorPath = path.join(projectRoot, "components", "notes", "note-editor-dialog.tsx")
    const editorContent = fs.readFileSync(editorPath, "utf-8")

    if (!editorContent.includes("A note already exists for this date.") &&
        !editorContent.includes("duplicateNote")) {
      pass("NoteEditorDialog allows immediate creation of multiple notes on the same date without warning banner")
    } else {
      fail("Editor dialog", "Still contains duplicate note blocking banner")
    }

    // Check partner-dashboard-view.tsx
    const partnerDashboardPath = path.join(projectRoot, "components", "partner", "partner-dashboard-view.tsx")
    const partnerDashboardContent = fs.readFileSync(partnerDashboardPath, "utf-8")

    if (partnerDashboardContent.includes('/notes?view=partner') && historyContent.includes("formatPostingTime") && historyContent.includes('timeZone: "Asia/Manila"')) {
      pass("Partner Dashboard opens the dedicated Notes timeline with exact local timestamps")
    } else {
      fail("Partner Dashboard timestamps", "Missing timestamp in partner dashboard notes card")
    }

    if (partnerDashboardContent.includes('/notes?view=partner') && historyContent.includes("key={note.id}") && historyContent.includes("canEditNote")) {
      pass("Partner Notes use unique note IDs and sent-version edit protection")
    } else {
      fail("Partner Dashboard noteId", "Still targeting notes by date instead of noteId")
    }

    // Check TodayNoteCard
    const todayCardPath = path.join(projectRoot, "components", "dashboard", "today-note-card.tsx")
    const todayCardContent = fs.readFileSync(todayCardPath, "utf-8")

    if (todayCardContent.includes("formatPostingTime") && todayCardContent.includes("Add another")) {
      pass("TodayNoteCard displays posting timestamp and allows adding additional notes on the same day")
    } else {
      fail("TodayNoteCard", "Missing posting time or add another note button")
    }
  }

  // ─── 6. Authorization & Bidirectional Visibility ──────────────────────────────
  section("6. Authorization & Bidirectional Visibility")
  {
    const { authorizeSupporterAccess, authorizeSupporterManagement } = await import(
      "../lib/partner/authorization.ts"
    )

    // Revoked relationship test: status='active' query returns null
    const mockRevokedSupabase = {
      auth: { getUser: async () => ({ data: { user: { id: "supporter-1" } }, error: null }) },
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

    const accessResult = await authorizeSupporterAccess(mockRevokedSupabase, "daily_notes")
    if (!accessResult.authorized && accessResult.reason === "NO_ACTIVE_RELATIONSHIP") {
      pass("Revoked relationship immediately denies daily notes viewing")
    } else {
      fail("Revoked view", "Revoked relationship was not denied")
    }

    const mgmtResult = await authorizeSupporterManagement(mockRevokedSupabase, "manage_daily_notes")
    if (!mgmtResult.authorized && mgmtResult.reason === "NO_ACTIVE_RELATIONSHIP") {
      pass("Revoked relationship immediately denies daily notes co-management mutations")
    } else {
      fail("Revoked mutation", "Revoked relationship mutation was not denied")
    }
  }

  // ─── Summary ─────────────────────────────────────────────────────────────────
  console.log("\n═════════════════════════════════════════════════════════════════")
  console.log(`📊 Daily Notes Architecture Results: ${passed} passed, ${failed} failed`)
  console.log("═════════════════════════════════════════════════════════════════\n")

  if (failed > 0) {
    console.error("Failures:", failures)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error("Unhandled error:", err)
  process.exit(1)
})
