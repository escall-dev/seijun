"use server"

import { createClient, getAuthenticatedUser } from "@/lib/supabase/server"
import { getServerUserProfile } from "@/lib/server/profile"
import { calculateDaysBetween, calculateInclusiveDays, getRecordedCycleEnd, getTodayDateString } from "@/lib/calculations/cycle-calculations"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

export type FlowLevel = "light" | "medium" | "heavy"

export interface PeriodDayRecord {
  id: string
  cycle_id: string
  user_id: string
  date: string // YYYY-MM-DD
  flow: FlowLevel
  created_at: string
}

export interface CycleRecord {
  id: string
  user_id: string
  start_date: string // YYYY-MM-DD
  cycle_end_date?: string | null
  end_date: string | null
  cycle_length: number | null
  period_duration: number | null
  notes: string | null
  created_at: string
  updated_at: string
  period_days?: PeriodDayRecord[]
  period_days_count?: number
}

export interface CycleActionResult {
  success?: boolean
  error?: string
  cycleId?: string
}

/**
 * Helper: Generate array of YYYY-MM-DD strings in inclusive date range
 */
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

/**
 * Helper: Synchronize and persist cycle_length for all cycles of a user
 * based strictly on consecutive cycle start_date values.
 */
export async function syncCycleLengthsForUser(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<void> {
  try {
    const { data: cycles } = await supabase
      .from("cycles")
      .select("id, start_date, cycle_length")
      .eq("user_id", userId)
      .order("start_date", { ascending: true })

    if (!cycles || cycles.length === 0) return

    for (let i = 0; i < cycles.length; i++) {
      let expectedLength: number | null = null
      if (i < cycles.length - 1) {
        const days = calculateDaysBetween(cycles[i].start_date, cycles[i + 1].start_date)
        if (days > 0) {
          expectedLength = days
        }
      }

      if (cycles[i].cycle_length !== expectedLength) {
        await supabase
          .from("cycles")
          .update({ cycle_length: expectedLength })
          .eq("id", cycles[i].id)
          .eq("user_id", userId)
      }
    }
  } catch (err) {
    console.error("Error syncing cycle lengths:", err)
  }

  // Recalculate smart cycle reminders (Phase 18)
  try {
    const { syncUserReminders } = await import("@/lib/reminders/sync")
    await syncUserReminders(userId, supabase)
  } catch (remErr) {
    console.error("Error syncing cycle reminders:", remErr)
  }
}

/**
 * 1. Ensure initial cycle from onboarding information if not already present.
 * Uses fast-path count check so existing users bypass profile queries.
 */
export async function ensureInitialCycleAction(): Promise<void> {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return
    const supabase = await createClient()

    // Fast-path guard: check if any cycle already exists for this user
    const { count } = await supabase
      .from("cycles")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)

    // Existing users with cycles return immediately
    if (count !== null && count > 0) return

    // Check profile for onboarding initial start date
    const { data: profile } = await supabase
      .from("profiles")
      .select("last_period_start, onboarding_completed")
      .eq("user_id", user.id)
      .single()

    if (!profile?.last_period_start) return

    await supabase.from("cycles").insert({
      user_id: user.id,
      start_date: profile.last_period_start,
      end_date: null,
      period_duration: null,
      cycle_length: null,
      notes: "Initial cycle from Seijun onboarding.",
    })
  } catch {
    // Ignore error in initial sync
  }
}

/**
 * Internal: Fetch all cycles for a specific authenticated user.
 * Bypasses initialization queries if cycles exist.
 * If user has 0 cycles, checks and initializes from onboarding data on demand.
 */
