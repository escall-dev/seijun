import assert from "node:assert/strict"
import fs from "node:fs"
import ts from "typescript"
import { execSync } from "node:child_process"

console.log("=== SEIJUN PHASE 23 QA & VERIFICATION SUITE ===\n")

// Helper to transpile and load TS modules in Node.js
async function loadTS(file) {
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)
}

const calc = await loadTS("lib/calculations/cycle-calculations.ts")

const createCycle = (start_date, end_date = null, period_duration = null) => {
  const period_days = [{ date: start_date, flow: "medium" }]
  if (end_date && end_date !== start_date) {
    period_days.push({ date: end_date, flow: "light" })
  }
  return {
    id: `cycle-${start_date}`,
    user_id: "owner-uuid",
    start_date,
    end_date,
    cycle_length: null,
    period_duration: period_duration || (end_date ? calc.calculateInclusiveDays(start_date, end_date) : 1),
    notes: null,
    created_at: "",
    updated_at: "",
    period_days,
  }
}

// ─── 1. Canonical Version Invariance ──────────────────────────────────────────

console.log("Section 1: Canonical Application Version Invariance")
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"))
const versionTs = fs.readFileSync("lib/version.ts", "utf8")
assert.equal(pkg.version, "1.22.0", "package.json version must remain 1.22.0")
assert.ok(versionTs.includes("packageJson.version"), "lib/version.ts APP_VERSION sources canonical packageJson.version")
assert.ok(versionTs.includes("`v${packageJson.version}`"), "lib/version.ts APP_VERSION_LABEL sources canonical packageJson.version")
console.log("  ✔ Application version exactly 1.22.0 (v1.22.0) preserved.\n")

// ─── 2. Priority 1: Multi-Device MPIN Logic ───────────────────────────────────

console.log("Section 2: Priority 1 — Cross-Device MPIN & Device-Local Isolation")
const mpinStorageSrc = fs.readFileSync("lib/auth/mpin-storage.ts", "utf8")
const loginFormSrc = fs.readFileSync("components/auth/login-form.tsx", "utf8")
const mpinReturningFormSrc = fs.readFileSync("components/auth/mpin-returning-form.tsx", "utf8")

// 2.1 Verify mpin-storage hasDeviceMpin export
assert.ok(mpinStorageSrc.includes("export function hasDeviceMpin(userId: string): boolean"), "mpin-storage exports hasDeviceMpin")
assert.ok(mpinStorageSrc.includes("export function hasMpin(userId: string): boolean"), "mpin-storage exports hasMpin")

// 2.2 Verify login-form checks device presence and routes to setup-mpin for authenticated user on fresh device
assert.ok(loginFormSrc.includes("const isDeviceConfigured = hasMpin(user.id)"), "login-form checks local device verifier in evaluateExistingSession")
assert.ok(loginFormSrc.includes("const isDeviceConfigured = hasMpin(authenticatedId)"), "login-form checks local device verifier in handleSubmit")
assert.ok(loginFormSrc.includes('setViewMode("setup-mpin")'), "login-form routes to setup-mpin when device has no local verifier")
assert.ok(loginFormSrc.includes("onSetupDeviceMpin="), "login-form passes onSetupDeviceMpin handler to MpinReturningForm")

// 2.3 Verify mpin-returning-form has device setup recovery CTA
assert.ok(mpinReturningFormSrc.includes("onSetupDeviceMpin?: () => void"), "mpin-returning-form accepts onSetupDeviceMpin callback")
assert.ok(mpinReturningFormSrc.includes("Set up MPIN for this device"), "mpin-returning-form displays recovery button")

// 2.4 Execute the full 10-test MPIN account switching & fresh device suite
console.log("  Running scripts/test-mpin-account-switching.mjs...")
const switchingOutput = execSync("node scripts/test-mpin-account-switching.mjs", { encoding: "utf8" })
assert.ok(switchingOutput.includes("10 passed, 0 failed"), "All 10 MPIN switching & fresh device tests must pass")
console.log("  ✔ Cross-device MPIN routing correctly prevents 'No PIN configured' dead end.\n")

// ─── 3. Priority 2: Menstrual Cycle Estimation & Oct 3 Date Arithmetic ─────────

