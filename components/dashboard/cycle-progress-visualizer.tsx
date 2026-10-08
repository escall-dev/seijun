import * as React from "react"
import { cn } from "@/lib/utils"
import { Sparkles } from "lucide-react"

interface CycleProgressVisualizerProps {
  currentDay: number
  expectedTotalDays: number
  expectedNoLaterThanDate?: string | null
  periodDaysCount?: number
  isOnPeriod?: boolean
  className?: string
}

function formatDisplayDate(dateStr?: string | null): string | null {
  if (!dateStr) return null
  const [y, m, d] = dateStr.split("-").map(Number)
  if (!y || !m || !d) return null
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

export function CycleProgressVisualizer({
  currentDay,
  expectedTotalDays,
  expectedNoLaterThanDate,
  periodDaysCount = 0,
  isOnPeriod = false,
  className,
}: CycleProgressVisualizerProps) {
  const day = Math.max(1, currentDay)
  const isExtended = day > expectedTotalDays
  const percentage = Math.min(100, Math.round((day / expectedTotalDays) * 100))
  const formattedNoLaterThan = formatDisplayDate(expectedNoLaterThanDate)

  return (
    <div
      className={cn("space-y-3.5 text-sm w-full max-w-md mx-auto", className)}
      aria-label={`Cycle progress: Day ${day}, expected length ${expectedTotalDays} days`}
    >
      {/* Visual Progress Bar */}
      <div className="space-y-1.5">
        <div className="relative h-2.5 w-full bg-secondary/80 dark:bg-secondary/40 rounded-full overflow-hidden p-0.5 border border-border/40">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              isExtended
                ? "bg-gradient-to-r from-primary to-lavender-foreground animate-pulse"
                : "bg-primary"
            )}
            style={{ width: `${percentage}%` }}
            role="progressbar"
            aria-valuenow={day}
            aria-valuemin={1}
            aria-valuemax={expectedTotalDays}
          />
        </div>

        {/* Milestone Labels */}
        <div className="flex justify-between items-center text-[11px] text-muted-foreground select-none font-medium px-0.5">
          <span>Day 1 (start)</span>
          {isExtended ? (
            <span className="inline-flex items-center gap-1 text-primary font-semibold">
              <Sparkles className="size-3" />
              <span>Extended (+{day - expectedTotalDays}d)</span>
            </span>
          ) : (
            <span>Expected ~{expectedTotalDays}d</span>
          )}
        </div>
      </div>

      {/* Structured Prediction & Observation Information */}
      <div className="grid grid-cols-2 gap-2 text-left pt-1">
        <div className="p-2.5 rounded-xl bg-background/60 dark:bg-card/40 border border-border/50">
          <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
            Expected Cycle
          </p>
          <p className="text-xs sm:text-sm font-bold text-foreground mt-0.5">
            {expectedTotalDays} days
          </p>
          <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
            Historical expectation
          </p>
        </div>

        <div className="p-2.5 rounded-xl bg-background/60 dark:bg-card/40 border border-border/50">
          <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
            Expected No Later Than
          </p>
          <p className="text-xs sm:text-sm font-bold text-foreground mt-0.5">
            {formattedNoLaterThan || `~Day ${expectedTotalDays}`}
          </p>
          <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
            Calculated prediction
          </p>
        </div>
      </div>

      {/* Disclaimers & Tracking State */}
      <p className="text-[11px] text-muted-foreground leading-relaxed text-center px-2">
        {periodDaysCount > 0 ? `${periodDaysCount} period days logged. ` : ""}
        Cycle ends when your next period starts.
      </p>
    </div>
  )
}