export async function getCyclesForUser(
  userId: string,
  customClient?: Awaited<ReturnType<typeof createClient>>
): Promise<CycleRecord[]> {
  const supabase = customClient || (await createClient())

  // Fetch cycles and period days concurrently
  const [initialCyclesRes, periodDaysRes] = await Promise.all([
    supabase
      .from("cycles")
      .select(`
        id,
        user_id,
        start_date,
        end_date,
        cycle_length,
        period_duration,
        notes,
        created_at,
        updated_at
      `)
      .eq("user_id", userId)
      .order("start_date", { ascending: true }),
    supabase
      .from("period_days")
      .select("id, cycle_id, user_id, date, flow, created_at")
      .eq("user_id", userId)
      .order("date", { ascending: true }),
  ])

  if (initialCyclesRes.error) return []

  let cycles = initialCyclesRes.data || []

  // If user has zero cycles, run initial onboarding check
  if (!cycles || cycles.length === 0) {
    try {
      const profile = await getServerUserProfile(userId)

      if (profile?.last_period_start) {
        await supabase.from("cycles").insert({
          user_id: userId,
          start_date: profile.last_period_start,
          end_date: null,
          period_duration: null,
          cycle_length: null,
          notes: "Initial cycle from Seijun onboarding.",
        })

        const refreshed = await supabase
          .from("cycles")
          .select(`
            id,
            user_id,
            start_date,
            end_date,
            cycle_length,
            period_duration,
            notes,
            created_at,
            updated_at
          `)
          .eq("user_id", userId)
          .order("start_date", { ascending: true })

        cycles = refreshed.data || []
      }
    } catch {
      // Invariant: allow empty list on profile check error
    }
  }

  if (!cycles || cycles.length === 0) return []

  const periodDays = periodDaysRes.data || []
  const daysByCycle = new Map<string, PeriodDayRecord[]>()
  for (const day of periodDays) {
    const list = daysByCycle.get(day.cycle_id) || []
    list.push(day as PeriodDayRecord)
    daysByCycle.set(day.cycle_id, list)
  }

  // Compute cycle lengths between consecutive cycle start dates
  const computedCycles: CycleRecord[] = cycles.map((cycle, index) => {
    const nextCycle = cycles[index + 1]
    const calculatedLength = nextCycle ? calculateDaysBetween(cycle.start_date, nextCycle.start_date) : null

    const daysList = daysByCycle.get(cycle.id) || []

    return {
      ...cycle,
      cycle_length: calculatedLength,
      cycle_end_date: getRecordedCycleEnd(cycle, cycles),
      period_days: daysList,
      period_days_count: daysList.length,
    }
  })

  // Return sorted DESC (most recent cycle first)
  return computedCycles.reverse()
}

/**
 * 2. Public Server Action: Get all cycles for authenticated user with computed cycle lengths.
 */
export async function getCyclesAction(): Promise<CycleRecord[]> {
  const user = await getAuthenticatedUser()
  if (!user) return []
  const supabase = await createClient()
  return getCyclesForUser(user.id, supabase)
}

/**
 * Internal: Fetch single cycle detail by ID with associated period days and computed cycle length.
 */
