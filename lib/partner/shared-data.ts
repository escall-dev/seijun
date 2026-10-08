import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import {
  authorizeSupporterAccess,
  type AuthorizationDenialReason,
} from "./authorization"
import type { CycleRecord, PeriodDayRecord } from "@/app/actions/cycles"

/**
 * Seijun Phase 19 Batch 3 — Steps 12–14
 * Shared Partner Data Service
 *
 * Provides authorized, read-only, data-minimized access to owner data
 * for authenticated supporters. Each category is independently gated.
 *
 * DATA ACCESS PRINCIPLE:
 *   authenticate → authorize → check sharing category → query only authorized data → return minimal fields
 *
 * NEVER:
 *   fetch all owner data → send to client → hide private sections in React
 */

// ─── Shared Result Types ─────────────────────────────────────────────────────

export interface SharedDataSuccess<T> {
  ok: true
  data: T
}

export interface SharedDataDenied {
  ok: false
  reason: AuthorizationDenialReason
  message: string
}

export type SharedDataResult<T> = SharedDataSuccess<T> | SharedDataDenied

// ─── Step 12: Shared Cycle Estimates ─────────────────────────────────────────

/**
 * Minimal cycle estimate fields exposed to supporters.
 * Excludes: id, user_id, notes, internal metadata
 */
export interface SharedCycleEstimate {
  currentCycleDay: number | null
  currentCyclePhase: string
  isOnPeriod: boolean
  estimatedNextPeriodDate: string | null
  estimatedNextPeriodDaysUntil: number | null
  averageCycleLength: number | null
  averagePeriodDuration: number | null
  currentCycleStartDate: string | null
  cycleProgress: number | null
}

/**
 * Fetches shared cycle estimate data for the supporter.
 *
 * Authorization: cycle_estimates must be enabled.
 * Reuses existing cycle-calculations.ts functions.
 */
export async function getSharedCycleEstimates(
  supabase: SupabaseClient<Database>
): Promise<SharedDataResult<SharedCycleEstimate>> {
  const authResult = await authorizeSupporterAccess(supabase, "cycle_estimates")

  if (!authResult.authorized) {
    return {
      ok: false,
      reason: authResult.reason,
      message: authResult.message,
    }
  }

  const { ownerUserId } = authResult.context

  try {
    // Fetch owner's cycles using service role context
    // RLS policies will be extended to allow supporter SELECT on cycles
    const { data: cyclesRaw, error: cyclesError } = await supabase
      .from("cycles")
      .select("id, start_date, end_date, cycle_length, period_duration, created_at, updated_at")
      .eq("user_id", ownerUserId)
      .order("start_date", { ascending: true })

    if (cyclesError || !cyclesRaw || cyclesRaw.length === 0) {
      return {
        ok: true,
        data: {
          currentCycleDay: null,
          currentCyclePhase: "No cycle data",
          isOnPeriod: false,
          estimatedNextPeriodDate: null,
          estimatedNextPeriodDaysUntil: null,
          averageCycleLength: null,
          averagePeriodDuration: null,
          currentCycleStartDate: null,
          cycleProgress: null,
        },
      }
    }

    // Fetch period days for all owner's cycles
    const { data: periodDays } = await supabase
      .from("period_days")
      .select("id, cycle_id, user_id, date, flow, created_at")
      .eq("user_id", ownerUserId)
      .order("date", { ascending: true })

    // Build CycleRecord objects (reusing existing data shape)
    const daysByCycle = new Map<string, PeriodDayRecord[]>()
    if (periodDays) {
      for (const day of periodDays) {
        const list = daysByCycle.get(day.cycle_id) || []
        list.push(day as PeriodDayRecord)
        daysByCycle.set(day.cycle_id, list)
      }
    }

    const cycles: CycleRecord[] = cyclesRaw.map((cycle, index) => {
      const nextCycle = cyclesRaw[index + 1]
      const calculatedLength = nextCycle ? daysBetween(cycle.start_date, nextCycle.start_date) : null
      const daysList = daysByCycle.get(cycle.id) || []
      return {
        ...cycle,
        user_id: ownerUserId,
        notes: null, // NEVER expose owner's cycle notes to supporter
        cycle_length: calculatedLength,
        period_days: daysList,
        period_days_count: daysList.length,
      }
    }).reverse() // DESC order (most recent first)

    // Reuse existing calculation functions
    const { getCurrentCycle, getCurrentCycleStatus, calculateAverageCycleLength, calculateAveragePeriodDuration, calculateEstimatedNextPeriod, getTodayDateString } = await import("@/lib/calculations/cycle-calculations")

    const todayStr = getTodayDateString()
    const currentCycle = getCurrentCycle(cycles, todayStr)
    const statusInfo = getCurrentCycleStatus(currentCycle, todayStr)
    const avgCycleLength = calculateAverageCycleLength(cycles)
    const avgPeriodDuration = calculateAveragePeriodDuration(cycles)

    // Fetch owner's typical_cycle_length for fallback
    const { data: ownerProfile } = await supabase
      .from("profiles")
      .select("typical_cycle_length")
      .eq("user_id", ownerUserId)
      .maybeSingle()

    const typicalCycleLength = ownerProfile?.typical_cycle_length ?? 28
    const latestCycleStart = currentCycle?.start_date ?? null

    const estimatedNextPeriod = calculateEstimatedNextPeriod({
      latestCycleStartDate: latestCycleStart,
      averageCycleLength: avgCycleLength,
      typicalCycleLength,
      referenceDateStr: todayStr,
      cycles,
    })

    const cycleProgressPercent = null // Observed days have no predicted endpoint.

    return {
      ok: true,
      data: {
        currentCycleDay: statusInfo.currentDay,
        currentCyclePhase: statusInfo.displayStatus,
        isOnPeriod: statusInfo.isOnPeriod,
        estimatedNextPeriodDate: estimatedNextPeriod?.estimatedStartDate ?? null,
        estimatedNextPeriodDaysUntil: estimatedNextPeriod?.daysUntil ?? null,
        averageCycleLength: avgCycleLength,
        averagePeriodDuration: avgPeriodDuration,
        currentCycleStartDate: currentCycle?.start_date ?? null,
        cycleProgress: cycleProgressPercent,
      },
    }
  } catch {
    return {
      ok: false,
      reason: "AUTHORIZATION_ERROR",
      message: "Failed to retrieve cycle estimate data.",
    }
  }
}