console.log("Section 3: Priority 2 — Menstrual Cycle Estimation & Outlier Handling")

// 3.1 Date Arithmetic: Oct 3, 2026 start date with 21-, 24-, 26-, and 28-day cycles
const oct3 = "2026-10-03"

// Elapsed calendar days between consecutive starts:
assert.equal(calc.calculateDaysBetween(oct3, "2026-10-24"), 21, "Oct 3 to Oct 24 is exactly 21 days")
assert.equal(calc.calculateDaysBetween(oct3, "2026-10-27"), 24, "Oct 3 to Oct 27 is exactly 24 days")
assert.equal(calc.calculateDaysBetween(oct3, "2026-10-29"), 26, "Oct 3 to Oct 29 is exactly 26 days")
assert.equal(calc.calculateDaysBetween(oct3, "2026-10-31"), 28, "Oct 3 to Oct 31 is exactly 28 days")

// Oct 3 to Oct 23 is 20 days (sub-normal menstrual interval)
assert.equal(calc.calculateDaysBetween(oct3, "2026-10-23"), 20, "Oct 3 to Oct 23 is 20 days")

// 3.2 Cycle Day (inclusive convention):
assert.equal(calc.calculateCurrentCycleDay(oct3, oct3), 1, "First day of period is Cycle Day 1")
assert.equal(calc.calculateCurrentCycleDay(oct3, "2026-10-08"), 6, "Oct 8 is Cycle Day 6")
assert.equal(calc.calculateCurrentCycleDay(oct3, "2026-10-23"), 21, "Oct 23 is Cycle Day 21")
assert.equal(calc.calculateCurrentCycleDay(oct3, "2026-10-24"), 22, "Oct 24 is Cycle Day 22")

// 3.3 Prediction from 21-, 24-, 26-day average intervals:
const est21 = calc.calculateEstimatedNextPeriod({
  latestCycleStartDate: oct3,
  averageCycleLength: 21,
  typicalCycleLength: 21,
  referenceDateStr: oct3,
})
assert.equal(est21.estimatedStartDate, "2026-10-24", "21-day cycle starting Oct 3 predicts Oct 24")
assert.equal(est21.cycleLengthUsed, 21)

const est24 = calc.calculateEstimatedNextPeriod({
  latestCycleStartDate: oct3,
  averageCycleLength: 24,
  typicalCycleLength: 24,
  referenceDateStr: oct3,
})
assert.equal(est24.estimatedStartDate, "2026-10-27", "24-day cycle starting Oct 3 predicts Oct 27")
assert.equal(est24.cycleLengthUsed, 24)

const est26 = calc.calculateEstimatedNextPeriod({
  latestCycleStartDate: oct3,
  averageCycleLength: 26,
  typicalCycleLength: 26,
  referenceDateStr: oct3,
})
assert.equal(est26.estimatedStartDate, "2026-10-29", "26-day cycle starting Oct 3 predicts Oct 29")
assert.equal(est26.cycleLengthUsed, 26)

console.log("  ✔ Date arithmetic for Oct 3 with 21-, 24-, 26-day cycles verified.")

// 3.4 Fallback behavior when history is limited (< 2 consecutive valid cycles)
const singleHistory = [createCycle(oct3, "2026-10-08", 6)]
const estFallback = calc.calculateEstimatedNextPeriod({
  latestCycleStartDate: oct3,
  averageCycleLength: calc.calculateAverageCycleLength(singleHistory),
  typicalCycleLength: 24,
  referenceDateStr: oct3,
  cycles: singleHistory,
})
assert.equal(estFallback.isFallback, true, "Single recorded cycle falls back to typicalCycleLength")
assert.equal(estFallback.cycleLengthUsed, 24, "Uses partner's typical 24-day cycle length")
assert.equal(estFallback.estimatedStartDate, "2026-10-27", "Oct 3 + typical 24d = Oct 27")
console.log("  ✔ Fallback to typical cycle length operates correctly when history is limited.")

// 3.5 Outlier handling & sub-normal interval rejection (< 21 days for < 3 cycles)
const historyWithAnomalous20d = [
  createCycle("2026-10-03"),
  createCycle("2026-09-13"),
]
const lengths20d = calc.getCompletedCycleLengths(historyWithAnomalous20d)
assert.deepEqual(lengths20d, [], "Sub-normal 20-day interval filtered out when < 3 cycles exist")
assert.equal(calc.calculateAverageCycleLength(historyWithAnomalous20d), null, "Does not allow single anomalous 20d interval to dominate average")

