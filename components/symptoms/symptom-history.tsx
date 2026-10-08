"use client"

import { getSymptomValues } from "@/lib/symptoms/constants"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { SymptomLogDialog } from "@/components/symptoms/symptom-log-dialog"
import { SymptomDeleteDialog } from "@/components/symptoms/symptom-delete-dialog"
import type { SymptomRecord } from "@/app/actions/symptoms"
import { getSeverityLabel } from "@/lib/symptoms/constants"
import { Activity, Plus, Pencil, Trash2, Stethoscope } from "lucide-react"

interface SymptomHistoryProps {
  symptoms: SymptomRecord[]
}

/** Format YYYY-MM-DD to "September 15, 2026" */
function formatDateHeading(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number)
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}

type SeverityBadgeVariant = "secondary" | "lavender" | "pink"

function severityBadgeVariant(severity: string): SeverityBadgeVariant {
  if (severity === "moderate") return "lavender"
  if (severity === "severe") return "pink"
  return "secondary"
}

function groupByDate(symptoms: SymptomRecord[]): [string, SymptomRecord[]][] {
  const map = new Map<string, SymptomRecord[]>()
  for (const s of symptoms) {
    const existing = map.get(s.date) ?? []
    existing.push(s)
    map.set(s.date, existing)
  }
  // Already ordered desc from server; maintain that order
  return Array.from(map.entries())
}

export function SymptomHistory({ symptoms }: SymptomHistoryProps) {
  const router = useRouter()
  const [logOpen, setLogOpen] = React.useState(false)
  const [editTarget, setEditTarget] = React.useState<SymptomRecord | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<SymptomRecord | null>(null)

  const dateGroups = groupByDate(symptoms)

  const handleSuccess = () => {
    router.refresh()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="lavender" className="gap-1 font-normal text-xs">
              <Activity className="size-3" />
              Symptoms
            </Badge>
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
            Symptom History
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Record and review how you have been feeling over time.
          </p>
        </div>

        <Button
          onClick={() => { setEditTarget(null); setLogOpen(true) }}
          className="gap-2 shadow-xs shrink-0 self-start sm:self-auto"
        >
          <Plus className="size-4" />
          <span>Log Symptom</span>
        </Button>
      </div>

      {/* Empty state */}
      {symptoms.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center p-8 sm:p-12 rounded-2xl border border-dashed border-border bg-card/50 space-y-4">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-lavender text-primary border border-lavender-border/60">
            <Stethoscope className="size-7" />
          </div>
          <div className="space-y-1.5">
            <p className="text-base font-semibold text-foreground">No symptoms logged yet</p>
            <p className="text-sm text-muted-foreground max-w-xs">
              You can record how you are feeling whenever you would like. Your observations are private and personal to you.
            </p>
          </div>
          <Button
            onClick={() => { setEditTarget(null); setLogOpen(true) }}
            variant="soft"
            className="gap-2"
          >
            <Plus className="size-4" />
            Log Your First Symptom
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {dateGroups.map(([dateStr, daySymptoms]) => (
            <div key={dateStr} className="space-y-2">
              {/* Date heading */}
              <h2 className="text-sm font-semibold text-muted-foreground px-0.5">
                {formatDateHeading(dateStr)}
              </h2>

              {/* Symptom rows card */}
              <div className="rounded-2xl border border-border/80 dark:border-border/60 bg-card overflow-hidden shadow-redi-card divide-y divide-border/50">
                {daySymptoms.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 px-4 py-3.5"
                  >
                    {/* Icon */}
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-lavender text-primary border border-lavender-border/60">
                      <Activity className="size-4" />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{getSymptomValues(s).join(", ")}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Badge
                          variant={severityBadgeVariant(s.severity)}
                          size="sm"
                          aria-label={`Severity: ${getSeverityLabel(s.severity)}`}
                        >
                          {getSeverityLabel(s.severity)}
                        </Badge>
                        {s.notes && (
                          <span className="text-xs text-muted-foreground truncate max-w-[160px]">
                            {s.notes}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Edit ${getSymptomValues(s).join(", ")}`}
                        onClick={() => { setEditTarget(s); setLogOpen(true) }}
                        className="text-muted-foreground hover:text-primary"
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${getSymptomValues(s).join(", ")}`}
                        onClick={() => setDeleteTarget(s)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Log / Edit Dialog */}
      <SymptomLogDialog
        open={logOpen}
        onOpenChange={(open) => { setLogOpen(open); if (!open) setEditTarget(null) }}
        symptomToEdit={editTarget}
        onSuccess={handleSuccess}
      />

      {/* Delete Confirmation Dialog */}
      {deleteTarget && (
        <SymptomDeleteDialog
          open={Boolean(deleteTarget)}
          onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
          symptomId={deleteTarget.id}
          symptomName={getSymptomValues(deleteTarget).join(", ")}
          symptomSeverity={deleteTarget.severity}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  )
}
