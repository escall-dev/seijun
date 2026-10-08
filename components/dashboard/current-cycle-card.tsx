import * as React from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { CycleProgressVisualizer } from "@/components/dashboard/cycle-progress-visualizer"
import type { CycleRecord } from "@/app/actions/cycles"
import type { CurrentCycleStatus } from "@/lib/calculations/cycle-calculations"
import { Calendar, Droplets, Droplet, ArrowRight, Activity } from "lucide-react"

interface CurrentCycleCardProps {
  currentCycle: CycleRecord | null
  statusInfo: CurrentCycleStatus
  expectedCycleLength: number
  expectedNoLaterThanDate?: string | null
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ""
  const [y, m, d] = dateStr.split("-").map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function CurrentCycleCard({
  currentCycle,
  statusInfo,
  expectedCycleLength,
  expectedNoLaterThanDate,
}: CurrentCycleCardProps) {
  if (!currentCycle) {
    return (
      <section
        aria-label="Cycle Tracking Overview"
        className="relative w-full rounded-3xl overflow-hidden p-6 sm:p-8 bg-gradient-to-b from-lavender/35 via-secondary/20 to-transparent dark:from-lavender/10 dark:via-secondary/10 dark:to-transparent select-none transition-all"
      >
        {/* Subtle decorative atmosphere */}
        <div
          aria-hidden="true"
          className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-primary/5 dark:bg-primary/10 blur-2xl pointer-events-none -z-10"
        />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2 max-w-lg">
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="text-xs font-normal border-border/60 bg-background/50 backdrop-blur-xs"
              >
                Cycle Tracking
              </Badge>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              No active cycle
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Start tracking to follow your cycle progress, log period days, and view personal statistics.
            </p>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <Link
              href="/cycles"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-hover shadow-sm transition-all group"
            >
              <span>Go to Cycles</span>
              <ArrowRight className="size-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>
        </div>
      </section>
    )
  }

  const periodDaysCount = currentCycle.period_days?.length || 0
  const currentDay = statusInfo.currentDay ?? 1

  return (
    <section
      aria-label="Cycle Day Hero Overview"
      className="relative w-full rounded-3xl overflow-hidden sm:overflow-visible p-5 sm:p-7 md:p-8 transition-all select-none"
    >
      {/* 1. Atmospheric Ambient Background Layer (Layer 0) */}
      <div
        aria-hidden="true"
        className="absolute inset-0 rounded-3xl bg-gradient-to-b from-lavender/35 via-secondary/15 to-transparent dark:from-lavender/10 dark:via-secondary/10 dark:to-transparent -z-10 pointer-events-none"
      />
      <div
        aria-hidden="true"
        className="absolute -top-12 -right-8 w-64 h-64 sm:w-80 sm:h-80 rounded-full bg-primary/5 dark:bg-primary/10 blur-3xl -z-10 pointer-events-none"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-10 -left-6 w-56 h-56 rounded-full bg-lavender/40 dark:bg-lavender/10 blur-2xl -z-10 pointer-events-none"
      />

      {/* 2. Out-of-bounds Decorative Number Echo (Layer 0 / Breakout) */}
      <div
        aria-hidden="true"
        className="absolute -top-4 sm:-top-8 -right-2 sm:right-4 text-[7.5rem] sm:text-[10rem] md:text-[12rem] lg:text-[14rem] font-black text-primary/[0.04] dark:text-primary/[0.07] leading-none pointer-events-none select-none tracking-tighter -z-10 overflow-hidden"
      >
        {currentDay}
      </div>

      {/* 3. Top Meta Row (Layer 3 - z-30) */}
      <div className="flex items-center justify-between gap-3 relative z-30 mb-4 sm:mb-6">
        {/* Left: Status Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            variant={statusInfo.isOnPeriod ? "default" : "lavender"}
            className="gap-1.5 px-3 py-1 text-xs font-semibold shadow-xs"
          >
            {statusInfo.isOnPeriod ? (
              <>
                <Droplet className="size-3.5 fill-current text-primary-foreground animate-pulse" />
                <span>On Period</span>
              </>
            ) : (
              <>
                <Activity className="size-3.5" />
                <span>{statusInfo.displayStatus}</span>
              </>
            )}
          </Badge>

          <Badge
            variant="outline"
            className="text-[11px] font-medium text-muted-foreground border-border/60 bg-background/50 backdrop-blur-xs"
          >
            Current Cycle
          </Badge>
        </div>

        {/* Right: View cycle details link */}
        <Link
          href={`/cycles/${currentCycle.id}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary-hover transition-colors group px-2.5 py-1.5 rounded-full hover:bg-lavender/40 shrink-0"
          title="View cycle details"
        >
          <span>Cycle Details</span>
          <ArrowRight className="size-3.5 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>

      {/* 4. Hero Breakout Focal Area & Overlapping Layers (Layer 2 & Layer 1) */}
      <div className="relative flex flex-col items-center justify-center text-center">
        {/* Contextual Label */}
        <div className="relative z-20 flex items-center gap-2 mb-1.5">
          <span className="text-xs sm:text-sm font-bold uppercase tracking-widest text-primary/80 dark:text-primary/90">
            Cycle Day
          </span>
        </div>

        {/* Large Dynamic Breakout Numeral */}
        <div className="relative z-20 select-none my-1">
          <span className="text-7xl sm:text-8xl md:text-9xl font-black tracking-tighter leading-none text-foreground block drop-shadow-xs">
            {currentDay}
          </span>
        </div>

        {/* Recorded day is separate from historical estimates. */}
        <div className="relative z-20 text-xs sm:text-sm text-muted-foreground font-medium mb-2.5">
          Day {currentDay}
        </div>

        {/* Progress Line */}
        <div className="w-full relative z-10 pt-1">
          <CycleProgressVisualizer
            currentDay={currentDay}
            expectedTotalDays={expectedCycleLength}
            expectedNoLaterThanDate={expectedNoLaterThanDate}
            periodDaysCount={periodDaysCount}
            isOnPeriod={statusInfo.isOnPeriod}
          />
        </div>
      </div>

      {/* 5. Tertiary Supporting Information Row */}
      <div className="mt-5 flex items-center justify-between flex-wrap gap-2 pt-3 border-t border-border/30 text-xs text-muted-foreground">
        <p className="flex items-center gap-1.5">
          <Calendar className="size-3.5 text-muted-foreground/80" />
          <span>Cycle started {formatDate(currentCycle.start_date)}</span>
        </p>
        <p className="text-xs text-muted-foreground/80">
          Expected cycle length:{" "}
          <span className="font-semibold text-foreground">~{expectedCycleLength} days</span>
        </p>
      </div>

      {/* 6. Additional Status Notice if no period days logged */}
      {periodDaysCount === 0 && (
        <div className="mt-3 flex items-center gap-2.5 p-3 rounded-2xl bg-lavender/40 dark:bg-lavender/20 border border-lavender-border/50 text-xs text-muted-foreground">
          <Droplets className="size-4 text-primary shrink-0" />
          <span>
            Tracking started on {formatDate(currentCycle.start_date)}. You can log period days whenever you are ready.
          </span>
        </div>
      )}
    </section>
  )
}
