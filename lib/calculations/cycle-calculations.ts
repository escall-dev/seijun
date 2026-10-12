import type { CycleRecord } from "@/app/actions/cycles"

/**
 * Parses a YYYY-MM-DD string into a local Date object set at 00:00:00
 */
export function parseDateString(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number)
  return new Date(y, m - 1, d)
}

/**
 * Formats a Date object into YYYY-MM-DD
 */
export function formatDateToString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

export function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/**
 * Returns today's date formatted as YYYY-MM-DD in local time
 */
export function getTodayDateString(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
}

/**
 * Calculates inclusive difference in days between two YYYY-MM-DD date strings
 */
export function calculateInclusiveDays(startStr: string, endStr: string): number {
  return calculateDaysBetween(startStr, endStr) + 1
}

/**
 * Calculates days between two YYYY-MM-DD dates (later - earlier)
 */
export function calculateDaysBetween(earlierStr: string, laterStr: string): number {
  // Calendar dates, rather than elapsed hours, also work across DST boundaries.
  const ordinal = (value: string) => {
    const [year, month, day] = value.split("-").map(Number)
    return Date.UTC(year, month - 1, day) / 86400000
  }
  return ordinal(laterStr) - ordinal(earlierStr)
}

/**
 * Determine the user's current cycle from the most recent cycle whose start date is today or earlier.
 */
export function getCurrentCycle(
  cycles: CycleRecord[],
  referenceDateStr: string = getTodayDateString()
): CycleRecord | null {
  if (!cycles || cycles.length === 0) return null

  // Filter cycles that started on or before referenceDate, ordered by start_date DESC
  const eligible = cycles
    .filter((c) => c.start_date <= referenceDateStr)
    .sort((a, b) => (b.start_date > a.start_date ? 1 : b.start_date < a.start_date ? -1 : 0))

  return eligible[0] ?? null
}

/**
 * Current cycle day calculation:
 * today - current cycle.start_date + 1
 * Never less than 1.
 */
export function calculateCurrentCycleDay(
  cycleStartDate: string,
  referenceDateStr: string = getTodayDateString()
): number {
  const daysDiff = calculateDaysBetween(cycleStartDate, referenceDateStr)
  return Math.max(1, daysDiff + 1)
}

export interface CurrentCycleStatus {
  status: "Period" | "Cycle day X" | "Tracking started" | "No period logged yet" | "No active cycle"
  displayStatus: string
  isOnPeriod: boolean
  currentDay: number | null
}

/**
 * Determines current cycle status without medical certainty.
 */
export function getCurrentCycleStatus(
  currentCycle: CycleRecord | null,
  referenceDateStr: string = getTodayDateString()
): CurrentCycleStatus {
  if (!currentCycle) {
    return {
      status: "No active cycle",
      displayStatus: "No active cycle",
      isOnPeriod: false,
      currentDay: null,
    }
  }

  const currentDay = calculateCurrentCycleDay(currentCycle.start_date, referenceDateStr)
  const periodDays = currentCycle.period_days || []

  // Check if today is explicitly logged as a period day
  const isPeriodDayToday = periodDays.some((pd) => pd.date === referenceDateStr)

  if (isPeriodDayToday) {
    return {
      status: "Period",
      displayStatus: `Period (Day ${currentDay})`,
      isOnPeriod: true,
      currentDay,
    }
  }

  // If no period days have been logged for this cycle at all
  if (periodDays.length === 0) {
    if (currentDay <= 3) {
      return {
        status: "Tracking started",
        displayStatus: "Tracking started",
        isOnPeriod: false,
        currentDay,
      }
    }
    return {
      status: "No period logged yet",
      displayStatus: "No period logged yet",
      isOnPeriod: false,
      currentDay,
    }
  }

  // Period days exist but today is not logged as period
  return {
    status: "Cycle day X",
    displayStatus: `Cycle day ${currentDay}`,
    isOnPeriod: false,
    currentDay,
  }
}

export type PeriodRecordStatus = "In Progress" | "Done"

/**
 * Calculates period record status following the canonical integrity rules:
 * - Valid start date without an end date: "In Progress"
 * - Valid start and valid end dates (end >= start): "Done"
 * - Missing or invalid start date: never mark "Done" (returns null)
 * - End date earlier than start date: reject as invalid and never mark "Done" (returns null)
 */
export function calculatePeriodRecordStatus(
  startDate?: string | null,
  endDate?: string | null
): PeriodRecordStatus | null {
  if (!startDate || !isValidDateString(startDate)) {
    return null
  }

  if (!endDate) {
    return "In Progress"
  }

  if (!isValidDateString(endDate)) {
    return null
  }

  if (endDate < startDate) {
    return null
  }

  return "Done"
}

