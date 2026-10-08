"use client"

import * as React from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { DatePicker } from "@/components/ui/date-picker"
import {
  createSymptomAction,
  updateSymptomAction,
  type SymptomRecord,
  type SymptomActionResult,
} from "@/app/actions/symptoms"
import {
  getSymptomValues,
  SYMPTOM_OPTIONS,
  SEVERITY_OPTIONS,
  getSeverityLabel,
} from "@/lib/symptoms/constants"
import { getTodayDateString } from "@/lib/calculations/cycle-calculations"
import { Activity, AlertCircle, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface SymptomLogDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  symptomToEdit?: SymptomRecord | null
  defaultDate?: string // YYYY-MM-DD, e.g. from calendar selection
  onSuccess?: () => void
}

interface SymptomLogFormProps {
  symptomToEdit?: SymptomRecord | null
  defaultDate?: string
  onClose: () => void
  onSuccess?: () => void
}

const severityStyles: Record<string, { active: string; ring: string }> = {
  mild: {
    active: "bg-secondary border-border text-foreground shadow-xs",
    ring: "ring-2 ring-border/60",
  },
  moderate: {
    active: "bg-lavender border-lavender-border/70 text-lavender-foreground shadow-xs",
    ring: "ring-2 ring-lavender-border",
  },
  severe: {
    active: "bg-pink-accent border-pink-accent-border/70 text-pink-accent-foreground shadow-xs",
    ring: "ring-2 ring-pink-accent-border",
  },
}

function SymptomLogForm({ symptomToEdit, defaultDate, onClose, onSuccess }: SymptomLogFormProps) {
  const isEditing = Boolean(symptomToEdit)
  const todayStr = getTodayDateString()

  const [date, setDate] = React.useState(symptomToEdit?.date ?? defaultDate ?? todayStr)
  const [symptoms, setSymptoms] = React.useState<string[]>(symptomToEdit ? getSymptomValues(symptomToEdit) : [])
  const [severity, setSeverity] = React.useState(symptomToEdit?.severity ?? "")
  const [notes, setNotes] = React.useState(symptomToEdit?.notes ?? "")
  const [error, setError] = React.useState<string | null>(null)
  const [isPending, setIsPending] = React.useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)

    if (!date) { setError("Please select a date."); return }
    if (date > todayStr) { setError("You cannot log a symptom for a future date."); return }
    if (!symptoms.length) { setError("Please select a symptom."); return }
    if (!severity) { setError("Please select a severity level."); return }
    if (notes.length > 500) { setError("Notes must be 500 characters or fewer."); return }

    const formData = new FormData()
    formData.append("date", date)
    symptoms.forEach(value => formData.append("symptom", value))
    formData.append("severity", severity)
    if (notes.trim()) formData.append("notes", notes.trim())

    setIsPending(true)
    try {
      let result: SymptomActionResult
      if (isEditing && symptomToEdit) {
        result = await updateSymptomAction(symptomToEdit.id, null, formData)
      } else {
        result = await createSymptomAction(null, formData)
      }

      if (!result.success) {
        setError(result.error ?? "Failed to save. Please try again.")
      } else {
        onClose()
        onSuccess?.()
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.")
    } finally {
      setIsPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 pt-2">
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <AlertCircle className="size-4 shrink-0 mt-0.5" />
          <span className="leading-snug">{error}</span>
        </div>
      )}

      {/* Date */}
      <div className="space-y-1.5">
        <Label htmlFor="symptomDate">Date *</Label>
        <DatePicker
          id="symptomDate"
          value={date}
          onChange={setDate}
          maxDate={todayStr}
          placeholder="Select date"
          disabled={isPending}
        />
      </div>

      {/* Symptom selector */}
      <div className="space-y-2">
        <Label>Symptoms *</Label>
        <div
          role="group"
          aria-label="Select symptoms"
          className="grid grid-cols-2 gap-2"
        >
          {SYMPTOM_OPTIONS.map((opt) => {
            const isSelected = symptoms.includes(opt)
            return (
              <button
                key={opt}
                type="button"
                role="checkbox"
                aria-checked={isSelected}
                disabled={isPending}
                onClick={() => setSymptoms(previous => previous.includes(opt) ? previous.filter(value => value !== opt) : [...previous, opt])}
                className={cn(
                  "flex min-h-[44px] items-center justify-start px-3 py-2 rounded-xl border text-sm font-medium transition-all select-none text-left",
                  isSelected
                    ? "bg-primary/10 border-primary/40 text-primary ring-2 ring-primary/20"
                    : "bg-card border-border/70 text-foreground hover:border-primary/30 hover:bg-lavender/40",
                  "disabled:opacity-50 disabled:pointer-events-none"
                )}
              >
                {opt}
              </button>
            )
          })}
        </div>
      </div>

      {/* Severity selector */}
      <div className="space-y-2">
        <Label>Severity *</Label>
        <div
          role="radiogroup"
          aria-label="Select severity"
          className="grid grid-cols-3 gap-2"
        >
          {SEVERITY_OPTIONS.map((opt) => {
            const isSelected = severity === opt.value
            const styles = severityStyles[opt.value]
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-label={`Severity: ${opt.label} — ${opt.description}`}
                disabled={isPending}
                onClick={() => setSeverity(opt.value)}
                className={cn(
                  "flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-xl border text-sm font-semibold transition-all select-none",
                  isSelected
                    ? cn(styles.active, styles.ring)
                    : "bg-card border-border/70 text-muted-foreground hover:border-primary/30 hover:bg-lavender/30",
                  "disabled:opacity-50 disabled:pointer-events-none"
                )}
              >
                <span>{opt.label}</span>
                <span className={cn("text-[10px] font-normal leading-none", isSelected ? "opacity-80" : "text-muted-foreground")}>
                  {opt.description}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <Label htmlFor="symptomNotes">Notes (Optional)</Label>
        <textarea
          id="symptomNotes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Started in the evening, worse when sitting..."
          disabled={isPending}
          rows={3}
          maxLength={500}
          className="w-full rounded-xl border border-border/80 bg-card p-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/15 transition-all resize-none"
        />
        <p className="text-xs text-muted-foreground text-right">
          {notes.length}/500
        </p>
      </div>

      <DialogFooter className="pt-1">
        <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending || !symptoms.length || !severity || !date}>
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin mr-2" />
              Saving...
            </>
          ) : isEditing ? (
            "Save Changes"
          ) : (
            "Log Symptom"
          )}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function SymptomLogDialog({
  open,
  onOpenChange,
  symptomToEdit,
  defaultDate,
  onSuccess,
}: SymptomLogDialogProps) {
  const isEditing = Boolean(symptomToEdit)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-6 max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="size-5 text-primary" />
            <span>{isEditing ? "Edit Symptom" : "Log Symptom"}</span>
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update how you recorded this symptom."
              : "Record how you are feeling. This is personal to you only."}
          </DialogDescription>
        </DialogHeader>

        {open && (
          <SymptomLogForm
            key={symptomToEdit?.id ?? `new-${defaultDate ?? "today"}`}
            symptomToEdit={symptomToEdit}
            defaultDate={defaultDate}
            onClose={() => onOpenChange(false)}
            onSuccess={onSuccess}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

// Re-export getSeverityLabel for use in sibling components
export { getSeverityLabel }
