import * as React from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { CycleRecord, FlowLevel } from "@/app/actions/cycles"
import { Calendar, Clock, ChevronRight, Droplet } from "lucide-react"
import { cn } from "@/lib/utils"

interface CycleCardProps {
  cycle: CycleRecord
  isCurrent?: boolean
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

function getFlowColorClass(flow: FlowLevel): string {
  switch (flow) {
    case "light":
      return "bg-pink-accent text-pink-accent-foreground border-pink-accent-border"
    case "heavy":
      return "bg-primary text-primary-foreground border-primary"
    case "medium":
    default:
      return "bg-lavender text-primary border-lavender-border"
  }
}

export function CycleCard({ cycle, isCurrent }: CycleCardProps) {
  const isOngoing = !cycle.cycle_end_date

  const dateRangeDisplay = isOngoing
    ? `${formatDate(cycle.start_date)} (Ongoing)`
    : `${formatDate(cycle.start_date)} – ${formatDate(cycle.cycle_end_date!)}`

  return (
    <Link href={`/cycles/${cycle.id}`} className="group block select-none">
      <Card interactive>
        <CardContent className="p-5 space-y-3">
          {/* Header Row */}
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-base text-foreground group-hover:text-primary transition-colors">
                  {dateRangeDisplay}
                </span>
                {isCurrent && (
                  <Badge variant="lavender" className="text-[11px] font-medium px-2 py-0.5">
                    Current Cycle
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Calendar className="size-3.5" />
                <span>Started on {formatDate(cycle.start_date)}</span>
              </p>
            </div>

            <div className="size-8 flex items-center justify-center rounded-lg bg-secondary text-muted-foreground group-hover:text-primary group-hover:bg-lavender transition-colors shrink-0">
              <ChevronRight className="size-4 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>

          {/* Badges / Metrics Row */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            {cycle.period_duration ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-lavender text-primary font-medium border border-lavender-border/50">
                <Droplet className="size-3" />
                {cycle.period_duration}-day period
              </span>
            ) : isOngoing ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-lavender/60 text-primary font-medium">
                <Droplet className="size-3" />
                Period ongoing
              </span>
            ) : null}

            {cycle.cycle_length ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-secondary text-foreground/80 font-medium border border-border/50">
                <Clock className="size-3 text-muted-foreground" />
                {cycle.cycle_length}-day cycle
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-secondary/60 text-muted-foreground text-[11px]">
                First recorded cycle
              </span>
            )}
          </div>

          {/* Flow dots visualization if period days exist */}
          {cycle.period_days && cycle.period_days.length > 0 && (
            <div className="pt-1 flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-muted-foreground mr-1">Period flow:</span>
              {cycle.period_days.slice(0, 10).map((day, idx) => (
                <div
                  key={day.id || idx}
                  title={`Day ${idx + 1}: ${day.flow}`}
                  className={cn(
                    "size-2.5 rounded-full border transition-transform hover:scale-125",
                    getFlowColorClass(day.flow)
                  )}
                />
              ))}
              {cycle.period_days.length > 10 && (
                <span className="text-[10px] text-muted-foreground">
                  +{cycle.period_days.length - 10}
                </span>
              )}
            </div>
          )}

          {/* Notes snippet */}
          {cycle.notes && (
            <p className="text-xs text-muted-foreground line-clamp-1 italic bg-secondary/30 p-2 rounded-lg border border-border/40">
              &ldquo;{cycle.notes}&rdquo;
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
