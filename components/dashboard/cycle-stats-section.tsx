import * as React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Clock, Droplets, History } from "lucide-react"

interface CycleStatsSectionProps {
  averageCycleLength: number | null
  averagePeriodDuration: number | null
  cyclesCount: number
}

export function CycleStatsSection({
  averageCycleLength,
  averagePeriodDuration,
  cyclesCount,
}: CycleStatsSectionProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Cycle Statistics</h3>
        <span className="text-xs text-muted-foreground">{cyclesCount} recorded cycles</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        {/* 1. Average Cycle Length */}
        <Card size="sm">
          <CardContent className="p-0 space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="size-3.5 text-primary" />
              <span>Historical Cycle Estimate</span>
            </div>
            {averageCycleLength ? (
              <div>
                <div className="text-2xl font-bold tracking-tight text-foreground">
                  {averageCycleLength} <span className="text-xs font-normal text-muted-foreground">days</span>
                </div>
                <p className="text-[11px] text-muted-foreground pt-0.5">
                  Typical length from completed cycle intervals
                </p>
              </div>
            ) : (
              <div>
                <div className="text-2xl font-bold tracking-tight text-muted-foreground/60">—</div>
                <p className="text-[11px] text-muted-foreground pt-0.5">
                  Keep tracking to establish a historical estimate
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 2. Average Period Duration */}
        <Card size="sm">
          <CardContent className="p-0 space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Droplets className="size-3.5 text-primary" />
              <span>Avg Period Length</span>
            </div>
            {averagePeriodDuration ? (
              <div>
                <div className="text-2xl font-bold tracking-tight text-foreground">
                  {averagePeriodDuration} <span className="text-xs font-normal text-muted-foreground">days</span>
                </div>
                <p className="text-[11px] text-muted-foreground pt-0.5">
                  Calculated from completed periods
                </p>
              </div>
            ) : (
              <div>
                <div className="text-2xl font-bold tracking-tight text-muted-foreground/60">—</div>
                <p className="text-[11px] text-muted-foreground pt-0.5">
                  Log period days to calculate duration
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 3. Tracked Cycles Count */}
        <Card size="sm">
          <CardContent className="p-0 space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <History className="size-3.5 text-primary" />
              <span>Tracked Cycles</span>
            </div>
            <div>
              <div className="text-2xl font-bold tracking-tight text-foreground">
                {cyclesCount}
              </div>
              <p className="text-[11px] text-muted-foreground pt-0.5">
                {cyclesCount === 1 ? "1 cycle on record" : `${cyclesCount} cycles on record`}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
