"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { after } from "next/server"
import type { Database } from "@/lib/supabase/types"
import {
  authorizeSupporterManagement,
  type AuthorizationDenialReason,
} from "@/lib/partner/authorization"
import { syncCycleLengthsForUser } from "@/app/actions/cycles"
import { sendPartnerCoManagementNotification } from "@/lib/partner/notification"
import { deliverNoteNotifications } from "@/lib/server/note-notifications"
import { getTodayDateString } from "@/lib/calculations/cycle-calculations"
import { NOTE_MAX_LENGTH } from "@/lib/notes/types"

/**
 * Seijun Phase 19 Batch 4 — Server Actions for Partner Co-Management Mutations
 *
 * Enforces strict, multi-layer server-side authorization:
 *   1. Authenticated session (never trust client input)
 *   2. Active partner relationship lookup
 *   3. Supporter role verification
 *   4. Base view category enabled verification
 *   5. Specific co-management capability enabled verification
 *   6. Strict ownership constraint on target records (user_id = ownerUserId)
 *   7. Minimal typed mutations
 *   8. Notification dispatch to owner respecting preferences
 */

export interface PartnerMutationResult<T = undefined> {
  ok: boolean
  data?: T
  error?: string
  reason?: AuthorizationDenialReason
}

// ─── Utility Helpers ──────────────────────────────────────────────────────────

function calculateInclusiveDays(startStr: string, endStr: string): number {
  const start = new Date(startStr + "T00:00:00")
  const end = new Date(endStr + "T00:00:00")
  const diffTime = end.getTime() - start.getTime()
  return Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1
}

function generateDateRange(startStr: string, endStr: string): string[] {
  const dates: string[] = []
  const current = new Date(startStr + "T00:00:00")
  const end = new Date(endStr + "T00:00:00")

  while (current <= end) {
    const y = current.getFullYear()
    const m = String(current.getMonth() + 1).padStart(2, "0")
    const d = String(current.getDate()).padStart(2, "0")
    dates.push(`${y}-${m}-${d}`)
    current.setDate(current.getDate() + 1)
  }
  return dates
}

async function getSupporterIdentity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  supporterUserId: string
): Promise<{ username: string; displayName: string }> {
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("username, display_name")
      .eq("user_id", supporterUserId)
      .maybeSingle()

    const username = profile?.username || "partner"
    const displayName = profile?.display_name || username
    return { username, displayName }
  } catch {
    return { username: "partner", displayName: "Partner" }
  }
}

// ─── 1. Period Status Co-Management ──────────────────────────────────────────

export interface RecordPartnerPeriodInput {
  startDate: string
  endDate?: string | null
}

/**
 * Server Action: Supporter records a period entry for the cycle owner.
 * Requires: manage_period_status = true (and period_status = true).
 */