export interface LatestPeriodInfo {
  startDate: string
  endDate: string | null
  duration: number | null
  isOngoing: boolean
  status: PeriodRecordStatus | null
  cycleId: string
  periodDaysCount: number
}

/**
 * Returns latest explicit period from actual period_days and cycle data.
 * Returns null if no explicit period days have been logged.
 */
export function getLatestPeriod(cycles: CycleRecord[]): LatestPeriodInfo | null {
  if (!cycles || cycles.length === 0) return null

  // Sort cycles DESC to inspect newest cycles first
  const sorted = [...cycles].sort((a, b) =>
    b.start_date > a.start_date ? 1 : b.start_date < a.start_date ? -1 : 0
  )

  for (const cycle of sorted) {
    const pDays = cycle.period_days || []
    if (pDays.length > 0) {
      // Sort period days ASC
      const sortedDays = [...pDays].sort((a, b) =>
        a.date > b.date ? 1 : a.date < b.date ? -1 : 0
      )
      const firstDay = sortedDays[0].date
      const lastDay = sortedDays[sortedDays.length - 1].date

      let duration = cycle.period_duration
      if (!duration) {
        duration = cycle.end_date
          ? calculateInclusiveDays(firstDay, cycle.end_date)
          : sortedDays.length
      }

      const status = calculatePeriodRecordStatus(firstDay, cycle.end_date)

      return {
        startDate: firstDay,
        endDate: cycle.end_date || (cycle.end_date === null ? null : lastDay),
        duration,
        isOngoing: !cycle.end_date,
        status,
        cycleId: cycle.id,
        periodDaysCount: sortedDays.length,
      }
    }
  }

  return null
}

/**
 * Average cycle length:
 * Uses completed consecutive cycle intervals from actual cycle start dates.
 * Returns null if there are fewer than 2 cycles.
 */