// ─── Step 13: Shared Period Status ───────────────────────────────────────────

/**
 * Minimal period status fields exposed to supporters.
 * Independently authorized from cycle_estimates.
 */
export interface SharedPeriodStatus {
  isOnPeriod: boolean
  currentPeriodDay: number | null
  lastPeriodStartDate: string | null
  lastPeriodEndDate: string | null
  lastPeriodDuration: number | null
}

/**
 * Fetches shared period status data for the supporter.
 *
 * Authorization: period_status must be enabled.
 * INDEPENDENT from cycle_estimates — cycle_estimates=OFF, period_status=ON is valid.
 */
export async function getSharedPeriodStatus(
  supabase: SupabaseClient<Database>
): Promise<SharedDataResult<SharedPeriodStatus>> {
  const authResult = await authorizeSupporterAccess(supabase, "period_status")

  if (!authResult.authorized) {
    return {
      ok: false,
      reason: authResult.reason,
      message: authResult.message,
    }
  }

  const { ownerUserId } = authResult.context

  try {
    // Fetch owner's cycles with period days
    const { data: cyclesRaw, error: cyclesError } = await supabase
      .from("cycles")
      .select("id, start_date, end_date, period_duration")
      .eq("user_id", ownerUserId)
      .order("start_date", { ascending: false })

    if (cyclesError || !cyclesRaw || cyclesRaw.length === 0) {
      return {
        ok: true,
        data: {
          isOnPeriod: false,
          currentPeriodDay: null,
          lastPeriodStartDate: null,
          lastPeriodEndDate: null,
          lastPeriodDuration: null,
        },
      }
    }

    // Fetch period days for most recent cycles
    const cycleIds = cyclesRaw.slice(0, 3).map((c) => c.id)
    const { data: periodDays } = await supabase
      .from("period_days")
      .select("cycle_id, date, flow")
      .eq("user_id", ownerUserId)
      .in("cycle_id", cycleIds)
      .order("date", { ascending: true })

    const daysByCycle = new Map<string, { date: string; flow: string }[]>()
    if (periodDays) {
      for (const day of periodDays) {
        const list = daysByCycle.get(day.cycle_id) || []
        list.push({ date: day.date, flow: day.flow })
        daysByCycle.set(day.cycle_id, list)
      }
    }

    const { getTodayDateString } = await import("@/lib/calculations/cycle-calculations")
    const todayStr = getTodayDateString()

    // Check if currently on period
    const latestCycle = cyclesRaw[0]
    const latestPeriodDays = daysByCycle.get(latestCycle.id) || []
    const isOnPeriod = latestPeriodDays.some((pd) => pd.date === todayStr)

    // Find last period info
    let lastPeriodStartDate: string | null = null
    let lastPeriodEndDate: string | null = null
    let lastPeriodDuration: number | null = null
    let currentPeriodDay: number | null = null

    for (const cycle of cyclesRaw) {
      const pDays = daysByCycle.get(cycle.id) || []
      if (pDays.length > 0) {
        const sortedDays = [...pDays].sort((a, b) => a.date.localeCompare(b.date))
        lastPeriodStartDate = sortedDays[0].date
        lastPeriodEndDate = cycle.end_date || sortedDays[sortedDays.length - 1].date
        lastPeriodDuration = cycle.period_duration || sortedDays.length

        if (isOnPeriod) {
          currentPeriodDay = daysBetween(lastPeriodStartDate, todayStr) + 1
        }
        break
      }
    }

    return {
      ok: true,
      data: {
        isOnPeriod,
        currentPeriodDay,
        lastPeriodStartDate,
        lastPeriodEndDate,
        lastPeriodDuration,
      },
    }
  } catch {
    return {
      ok: false,
      reason: "AUTHORIZATION_ERROR",
      message: "Failed to retrieve period status data.",
    }
  }
}