export async function recordPartnerPeriodAction(
  input: RecordPartnerPeriodInput
): Promise<PartnerMutationResult<{ cycleId: string }>> {
  const supabase = await createClient()

  const authResult = await authorizeSupporterManagement(supabase, "manage_period_status")
  if (!authResult.authorized) {
    return {
      ok: false,
      reason: authResult.reason,
      error: authResult.message,
    }
  }

  const { ownerUserId, supporterUserId } = authResult.context
  const todayStr = getTodayDateString()

  const startDate = input.startDate?.trim()
  const endDate = input.endDate?.trim() || null

  // Validate start date
  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return { ok: false, error: "Please provide a valid period start date (YYYY-MM-DD)." }
  }
  if (startDate > todayStr) {
    return { ok: false, error: "Period start date cannot be in the future." }
  }

  // Validate end date if provided
  let periodDuration: number | null = null
  if (endDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return { ok: false, error: "Please provide a valid period end date (YYYY-MM-DD)." }
    }
    if (endDate > todayStr) {
      return { ok: false, error: "Period end date cannot be in the future." }
    }
    if (endDate < startDate) {
      return { ok: false, error: "Period end date cannot be before the start date." }
    }
    periodDuration = calculateInclusiveDays(startDate, endDate)
  }

  try {
    // Check for exact duplicate start date on owner's cycles
    const { data: existingCycle } = await supabase
      .from("cycles")
      .select("id")
      .eq("user_id", ownerUserId)
      .eq("start_date", startDate)
      .maybeSingle()

    if (existingCycle) {
      return {
        ok: false,
        error: "A cycle starting on this date already exists for your partner.",
      }
    }

    // Insert cycle record for owner
    const { data: newCycle, error: insertError } = await supabase
      .from("cycles")
      .insert({
        user_id: ownerUserId,
        start_date: startDate,
        end_date: endDate,
        period_duration: periodDuration,
        notes: null, // Supporters do not set internal notes
      })
      .select("id")
      .single()

    if (insertError || !newCycle) {
      return { ok: false, error: insertError?.message || "Failed to save period entry." }
    }

    // Generate period days records for owner
    const datesToGenerate = endDate ? generateDateRange(startDate, endDate) : [startDate]
    const periodDaysRows = datesToGenerate.map((date) => ({
      cycle_id: newCycle.id,
      user_id: ownerUserId,
      date,
      flow: "medium" as const,
    }))

    const { error: daysError } = await supabase
      .from("period_days")
      .upsert(periodDaysRows, { onConflict: "user_id,date" })

    if (daysError) {
      console.error("[recordPartnerPeriodAction] period_days error:", daysError.message)
    }

    // Sync consecutive cycle lengths and smart reminders for owner
    await syncCycleLengthsForUser(supabase, ownerUserId)

    // Notify cycle owner respecting notification preferences
    const supporter = await getSupporterIdentity(supabase, supporterUserId)
    await sendPartnerCoManagementNotification({
      supabase,
      recipientUserId: ownerUserId,
      actorUsername: supporter.username,
      category: "partner_cycle_updates",
      title: "Partner Cycle Update",
      body: `@${supporter.username} recorded a period entry.`,
      url: "/dashboard",
    })

    revalidatePath("/partner")
    revalidatePath("/dashboard")
    revalidatePath("/cycles")

    return { ok: true, data: { cycleId: newCycle.id } }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to record period entry."
    return { ok: false, error: message }
  }
}

export interface UpdatePartnerPeriodInput {
  cycleId: string
  startDate: string
  endDate?: string | null
}

/**
 * Server Action: Supporter updates an existing period entry for the cycle owner.
 * Requires: manage_period_status = true (and period_status = true).
 */
export async function updatePartnerPeriodAction(
  input: UpdatePartnerPeriodInput
): Promise<PartnerMutationResult<{ cycleId: string }>> {
  const supabase = await createClient()

  const authResult = await authorizeSupporterManagement(supabase, "manage_period_status")
  if (!authResult.authorized) {
    return {
      ok: false,
      reason: authResult.reason,
      error: authResult.message,
    }
  }

  const { ownerUserId, supporterUserId } = authResult.context
  const todayStr = getTodayDateString()

  const cycleId = input.cycleId?.trim()
  const startDate = input.startDate?.trim()
  const endDate = input.endDate?.trim() || null

  if (!cycleId) {
    return { ok: false, error: "Cycle ID is required." }
  }

  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return { ok: false, error: "Please provide a valid period start date (YYYY-MM-DD)." }
  }
  if (startDate > todayStr) {
    return { ok: false, error: "Period start date cannot be in the future." }
  }

  let periodDuration: number | null = null
  if (endDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return { ok: false, error: "Please provide a valid period end date (YYYY-MM-DD)." }
    }
    if (endDate > todayStr) {
      return { ok: false, error: "Period end date cannot be in the future." }
    }
    if (endDate < startDate) {
      return { ok: false, error: "Period end date cannot be before the start date." }
    }
    periodDuration = calculateInclusiveDays(startDate, endDate)
  }

  try {
    // Verify target cycle belongs strictly to ownerUserId
    const { data: existingCycle, error: findError } = await supabase
      .from("cycles")
      .select("id, start_date")
      .eq("id", cycleId)
      .eq("user_id", ownerUserId)
      .maybeSingle()

    if (findError || !existingCycle) {
      return { ok: false, error: "Cycle record not found or access denied." }
    }

    // If start_date changed, ensure no date collision with another cycle
    if (startDate !== existingCycle.start_date) {
      const { data: conflict } = await supabase
        .from("cycles")
        .select("id")
        .eq("user_id", ownerUserId)
        .eq("start_date", startDate)
        .neq("id", cycleId)
        .maybeSingle()

      if (conflict) {
        return { ok: false, error: "Another cycle already exists starting on this date." }
      }
    }

    // Update cycle record for owner
    const { error: updateErr } = await supabase
      .from("cycles")
      .update({
        start_date: startDate,
        end_date: endDate,
        period_duration: periodDuration,
      })
      .eq("id", cycleId)
      .eq("user_id", ownerUserId)

    if (updateErr) {
      return { ok: false, error: updateErr.message }
    }

    // Reconcile period days for owner
    const { data: existingDays } = await supabase
      .from("period_days")
      .select("id, date, flow")
      .eq("cycle_id", cycleId)
      .eq("user_id", ownerUserId)

    const existingDaysMap = new Map<string, string>()
    if (existingDays) {
      for (const d of existingDays) {
        existingDaysMap.set(d.date, d.flow)
      }
    }

    const targetDates = new Set<string>(
      endDate ? generateDateRange(startDate, endDate) : [startDate]
    )

    // Remove obsolete days
    const idsToDelete: string[] = []
    if (existingDays) {
      for (const d of existingDays) {
        if (!targetDates.has(d.date)) {
          idsToDelete.push(d.id)
        }
      }
    }
    if (idsToDelete.length > 0) {
      await supabase.from("period_days").delete().in("id", idsToDelete).eq("user_id", ownerUserId)
    }

    // Upsert target dates
    const rowsToUpsert = Array.from(targetDates).map((date) => ({
      cycle_id: cycleId,
      user_id: ownerUserId,
      date,
      flow: (existingDaysMap.get(date) || "medium") as Database["public"]["Tables"]["period_days"]["Row"]["flow"],
    }))

    await supabase.from("period_days").upsert(rowsToUpsert, { onConflict: "user_id,date" })

    // Sync cycle lengths and reminders
    await syncCycleLengthsForUser(supabase, ownerUserId)

    // Notify owner
    const supporter = await getSupporterIdentity(supabase, supporterUserId)
    await sendPartnerCoManagementNotification({
      supabase,
      recipientUserId: ownerUserId,
      actorUsername: supporter.username,
      category: "partner_cycle_updates",
      title: "Partner Cycle Update",
      body: `@${supporter.username} updated a period entry.`,
      url: "/dashboard",
    })

    revalidatePath("/partner")
    revalidatePath("/dashboard")
    revalidatePath("/cycles")

    return { ok: true, data: { cycleId } }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update period entry."
    return { ok: false, error: message }
  }
}

