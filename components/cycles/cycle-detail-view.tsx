"use client"

import * as React from "react"
import Link from "next/link"
import { useAppRouter } from "@/components/navigation/use-app-router"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { PeriodLogDialog } from "@/components/cycles/period-log-dialog"
import { DeleteCycleDialog } from "@/components/cycles/delete-cycle-dialog"
import {
  type CycleRecord,
  type FlowLevel,
  updatePeriodDayFlowAction,
} from "@/app/actions/cycles"
import {
  ArrowLeft,
  Calendar,
  Clock,
  Droplet,
  Edit2,
  Trash2,
  FileText,
  Loader2,
  Sparkles,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface CycleDetailViewProps {
  cycle: CycleRecord
}

function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return ""
  const [y, m, d] = dateStr.split("-").map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function formatShortDate(dateStr: string): string {
  if (!dateStr) return ""
  const [y, m, d] = dateStr.split("-").map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function CycleDetailView({ cycle }: CycleDetailViewProps) {
  const router = useAppRouter()
  const [editOpen, setEditOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [updatingDayId, setUpdatingDayId] = React.useState<string | null>(null)

  const isOngoing = !cycle.cycle_end_date
  const periodDays = cycle.period_days || []

  const handleFlowChange = async (dayId: string, newFlow: FlowLevel) => {
    setUpdatingDayId(dayId)
    try {
      await updatePeriodDayFlowAction(dayId, cycle.id, newFlow)
      router.refresh()
    } catch (err) {
      console.error("Failed to update flow:", err)
    } finally {
      setUpdatingDayId(null)
    }
  }

  const handleDeleted = () => {
    router.push("/cycles")
    router.refresh()
  }

  return (
    <div className="space-y-6">
      {/* Back Link & Quick Actions */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Link
          href="/cycles"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors p-1 -ml-1 rounded-lg"
        >
          <ArrowLeft className="size-4" />
          <span>Back to Cycles</span>
        </Link>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditOpen(true)}
            className="gap-1.5"
          >
            <Edit2 className="size-3.5" />
            <span>Edit</span>
          </Button>

          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteOpen(true)}
            className="gap-1.5"
          >
            <Trash2 className="size-3.5" />
            <span>Delete</span>
          </Button>
        </div>
      </div>

      {/* Cycle Header Card */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Badge variant="lavender" className="gap-1 text-xs">
            <Sparkles className="size-3" />
            {isOngoing ? "Ongoing Cycle" : "Completed Cycle"}
          </Badge>
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
          {isOngoing
            ? `Cycle started ${formatShortDate(cycle.start_date)}`
            : `${formatShortDate(cycle.start_date)} – ${formatShortDate(cycle.cycle_end_date!)}`}
        </h1>
        <p className="text-sm text-muted-foreground">
          Detailed breakdown of your period days, duration, and flow intensity.
        </p>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Period Duration */}
        <Card size="sm">
          <CardContent className="p-0 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-lavender text-primary shrink-0">
              <Droplet className="size-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Period Duration</p>
              <p className="text-base font-semibold text-foreground">
                {cycle.period_duration ? `${cycle.period_duration} days` : "Ongoing"}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Cycle Length */}
        <Card size="sm">
          <CardContent className="p-0 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-lavender text-primary shrink-0">
              <Clock className="size-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Cycle Length</p>
              <p className="text-base font-semibold text-foreground">
                {cycle.cycle_length ? `${cycle.cycle_length} days (recorded)` : "In progress"}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Logged Days */}
        <Card size="sm">
          <CardContent className="p-0 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-lavender text-primary shrink-0">
              <Calendar className="size-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Recorded Days</p>
              <p className="text-base font-semibold text-foreground">
                {periodDays.length} {periodDays.length === 1 ? "day" : "days"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Period Days Tracking Section */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base sm:text-lg">Period Days & Flow</CardTitle>
              <CardDescription>
                Customize flow intensity for each day of this period
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {periodDays.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground space-y-3">
              <p>No period days recorded for this cycle yet.</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditOpen(true)}
                className="text-xs gap-1.5"
              >
                <Edit2 className="size-3.5" />
                <span>Log Period Days</span>
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {periodDays.map((day, index) => {
                const isUpdating = updatingDayId === day.id

                return (
                  <div
                    key={day.id}
                    className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex size-7 items-center justify-center rounded-lg bg-secondary text-xs font-semibold text-foreground shrink-0">
                        {index + 1}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {formatDateDisplay(day.date)}
                        </p>
                        <p className="text-xs text-muted-foreground capitalize">
                          Flow: {day.flow}
                        </p>
                      </div>
                    </div>

                    {/* Flow Selection Pills */}
                    <div className="flex items-center gap-1.5 self-end sm:self-auto">
                      {(["light", "medium", "heavy"] as FlowLevel[]).map((flowOption) => {
                        const isSelected = day.flow === flowOption

                        return (
                          <button
                            key={flowOption}
                            type="button"
                            disabled={isUpdating}
                            onClick={() => handleFlowChange(day.id, flowOption)}
                            className={cn(
                              "px-3 py-1 rounded-lg text-xs font-medium capitalize transition-all select-none cursor-pointer",
                              isSelected
                                ? flowOption === "heavy"
                                  ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                                  : flowOption === "medium"
                                  ? "bg-lavender text-primary border border-lavender-border font-semibold shadow-xs"
                                  : "bg-pink-accent text-pink-accent-foreground border border-pink-accent-border font-semibold shadow-xs"
                                : "bg-secondary/70 text-muted-foreground hover:bg-secondary hover:text-foreground border border-transparent",
                              isUpdating && "opacity-50 pointer-events-none"
                            )}
                          >
                            {isUpdating && isSelected ? (
                              <Loader2 className="size-3 animate-spin inline mr-1" />
                            ) : null}
                            {flowOption}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cycle Notes Card */}
      {cycle.notes && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <FileText className="size-4 text-primary" />
              <span>Cycle Notes</span>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">
              {cycle.notes}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Edit Cycle Dialog */}
      <PeriodLogDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        cycleToEdit={cycle}
        onSuccess={() => router.refresh()}
      />

      {/* Delete Cycle Confirmation Dialog */}
      <DeleteCycleDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        cycleId={cycle.id}
        onDeleted={handleDeleted}
      />
    </div>
  )
}