export async function getCycleByIdForUser(
  cycleId: string,
  userId: string,
  customClient?: Awaited<ReturnType<typeof createClient>>
): Promise<CycleRecord | null> {
  const supabase = customClient || (await createClient())

  // Fetch target cycle verifying user ownership
  const { data: cycle, error } = await supabase
    .from("cycles")
    .select("*")
    .eq("id", cycleId)
    .eq("user_id", userId)
    .single()

  if (error || !cycle) return null

  // Fetch period days and next recorded cycle in parallel
  const [periodDaysRes, nextCycleRes] = await Promise.all([
    supabase
      .from("period_days")
      .select("*")
      .eq("cycle_id", cycleId)
      .eq("user_id", userId)
      .order("date", { ascending: true }),
    supabase
      .from("cycles")
      .select("start_date")
      .eq("user_id", userId)
      .gt("start_date", cycle.start_date)
      .order("start_date", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])

  let computedCycleLength: number | null = null
  if (nextCycleRes.data?.start_date) {
    const days = calculateDaysBetween(cycle.start_date, nextCycleRes.data.start_date)
    if (days > 0) {
      computedCycleLength = days
    }
  }

  return {
    ...cycle,
    cycle_length: computedCycleLength,
    cycle_end_date: nextCycleRes.data ? getRecordedCycleEnd(cycle, [cycle, { ...cycle, start_date: nextCycleRes.data.start_date }]) : null,
    period_days: (periodDaysRes.data as PeriodDayRecord[]) || [],
    period_days_count: periodDaysRes.data?.length || 0,
  }
}

/**
 * 3. Public Server Action: Get single cycle detail by ID with associated period days.
 */
export async function getCycleByIdAction(
  cycleId: string
): Promise<CycleRecord | null> {
  const user = await getAuthenticatedUser()
  if (!user) return null
  const supabase = await createClient()
  return getCycleByIdForUser(cycleId, user.id, supabase)
}

/**
 * 4. Create new cycle and generate period days.
 */
export async function createCycleAction(
  _prevState: CycleActionResult | null,
  formData: FormData
): Promise<CycleActionResult> {
  const startDate = (formData.get("startDate") as string)?.trim()
  const endDate = (formData.get("endDate") as string)?.trim() || null
  const notes = (formData.get("notes") as string)?.trim() || null

  const todayStr = getTodayDateString()

  // Validate start date
  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return { success: false, error: "Please select a valid start date." }
  }
  if (startDate > todayStr) {
    return { success: false, error: "Period start date cannot be in the future." }
  }

  // Validate end date if provided
  let periodDuration: number | null = null
  if (endDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return { success: false, error: "Please select a valid end date." }
    }
    if (endDate > todayStr) {
      return { success: false, error: "Period end date cannot be in the future." }
    }
    if (endDate < startDate) {
      return { success: false, error: "Period end date cannot be before the start date." }
    }
    periodDuration = calculateInclusiveDays(startDate, endDate)
  }

  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser()

    if (userErr || !user) {
      return { success: false, error: "You must be signed in to log a period." }
    }

    // Check for exact duplicate start date
    const { data: existingCycle } = await supabase
      .from("cycles")
      .select("id")
      .eq("user_id", user.id)
      .eq("start_date", startDate)
      .maybeSingle()

    if (existingCycle) {
      return {
        success: false,
        error: "A cycle starting on this date already exists. You can edit that cycle instead.",
      }
    }

    // Insert cycle
    const { data: newCycle, error: insertError } = await supabase
      .from("cycles")
      .insert({
        user_id: user.id,
        start_date: startDate,
        end_date: endDate,
        period_duration: periodDuration,
        notes: notes,
      })
      .select()
      .single()

    if (insertError || !newCycle) {
      return {
        success: false,
        error: insertError?.message || "Failed to save cycle. Please try again.",
      }
    }

    // Generate period days records
    const datesToGenerate = endDate
      ? generateDateRange(startDate, endDate)
      : [startDate]

    const periodDaysRows = datesToGenerate.map((date) => ({
      cycle_id: newCycle.id,
      user_id: user.id,
      date: date,
      flow: "medium" as FlowLevel,
    }))

    // Use upsert on (user_id, date) to respect unique constraint
    const { error: daysError } = await supabase
      .from("period_days")
      .upsert(periodDaysRows, { onConflict: "user_id,date" })

    if (daysError) {
      console.error("Error creating period days:", daysError.message)
    }

    // Persist calculated cycle lengths for all consecutive cycles
    await syncCycleLengthsForUser(supabase, user.id)

    revalidatePath("/cycles")
    revalidatePath("/dashboard")
    return { success: true, cycleId: newCycle.id }
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "An unexpected error occurred.",
    }
  }
}

/**
 * 5. Update existing cycle, recalculate duration, and reconcile period days.
 */