// ─── 2. Cycle Preferences Co-Management ──────────────────────────────────────

export interface UpdatePartnerCyclePreferencesInput {
  typicalCycleLength?: number | null
  lastPeriodStart?: string | null
}

/**
 * Server Action: Supporter updates cycle configuration for the cycle owner.
 * Requires: manage_cycle_preferences = true (and cycle_preferences = true).
 */
export async function updatePartnerCyclePreferencesAction(
  input: UpdatePartnerCyclePreferencesInput
): Promise<PartnerMutationResult> {
  const supabase = await createClient()

  const authResult = await authorizeSupporterManagement(supabase, "manage_cycle_preferences")
  if (!authResult.authorized) {
    return {
      ok: false,
      reason: authResult.reason,
      error: authResult.message,
    }
  }

  const { ownerUserId, supporterUserId } = authResult.context
  const todayStr = getTodayDateString()

  const updatePayload: {
    typical_cycle_length?: number | null
    last_period_start?: string | null
    updated_at: string
  } = {
    updated_at: new Date().toISOString(),
  }

  // Validate typical cycle length (21-45 days if provided)
  if (input.typicalCycleLength !== undefined && input.typicalCycleLength !== null) {
    const parsed = Math.round(Number(input.typicalCycleLength))
    if (isNaN(parsed) || parsed < 21 || parsed > 45) {
      return { ok: false, error: "Typical cycle length must be between 21 and 45 days." }
    }
    updatePayload.typical_cycle_length = parsed
  }

  // Validate last period start date if provided
  if (input.lastPeriodStart !== undefined && input.lastPeriodStart !== null) {
    const dateStr = input.lastPeriodStart.trim()
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return { ok: false, error: "Please provide a valid date format (YYYY-MM-DD)." }
    }
    if (dateStr > todayStr) {
      return { ok: false, error: "Last period start date cannot be in the future." }
    }
    updatePayload.last_period_start = dateStr
  }

  try {
    const { error: updateErr } = await supabase
      .from("profiles")
      .update(updatePayload)
      .eq("user_id", ownerUserId)

    if (updateErr) {
      return { ok: false, error: updateErr.message }
    }

    // Recalculate smart reminders for the owner
    try {
      const { syncUserReminders } = await import("@/lib/reminders/sync")
      await syncUserReminders(ownerUserId, supabase)
    } catch (syncErr) {
      console.error("[updatePartnerCyclePreferencesAction] Reminder sync error:", syncErr)
    }

    // Notify owner
    const supporter = await getSupporterIdentity(supabase, supporterUserId)
    await sendPartnerCoManagementNotification({
      supabase,
      recipientUserId: ownerUserId,
      actorUsername: supporter.username,
      category: "partner_cycle_updates",
      title: "Cycle Preferences Updated",
      body: `@${supporter.username} updated your cycle preferences.`,
      url: "/settings/cycle",
    })

    revalidatePath("/partner")
    revalidatePath("/dashboard")
    revalidatePath("/settings/cycle")

    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update cycle preferences."
    return { ok: false, error: message }
  }
}