const estWith20d = calc.calculateEstimatedNextPeriod({
  latestCycleStartDate: oct3,
  averageCycleLength: calc.calculateAverageCycleLength(historyWithAnomalous20d),
  typicalCycleLength: 23,
  referenceDateStr: oct3,
  cycles: historyWithAnomalous20d,
})
assert.equal(estWith20d.isFallback, true)
assert.equal(estWith20d.cycleLengthUsed, 23)
assert.equal(estWith20d.estimatedStartDate, "2026-10-26", "Oct 3 + typical 23d = Oct 26")
console.log("  ✔ Sub-normal 20-day interval correctly handled without skewing predictions.")

// 3.6 Consecutive cycles with consistent lengths (e.g. 23 days each)
const consistentHistory = [
  createCycle("2026-10-03"),
  createCycle("2026-09-10"), // Sep 10 to Oct 3 = 23 days
  createCycle("2026-08-18"), // Aug 18 to Sep 10 = 23 days
  createCycle("2026-07-26"), // Jul 26 to Aug 18 = 23 days
]
const consistentLengths = calc.getCompletedCycleLengths(consistentHistory)
assert.deepEqual(consistentLengths, [23, 23, 23], "All three intervals are 23 days")
assert.equal(calc.calculateAverageCycleLength(consistentHistory), 23)

const estConsistent = calc.calculateEstimatedNextPeriod({
  latestCycleStartDate: oct3,
  averageCycleLength: 23,
  typicalCycleLength: 28,
  referenceDateStr: oct3,
  cycles: consistentHistory,
})
assert.equal(estConsistent.isFallback, false, "Uses historical average when valid")
assert.equal(estConsistent.cycleLengthUsed, 23)
assert.equal(estConsistent.estimatedStartDate, "2026-10-26")
console.log("  ✔ Consecutive historical cycles reliably produce calculated average.")

// 3.7 MAD outlier rejection with variable history:
const historyWithOutlier = [
  createCycle("2026-10-03"),
  createCycle("2026-09-10"), // 23 days
  createCycle("2026-08-18"), // 23 days
  createCycle("2026-07-26"), // 23 days
  createCycle("2026-06-12"), // 44 days (outlier)
]
const filteredLengths = calc.getCompletedCycleLengths(historyWithOutlier)
assert.ok(!filteredLengths.includes(44), "44-day anomalous cycle rejected by MAD filter")
assert.equal(calc.calculateAverageCycleLength(historyWithOutlier), 23, "Average remains 23 days despite 44d anomaly")
console.log("  ✔ MAD outlier rejection preserves robust median/average despite anomalies.")

// 3.8 Adding, editing, and clearing period dates:
const ongoingCycle = createCycle("2026-10-03", null)
const ongoingPeriod = calc.getLatestPeriod([ongoingCycle])
assert.equal(ongoingPeriod.isOngoing, true)
assert.equal(ongoingPeriod.startDate, "2026-10-03")
assert.equal(ongoingPeriod.endDate, null)

const endedCycle = createCycle("2026-10-03", "2026-10-08", 6)
const endedPeriod = calc.getLatestPeriod([endedCycle])
assert.equal(endedPeriod.isOngoing, false)
assert.equal(endedPeriod.endDate, "2026-10-08")
assert.equal(endedPeriod.duration, 6)
assert.equal(endedPeriod.startDate, "2026-10-03", "Ending a period preserves cycle start date")

const reopenedCycle = createCycle("2026-10-03", null, null)
const reopenedPeriod = calc.getLatestPeriod([reopenedCycle])
assert.equal(reopenedPeriod.isOngoing, true)
assert.equal(reopenedPeriod.endDate, null)

const shiftedCycle = createCycle("2026-10-04")
const estShifted = calc.calculateEstimatedNextPeriod({
  latestCycleStartDate: shiftedCycle.start_date,
  averageCycleLength: 24,
  typicalCycleLength: 24,
  referenceDateStr: "2026-10-04",
})
assert.equal(estShifted.estimatedStartDate, "2026-10-28", "Oct 4 + 24d = Oct 28")
console.log("  ✔ Period start/end modifications and recalculations operate consistently.")