export async function updateCycleAction(
  cycleId: string,
  _prevState: CycleActionResult | null,
  formData: FormData
): Promise<CycleActionResult> {
  const startDate = (formData.get("startDate") as string)?.trim()
  const endDate = (formData.get("endDate") as string)?.trim() || null
  const notes = (formData.get("notes") as string)?.trim() || null

  const todayStr = getTodayDateString()

  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return { success: false, error: "Please select a valid start date." }
  }
  if (startDate > todayStr) {
    return { success: false, error: "Period start date cannot be in the future." }
  }

  let periodDuration: number | null = null
  if (endDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return { success: false, error: "Please select a valid end date." }
    }
    if (endDate > todayStr) {
      return { success: false, error: "Period end date cannot be in the future." }
    }
    if (endDate < startDate) {
      return { success: false, error: "Period end date cannot be before the start date." }
    }
    periodDuration = calculateInclusiveDays(startDate, endDate)
  }

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, error: "You must be signed in to edit a cycle." }
    }

    // Verify ownership
    const { data: existingCycle } = await supabase
      .from("cycles")
      .select("id, start_date")
      .eq("id", cycleId)
      .eq("user_id", user.id)
      .single()

    if (!existingCycle) {
      return { success: false, error: "Cycle not found or permission denied." }
    }

    // If start_date changed, check conflict
    if (startDate !== existingCycle.start_date) {
      const { data: conflict } = await supabase
        .from("cycles")
        .select("id")
        .eq("user_id", user.id)
        .eq("start_date", startDate)
        .neq("id", cycleId)
        .maybeSingle()

      if (conflict) {
        return {
          success: false,
          error: "Another cycle already exists starting on this date.",
        }
      }
    }

    // Update cycle record
    const { error: updateErr } = await supabase
      .from("cycles")
      .update({
        start_date: startDate,
        end_date: endDate,
        period_duration: periodDuration,
        notes: notes,
      })
      .eq("id", cycleId)
      .eq("user_id", user.id)

    if (updateErr) {
      return { success: false, error: updateErr.message }
    }

    // Reconcile period days
    // 1. Fetch existing period days
    const { data: existingDays } = await supabase
      .from("period_days")
      .select("id, date, flow")
      .eq("cycle_id", cycleId)
      .eq("user_id", user.id)

    const existingDaysMap = new Map<string, FlowLevel>()
    const existingDaysIdsByDate = new Map<string, string>()
    if (existingDays) {
      for (const d of existingDays) {
        existingDaysMap.set(d.date, d.flow as FlowLevel)
        existingDaysIdsByDate.set(d.date, d.id)
      }
    }

    // 2. Target date range
    const targetDates = new Set<string>(
      endDate ? generateDateRange(startDate, endDate) : [startDate]
    )

    // 3. Delete days outside new range
    const idsToDelete: string[] = []
    if (existingDays) {
      for (const d of existingDays) {
        if (!targetDates.has(d.date)) {
          idsToDelete.push(d.id)
        }
      }
    }

    if (idsToDelete.length > 0) {
      await supabase.from("period_days").delete().in("id", idsToDelete)
    }

    // 4. Insert or preserve days in target range
    const rowsToUpsert = Array.from(targetDates).map((date) => ({
      cycle_id: cycleId,
      user_id: user.id,
      date: date,
      flow: existingDaysMap.get(date) || ("medium" as FlowLevel),
    }))

    await supabase
      .from("period_days")
      .upsert(rowsToUpsert, { onConflict: "user_id,date" })

    // Persist calculated cycle lengths for all consecutive cycles
    await syncCycleLengthsForUser(supabase, user.id)

    revalidatePath("/cycles")
    revalidatePath(`/cycles/${cycleId}`)
    revalidatePath("/dashboard")
    return { success: true, cycleId }
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "An unexpected error occurred.",
    }
  }
}

/**
 * 6. Delete a cycle. Cascade removes associated period days.
 */
export async function deleteCycleAction(cycleId: string): Promise<CycleActionResult> {
  let shouldRedirect = false
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, error: "You must be signed in to delete a cycle." }
    }

    const { error } = await supabase
      .from("cycles")
      .delete()
      .eq("id", cycleId)
      .eq("user_id", user.id)

    if (error) {
      return { success: false, error: error.message }
    }

    // Persist calculated cycle lengths for remaining cycles
    await syncCycleLengthsForUser(supabase, user.id)

    revalidatePath("/cycles")
    revalidatePath("/dashboard")
    shouldRedirect = true
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) {
      throw err
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to delete cycle.",
    }
  }

  if (shouldRedirect) {
    redirect("/cycles")
  }

  return { success: true }
}

/**
 * 7. Update flow for a specific period day.
 */
export async function updatePeriodDayFlowAction(
  periodDayId: string,
  cycleId: string,
  flow: FlowLevel
): Promise<CycleActionResult> {
  if (!["light", "medium", "heavy"].includes(flow)) {
    return { success: false, error: "Invalid flow value." }
  }

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, error: "Unauthorized." }
    }

    const { error } = await supabase
      .from("period_days")
      .update({ flow })
      .eq("id", periodDayId)
      .eq("user_id", user.id)

    if (error) {
      return { success: false, error: error.message }
    }

    revalidatePath(`/cycles/${cycleId}`)
    return { success: true }
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update flow.",
    }
  }
}
