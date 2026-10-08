"use client"

import * as React from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import type { LatestPeriodInfo, EstimatedNextPeriod } from "@/lib/calculations/cycle-calculations"
import type { CycleRecord } from "@/app/actions/cycles"
import { Button } from "@/components/ui/button"
import { PeriodLogDialog } from "@/components/cycles/period-log-dialog"
import { useAppRouter } from "@/components/navigation/use-app-router"
import { Droplet, Calendar, Clock, ArrowRight } from "lucide-react"

interface PeriodInsightsProps {
  latestPeriod: LatestPeriodInfo | null
  periodCycle: CycleRecord | null
  estimatedNextPeriod: EstimatedNextPeriod | null
  onboardingStartDate?: string | null
}

function formatDate(dateStr: string, includeYear: boolean = true): string {
  if (!dateStr) return ""
  const [y, m, d] = dateStr.split("-").map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(includeYear ? { year: "numeric" } : {}),
  })
}

export function PeriodInsights({
  latestPeriod,
  periodCycle,
  estimatedNextPeriod,
  onboardingStartDate,
}: PeriodInsightsProps) {
  const [editOpen, setEditOpen] = React.useState(false)
  const router = useAppRouter()
  return (
    <div className="rounded-2xl border border-border/80 dark:border-border/60 bg-card p-4 sm:p-5 shadow-redi-card">
      <div className="grid grid-cols-2 gap-3 sm:gap-6 divide-x divide-border/60">
        {/* 1. Last Period (Left Column) */}
        <div className="pr-3 sm:pr-6 flex flex-col justify-between space-y-3">
          <div className="flex items-start sm:items-center justify-between gap-1.5 flex-wrap">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="flex size-7 sm:size-8 items-center justify-center rounded-lg sm:rounded-xl bg-lavender text-primary border border-lavender-border/60 shrink-0">
                <Droplet className="size-3.5 sm:size-4 fill-current" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-semibold text-foreground leading-tight">
                  Last Period
                </h3>
                <p className="text-[10px] sm:text-xs text-muted-foreground hidden sm:block">
                  Recorded flow
                </p>
              </div>
            </div>

            {latestPeriod && (
              <Badge
                variant="lavender"
                className="text-[10px] sm:text-[11px] font-normal px-1.5 sm:px-2 py-0 h-4 sm:h-5"
              >
                {latestPeriod.isOngoing ? "Ongoing" : "Completed"}
              </Badge>
            )}
          </div>

          {latestPeriod ? (
            <div className="space-y-1.5">
              <div className="text-sm sm:text-base md:text-lg font-semibold text-foreground leading-snug break-words">
                {latestPeriod.endDate
                  ? `${formatDate(latestPeriod.startDate, false)} – ${formatDate(latestPeriod.endDate)}`
                  : `${formatDate(latestPeriod.startDate)} (Ongoing)`}
              </div>

              <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-muted-foreground">
                {latestPeriod.duration ? (
                  <span className="inline-flex items-center gap-1 font-medium text-primary">
                    <Droplet className="size-3 fill-current" />
                    <span>{latestPeriod.duration} days</span>
                  </span>
                ) : (
                  <span>{latestPeriod.periodDaysCount} days logged</span>
                )}
              </div>

              <div className="pt-0.5">
                <div className="flex items-center gap-3 flex-wrap">
                  {periodCycle && (
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditOpen(true)} className="h-8 px-2.5 text-xs">
                      {latestPeriod.isOngoing ? "End Period" : "Edit Period"}
                    </Button>
                  )}
                  <Link
                    href={`/cycles/${latestPeriod.cycleId}`}
                    className="inline-flex items-center gap-1 text-[11px] sm:text-xs font-medium text-primary hover:underline group"
                  >
                    <span>View cycle</span>
                    <ArrowRight className="size-3 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-xs sm:text-sm font-medium text-foreground">No period logged</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground leading-relaxed">
                {onboardingStartDate
                  ? `Started ${formatDate(onboardingStartDate)}`
                  : "Log period days to track duration."}
              </p>
            </div>
          )}
        </div>

        {/* 2. Next Expected Period (Right Column) */}
        <div className="pl-3 sm:pl-6 flex flex-col justify-between space-y-3">
          <div className="flex items-start sm:items-center justify-between gap-1.5 flex-wrap">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="flex size-7 sm:size-8 items-center justify-center rounded-lg sm:rounded-xl bg-lavender text-primary border border-lavender-border/60 shrink-0">
                <Calendar className="size-3.5 sm:size-4" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-semibold text-foreground leading-tight">
                  Next expected period
                </h3>
                <p className="text-[10px] sm:text-xs text-muted-foreground hidden sm:block">
                  Estimated date
                </p>
              </div>
            </div>

            <Badge
              variant="outline"
              className="text-[10px] sm:text-[11px] font-normal text-muted-foreground px-1.5 sm:px-2 py-0 h-4 sm:h-5"
            >
              Estimate
            </Badge>
          </div>

          {estimatedNextPeriod ? (
            <div className="space-y-1.5">
              <div className="text-sm sm:text-base md:text-lg font-semibold text-foreground leading-snug">
                {estimatedNextPeriod.windowStartDate && estimatedNextPeriod.windowEndDate ? `${formatDate(estimatedNextPeriod.windowStartDate, false)} – ${formatDate(estimatedNextPeriod.windowEndDate)}` : formatDate(estimatedNextPeriod.estimatedStartDate)}
              </div>

              <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-muted-foreground">
                <Clock className="size-3 text-muted-foreground/70 shrink-0" />
                <span>
                  {estimatedNextPeriod.daysUntil > 0
                    ? `In ~${estimatedNextPeriod.daysUntil} days`
                    : estimatedNextPeriod.daysUntil === 0
                    ? "Expected today"
                    : `~${Math.abs(estimatedNextPeriod.daysUntil)} days ago`}
                </span>
              </div>

              <p className="text-[10px] sm:text-[11px] text-muted-foreground/80 leading-tight pt-0.5">
                {estimatedNextPeriod.isFallback
                  ? `Based on typical ${estimatedNextPeriod.cycleLengthUsed}d cycle`
                  : `Based on historical ${estimatedNextPeriod.cycleLengthUsed}d cycle`}. Dates are estimates, not deadlines.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-xs sm:text-sm font-medium text-foreground">Keep tracking</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground leading-relaxed">
                Calculates as you log cycle starts.
              </p>
            </div>
          )}
        </div>
      </div>
      <PeriodLogDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        cycleToEdit={periodCycle}
        onSuccess={() => router.refresh()}
      />
    </div>
  )
}