// ─── 3. Daily Notes Co-Management ────────────────────────────────────────────

export interface CreatePartnerDailyNoteInput {
  requestId: string
  date: string
  content: string
}

/**
 * Server Action: Supporter creates a daily note for the cycle owner.
 * Requires: manage_daily_notes = true (and daily_notes = true).
 */
export async function createPartnerDailyNoteAction(
  input: CreatePartnerDailyNoteInput
): Promise<PartnerMutationResult<{ noteId: string }>> {
  const supabase = await createClient()

  const authResult = await authorizeSupporterManagement(supabase, "manage_daily_notes")
  if (!authResult.authorized) {
    return {
      ok: false,
      reason: authResult.reason,
      error: authResult.message,
    }
  }

  const { ownerUserId, supporterUserId } = authResult.context
  const todayStr = getTodayDateString()

  const date = input.date?.trim()
  const content = input.content?.trim()

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, error: "A valid date (YYYY-MM-DD) is required." }
  }
  if (date > todayStr) {
    return { ok: false, error: "Cannot create a daily note for a future date." }
  }
  if (!content) {
    return { ok: false, error: "Note content cannot be empty." }
  }
  if (content.length > NOTE_MAX_LENGTH) {
    return {
      ok: false,
      error: `Note content cannot exceed ${NOTE_MAX_LENGTH.toLocaleString()} characters.`,
    }
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId ?? "")) return { ok: false, error: "Invalid note request." }
  try {
    const { data: newNote, error: insertError } = await supabase
      .from("daily_notes")
      .insert({
        user_id: ownerUserId,
        author_id: supporterUserId,
        request_id: input.requestId,
        date,
        content,
      })
      .select("id")
      .single()

    if (insertError?.code === "23505") {
      const { data: existing } = await supabase.from("daily_notes").select("id").eq("author_id", supporterUserId).eq("request_id", input.requestId).eq("user_id", ownerUserId).maybeSingle()
      if (existing) return { ok: true, data: { noteId: existing.id } }
    }
    if (insertError || !newNote) {
      return { ok: false, error: insertError?.message || "Failed to save daily note." }
    }

    after(async () => {
      try { await deliverNoteNotifications(newNote.id) } catch { console.error("[partner-notes] Delivery failed; note remains saved.") }
    })

    revalidatePath("/partner")
    revalidatePath("/notes")
    revalidatePath("/dashboard")

    return { ok: true, data: { noteId: newNote.id } }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create daily note."
    return { ok: false, error: message }
  }
}

export interface UpdatePartnerDailyNoteInput {
  noteId?: string
  date?: string
  content: string
}

/**
 * Server Action: Supporter updates an existing daily note for the cycle owner.
 * Requires: manage_daily_notes = true (and daily_notes = true).
 */
export async function updatePartnerDailyNoteAction(
  input: UpdatePartnerDailyNoteInput
): Promise<PartnerMutationResult> {
  void input
  return { ok: false, error: "Sent partner notes are immutable. Add a new note." }
}

export interface DeletePartnerDailyNoteInput {
  noteId?: string
  date?: string
}

/**
 * Server Action: Supporter deletes a daily note for the cycle owner.
 * Requires: manage_daily_notes = true (and daily_notes = true).
 */
export async function deletePartnerDailyNoteAction(
  input: DeletePartnerDailyNoteInput
): Promise<PartnerMutationResult> {
  void input
  return { ok: false, error: "Sent partner notes are immutable. Add a new note." }
}