// ─── Step 14a: Shared Cycle Preferences ──────────────────────────────────────

/**
 * Minimal cycle preference fields exposed to supporters.
 * Excludes: private identifiers, role classification, and unrelated account settings.
 */
export interface SharedCyclePreferences {
  typicalCycleLength: number | null
  lastPeriodStart: string | null
}

/**
 * Fetches shared cycle preferences for the supporter.
 *
 * Authorization: cycle_preferences must be enabled.
 * Supporter is READ-ONLY — cannot modify.
 */
export async function getSharedCyclePreferences(
  supabase: SupabaseClient<Database>
): Promise<SharedDataResult<SharedCyclePreferences>> {
  const authResult = await authorizeSupporterAccess(supabase, "cycle_preferences")

  if (!authResult.authorized) {
    return {
      ok: false,
      reason: authResult.reason,
      message: authResult.message,
    }
  }

  const { ownerUserId } = authResult.context

  try {
    // Only fetch the specific shareable preference fields — nothing else
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("typical_cycle_length, last_period_start")
      .eq("user_id", ownerUserId)
      .maybeSingle()

    if (profileError || !profile) {
      return {
        ok: true,
        data: {
          typicalCycleLength: null,
          lastPeriodStart: null,
        },
      }
    }

    return {
      ok: true,
      data: {
        typicalCycleLength: profile.typical_cycle_length,
        lastPeriodStart: profile.last_period_start,
      },
    }
  } catch {
    return {
      ok: false,
      reason: "AUTHORIZATION_ERROR",
      message: "Failed to retrieve cycle preferences.",
    }
  }
}

// ─── Step 14b: Shared Daily Notes ────────────────────────────────────────────

/**
 * Shared daily note fields exposed to authorized partners.
 * Excludes: user_id, system metadata. Includes id, date, content, createdAt, authorId.
 */
export interface SharedDailyNote {
  id: string
  date: string
  content: string
  createdAt: string
  authorId?: string | null
}

/**
 * Fetches shared daily notes for the supporter.
 *
 * Authorization: daily_notes must be enabled.
 * Supporter can VIEW, and if manage_daily_notes is enabled, can also mutate.
 */
export async function getSharedDailyNotes(
  supabase: SupabaseClient<Database>,
  limit: number = 30
): Promise<SharedDataResult<SharedDailyNote[]>> {
  const authResult = await authorizeSupporterAccess(supabase, "daily_notes")

  if (!authResult.authorized) {
    return {
      ok: false,
      reason: authResult.reason,
      message: authResult.message,
    }
  }

  const { ownerUserId } = authResult.context

  try {
    const { data: notes, error: notesError } = await supabase
      .from("daily_notes")
      .select("id, date, content, created_at, author_id")
      .eq("user_id", ownerUserId)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(Math.min(limit, 100)) // Hard cap at 100

    if (notesError) {
      return {
        ok: false,
        reason: "AUTHORIZATION_ERROR",
        message: "Failed to retrieve daily notes.",
      }
    }

    // Return sanitized fields — includes note ID and timestamp for timeline & management
    const sharedNotes: SharedDailyNote[] = (notes || []).map((note) => ({
      id: note.id,
      date: note.date,
      content: note.content,
      createdAt: note.created_at,
      authorId: note.author_id ?? null,
    }))

    return {
      ok: true,
      data: sharedNotes,
    }
  } catch {
    return {
      ok: false,
      reason: "AUTHORIZATION_ERROR",
      message: "Failed to retrieve daily notes.",
    }
  }
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function daysBetween(earlierStr: string, laterStr: string): number {
  const [ey, em, ed] = earlierStr.split("-").map(Number)
  const [ly, lm, ld] = laterStr.split("-").map(Number)
  const earlier = new Date(ey, em - 1, ed)
  const later = new Date(ly, lm - 1, ld)
  return Math.round((later.getTime() - earlier.getTime()) / (1000 * 60 * 60 * 24))
}