// 3.9 Overdue handling:
const estOverdue = calc.calculateEstimatedNextPeriod({
  latestCycleStartDate: oct3,
  averageCycleLength: 24,
  typicalCycleLength: 24,
  referenceDateStr: "2026-10-30", // 3 days after predicted Oct 27
})
assert.equal(estOverdue.daysUntil, -3)
assert.ok(estOverdue.statusDescription.includes("Estimated date has passed") && estOverdue.statusDescription.includes("cycle continues"))
console.log("  ✔ Overdue prediction communicates uncertainty without generating fictitious cycles.")

// 3.10 Timezone and DST invariance:
assert.equal(calc.calculateDaysBetween("2026-10-03", "2026-10-27"), 24)
assert.equal(calc.calculateDaysBetween("2026-03-01", "2026-04-01"), 31)
assert.equal(calc.calculateDaysBetween("2026-10-01", "2026-11-01"), 31)
console.log("  ✔ Date-only calculations are timezone and DST invariant.\n")

// ─── 4. Priority 3: Partner Dashboard Hierarchy & Structure ────────────────────

console.log("Section 4: Priority 3 — Partner Dashboard Hierarchy & Privacy")
const partnerViewSrc = fs.readFileSync("components/partner/partner-dashboard-view.tsx", "utf8")

// Verify visual hierarchy order in JSX:
const headerIdx = partnerViewSrc.indexOf("<PartnerDashboardHeader")
const contextBannerIdx = partnerViewSrc.indexOf("Compact Partner Context Banner")
const cycleOverviewIdx = partnerViewSrc.indexOf("1. Partner Cycle Overview")
const cycleDetailsIdx = partnerViewSrc.indexOf("2. Relevant Cycle Details")
const cyclePrefsIdx = partnerViewSrc.indexOf("3. Cycle Preferences")
const affinityIdx = partnerViewSrc.indexOf("4. Affinity & Relationship Information")
const footerIdx = partnerViewSrc.indexOf("5. Secondary Navigation & Supporting Details")

assert.ok(headerIdx !== -1, "PartnerDashboardHeader present")
assert.ok(contextBannerIdx !== -1, "Compact Partner Context Banner present")
assert.ok(cycleOverviewIdx !== -1, "1. Partner Cycle Overview present")
assert.ok(cycleDetailsIdx !== -1, "2. Relevant Cycle Details present")
assert.ok(cyclePrefsIdx !== -1, "3. Cycle Preferences present")
assert.ok(affinityIdx !== -1, "4. Affinity Card present")
assert.ok(footerIdx !== -1, "5. Footer present")

// Assert strict hierarchy: Header -> Context Banner -> Overview -> Details -> Preferences -> Affinity -> Footer
assert.ok(headerIdx < contextBannerIdx, "Header precedes Context Banner")
assert.ok(contextBannerIdx < cycleOverviewIdx, "Context Banner precedes Cycle Overview")
assert.ok(cycleOverviewIdx < cycleDetailsIdx, "Cycle Overview precedes Relevant Details")
assert.ok(cycleDetailsIdx < cyclePrefsIdx, "Cycle Details precede Cycle Preferences")
assert.ok(cyclePrefsIdx < affinityIdx, "Cycle Preferences precede Affinity Card (Affinity is placed BELOW cycle context)")
assert.ok(affinityIdx < footerIdx, "Affinity Card precedes Secondary Navigation/Footer")

// Verify shared-data contains window fields
const sharedDataSrc = fs.readFileSync("lib/partner/shared-data.ts", "utf8")
assert.ok(sharedDataSrc.includes("windowStartDate?: string | null"), "SharedCycleEstimate has windowStartDate")
assert.ok(sharedDataSrc.includes("windowEndDate?: string | null"), "SharedCycleEstimate has windowEndDate")
assert.ok(sharedDataSrc.includes("isFallback?: boolean"), "SharedCycleEstimate has isFallback")

console.log("  ✔ Partner dashboard hierarchy strictly verified: Cycle Overview is primary, Affinity is secondary.\n")

console.log("=== ALL PHASE 23 QA CHECKS PASSED SUCCESSFULLY ===")