export function calculateAverageCycleLength(cycles: CycleRecord[], referenceDate = getTodayDateString()): number | null {
  const intervals = getCompletedCycleLengths(cycles, referenceDate)
  return intervals.length ? Math.round(median(intervals)) : null
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/**
 * Calculates completed cycle lengths between consecutive valid cycle starts.
 *
 * Rules:
 * 1. Cycle start dates must be <= referenceDate (today).
 * 2. Deduplicates same-day cycle records.
 * 3. Intervals between starts < 18 days are treated as non-cycle bleeding/spotting artifacts and excluded.
 * 4. Maximum interval cap: 90 days (intervals > 90d represent amenorrhea/missed cycles, not typical cycle length).
 * 5. Established history (>= 3 intervals): applies Median Absolute Deviation (MAD) outlier filtering.
 * 6. Limited history (< 3 intervals): filters out sub-normal (< 21 days) or extreme (> 60 days) intervals
 *    to prevent a single anomalous entry from dominating predictions.
 */
export function getCompletedCycleLengths(cycles: CycleRecord[], referenceDate = getTodayDateString()): number[] {
  if (!cycles || cycles.length === 0) return []

  const starts = [...new Set(
    cycles
      .map((c) => c.start_date)
      .filter((date) => isValidDateString(date) && date <= referenceDate)
  )].sort()

  if (starts.length < 2) return []

  const intervals: number[] = []
  for (let i = 0; i < starts.length - 1; i++) {
    const days = calculateDaysBetween(starts[i], starts[i + 1])
    if (days >= 18 && days <= 90) {
      intervals.push(days)
    }
  }

  const recentIntervals = intervals.slice(-12)
  if (recentIntervals.length === 0) return []

  if (recentIntervals.length < 3) {
    // Limited history (< 3 intervals): only accept plausible normal cycles (21-60 days).
    // Sub-normal intervals (< 21 days) are not permitted to dominate without established multi-cycle evidence.
    return recentIntervals.filter((days) => days >= 21 && days <= 60)
  }

  const center = median(recentIntervals)
  const deviation = median(recentIntervals.map((days) => Math.abs(days - center)))
  const threshold = Math.max(7, deviation * 3)
  const filtered = recentIntervals.filter((days) => Math.abs(days - center) <= threshold)

  return filtered.length > 0 ? filtered : recentIntervals
}

export function getRecordedCycleEnd(cycle: CycleRecord, cycles: CycleRecord[]): string | null {
  const next = cycles.filter(c => c.start_date > cycle.start_date).sort((a, b) => a.start_date.localeCompare(b.start_date))[0]
  if (!next) return null
  const date = parseDateString(next.start_date)
  date.setDate(date.getDate() - 1)
  return formatDateToString(date)
}

/**
 * Average period duration:
 * Uses cycles with known start/end dates or explicitly logged period-day ranges.
 * Excludes incomplete / ongoing periods where doing so would produce misleading values.
 */
export function calculateAveragePeriodDuration(cycles: CycleRecord[]): number | null {
  if (!cycles || cycles.length === 0) return null

  const durations: number[] = []

  for (const cycle of cycles) {
    if (cycle.end_date) {
      if (cycle.period_duration && cycle.period_duration > 0) {
        durations.push(cycle.period_duration)
      } else if (cycle.period_days && cycle.period_days.length > 0) {
        durations.push(cycle.period_days.length)
      }
    }
  }

  if (durations.length === 0) return null

  const sum = durations.reduce((acc, curr) => acc + curr, 0)
  return Math.round(sum / durations.length)
}

export interface EstimatedNextPeriod {
  windowStartDate?: string
  windowEndDate?: string
  historyCount?: number
  estimatedStartDate: string // YYYY-MM-DD
  daysUntil: number
  isFallback: boolean // True if using profile typical_cycle_length rather than completed history
  cycleLengthUsed: number
  statusDescription: string
}

/**
 * Calculate:
 * estimated_next_period = latest_cycle.start_date + average_cycle_length
 * Uses average_cycle_length if available; falls back to typicalCycleLength.
 */
export function calculateEstimatedNextPeriod(params: {
  latestCycleStartDate: string | null
  averageCycleLength: number | null
  typicalCycleLength: number | null
  referenceDateStr?: string
  cycles?: CycleRecord[]
}): EstimatedNextPeriod | null {
  const {
    latestCycleStartDate,
    averageCycleLength,
    typicalCycleLength,
    referenceDateStr = getTodayDateString(),
  } = params

  if (!latestCycleStartDate) return null

  const historicalLength = params.cycles ? calculateAverageCycleLength(params.cycles, referenceDateStr) : averageCycleLength
  const hasHistory = historicalLength !== null && historicalLength > 0
  const cycleLength = hasHistory ? historicalLength! : (typicalCycleLength && typicalCycleLength >= 18 && typicalCycleLength <= 90 ? typicalCycleLength : 28)

  if (!cycleLength || !Number.isFinite(cycleLength) || cycleLength < 18 || cycleLength > 90) return null

  const start = parseDateString(latestCycleStartDate)
  const estimatedDate = new Date(start)
  estimatedDate.setDate(estimatedDate.getDate() + cycleLength)

  const estimatedStartDate = formatDateToString(estimatedDate)
  const daysUntil = calculateDaysBetween(referenceDateStr, estimatedStartDate)

  let statusDescription = ""
  if (daysUntil > 0) {
    statusDescription = `In ~${daysUntil} days`
  } else if (daysUntil === 0) {
    statusDescription = "Expected today"
  } else {
    statusDescription = `Estimated date has passed (~${Math.abs(daysUntil)} days ago) · cycle continues`
  }

  return {
    ...getExpectedPeriodWindow(params.cycles ?? [], latestCycleStartDate, referenceDateStr),
    estimatedStartDate,
    daysUntil,
    isFallback: !hasHistory,
    cycleLengthUsed: cycleLength,
    statusDescription,
  }
}

function getExpectedPeriodWindow(cycles: CycleRecord[], start: string, reference: string) {
  const lengths = getCompletedCycleLengths(cycles, reference)
  if (lengths.length < 3) return { historyCount: lengths.length }
  const add = (days: number) => {
    const date = parseDateString(start)
    date.setDate(date.getDate() + days)
    return formatDateToString(date)
  }
  return { historyCount: lengths.length, windowStartDate: add(Math.min(...lengths)), windowEndDate: add(Math.max(...lengths)) }
}

export interface CycleProgress {
  progressPercent: number
  day: number
  expectedTotalDays: number
}

/**
 * Calculates simple cycle progress percentage against expected cycle length
 */
export function calculateCycleProgress(params: {
  currentCycleDay: number
  expectedCycleLength: number
}): CycleProgress {
  const { currentCycleDay, expectedCycleLength } = params
  const validTotal = Math.max(1, expectedCycleLength)
  const progressPercent = Math.min(100, Math.max(0, Math.round((currentCycleDay / validTotal) * 100)))

  return {
    progressPercent,
    day: currentCycleDay,
    expectedTotalDays: validTotal,
  }
}
