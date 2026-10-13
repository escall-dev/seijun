import assert from "node:assert/strict"
import fs from "node:fs"
import ts from "typescript"

console.log("Running Seijun Phase 25B cycle prediction tests...")

async function loadCalculations() {
  const source = fs.readFileSync("lib/calculations/cycle-calculations.ts", "utf8")
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`)
}

const calc = await loadCalculations()
const reference = "2026-12-31"
const addDays = (date, days) => {
  const result = new Date(`${date}T00:00:00Z`)
  result.setUTCDate(result.getUTCDate() + days)
  return result.toISOString().slice(0, 10)
}
function historyFromIntervals(intervals, { endOffsets = [] } = {}) {
  const starts = ["2026-01-01"]
  for (const interval of intervals) starts.push(addDays(starts.at(-1), interval))
  return starts.map((start_date, index) => ({
    id: `cycle-${index}`,
    user_id: "owner",
    start_date,
    end_date: index < starts.length - 1 ? addDays(start_date, endOffsets[index] ?? 4) : null,
    cycle_length: null,
    period_duration: null,
    notes: null,
    created_at: "",
    updated_at: "",
    period_days: [],
  }))
}
function estimate(cycles, overrides = {}) {
  const latest = [...cycles].map((cycle) => cycle.start_date).sort().at(-1) ?? "2026-01-01"
  return calc.calculateEstimatedNextPeriod({
    latestCycleStartDate: latest,
    averageCycleLength: null,
    typicalCycleLength: 28,
    referenceDateStr: reference,
    cycles,
    ...overrides,
  })
}

// Six most recent usable intervals only; older history cannot change the estimate.
const sixRecent = historyFromIntervals([44, 22, 24, 25, 25, 25, 25, 25, 25])
assert.deepEqual(calc.getCompletedCycleLengths(sixRecent, reference), [25, 25, 25, 25, 25, 25])
assert.equal(calc.calculateAverageCycleLength(sixRecent, reference), 25)
const high = estimate(sixRecent)
assert.equal(high.confidence, "high")
assert.equal(high.isProvisional, false)
assert.equal(high.historyCount, 6)

// Fewer than six intervals stay provisional even when the available lengths agree.
const limited = estimate(historyFromIntervals([25, 25, 25, 25, 25]))
assert.equal(limited.confidence, "moderate")
assert.equal(limited.isProvisional, true)
assert.equal(limited.isFallback, false)

// No usable history preserves the 28-day fallback and labels it provisional.
const noHistory = estimate([{ ...historyFromIntervals([])[0], start_date: "2026-11-01", end_date: null }])
assert.equal(noHistory.isFallback, true)
assert.equal(noHistory.isProvisional, true)
assert.equal(noHistory.confidence, "low")
assert.equal(noHistory.cycleLengthUsed, 28)
assert.equal(noHistory.estimatedStartDate, "2026-11-29")

// Irregular but usable intervals cannot produce a high-confidence estimate.
const irregular = estimate(historyFromIntervals([22, 22, 30, 30, 38, 38]))
assert.notEqual(irregular.confidence, "high")

// Inputs are sorted and validated; duplicate, impossible, and future starts are ignored.
const normal = historyFromIntervals([25, 25, 25])
const unsorted = [
  normal[3],
  normal[1],
  { ...normal[1], id: "duplicate" },
  normal[2],
  { ...normal[2], start_date: "2026-02-30" },
  { ...normal[2], id: "future", start_date: "2027-01-01", end_date: null },
  normal[0],
]
assert.deepEqual(calc.getCompletedCycleLengths(unsorted, reference), [25, 25, 25])
const conflictingDuplicate = historyFromIntervals([25, 25])
conflictingDuplicate.push({
  ...conflictingDuplicate[1],
  id: "conflicting-duplicate",
  end_date: addDays(conflictingDuplicate[1].start_date, 6),
})
assert.deepEqual(calc.getCompletedCycleLengths(conflictingDuplicate, reference), [])

// An ongoing latest period remains ongoing and its preceding interval is usable;
// an older ongoing period followed by a new start is contradictory and excluded.
const ongoingLatest = historyFromIntervals([25, 25])
ongoingLatest[2].end_date = null
assert.deepEqual(calc.getCompletedCycleLengths(ongoingLatest, reference), [25, 25])
assert.equal(calc.calculatePeriodRecordStatus(ongoingLatest[2].start_date, null), "In Progress")
const contradictory = historyFromIntervals([25, 25])
contradictory[0].end_date = null
assert.deepEqual(calc.getCompletedCycleLengths(contradictory, reference), [25])

// End dates reaching the next start overlap; that interval is excluded without
// rewriting either record. A malformed end also makes its record unusable.
const overlap = historyFromIntervals([25, 25])
overlap[0].end_date = overlap[1].start_date
assert.deepEqual(calc.getCompletedCycleLengths(overlap, reference), [25])
const invalidEnd = historyFromIntervals([25, 25])
invalidEnd[1].end_date = "not-a-date"
assert.deepEqual(calc.getCompletedCycleLengths(invalidEnd, reference), [])

// Invalid reference/latest dates and future latest starts never generate estimates.
assert.equal(estimate(sixRecent, { latestCycleStartDate: "2026-02-30" }), null)
assert.equal(estimate(sixRecent, { latestCycleStartDate: "2027-01-01" }), null)
assert.equal(estimate(sixRecent, { referenceDateStr: "2026-02-30" }), null)

// Shared owner/supporter calculations propagate identical utility output and
// supported period mutations invalidate the views that consume the calculation.
const sharedSource = fs.readFileSync("lib/partner/shared-data.ts", "utf8")
assert.match(sharedSource, /calculateEstimatedNextPeriod\(/)
assert.match(sharedSource, /confidence:\s*estimatedNextPeriod\?\.confidence/)
assert.match(sharedSource, /isProvisional:\s*estimatedNextPeriod\?\.isProvisional/)
const ownerView = fs.readFileSync("components/dashboard/period-insights.tsx", "utf8")
const supporterView = fs.readFileSync("components/partner/partner-dashboard-view.tsx", "utf8")
assert.match(ownerView, /estimatedNextPeriod\.isProvisional/)
assert.match(supporterView, /d\.isProvisional/)
const cycleActions = fs.readFileSync("app/actions/cycles.ts", "utf8")
const cycleActionNames = ["createCycleAction", "updateCycleAction", "deleteCycleAction"]
for (let index = 0; index < cycleActionNames.length; index++) {
  const start = cycleActions.indexOf(`function ${cycleActionNames[index]}`)
  const end = index + 1 < cycleActionNames.length
    ? cycleActions.indexOf(`function ${cycleActionNames[index + 1]}`, start)
    : cycleActions.length
  assert.ok(start >= 0 && cycleActions.slice(start, end).includes('revalidatePath("/dashboard")'), `${cycleActionNames[index]} refreshes owner dashboard predictions`)
}
const partnerActions = fs.readFileSync("app/actions/partner-mutations.ts", "utf8")
for (const action of ["recordPartnerPeriodAction", "updatePartnerPeriodAction"]) {
  const start = partnerActions.indexOf(`function ${action}`)
  assert.ok(start >= 0, `${action} remains available`)
  const end = partnerActions.indexOf("export async function", start + 1)
  const body = partnerActions.slice(start, end < 0 ? undefined : end)
  assert.ok(body.includes('revalidatePath("/dashboard")'), `${action} refreshes owner dashboard predictions`)
  assert.ok(body.includes('revalidatePath("/partner")'), `${action} refreshes supporter dashboard predictions`)
}

console.log("Phase 25B cycle prediction tests passed.")
