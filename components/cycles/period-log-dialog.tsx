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
import { calculateInclusiveDays, getTodayDateString } from "@/lib/calculations/cycle-calculations"
import {
  createCycleAction,
  updateCycleAction,
  type CycleRecord,
} from "@/app/actions/cycles"
import { Calendar, Clock, AlertCircle, Loader2 } from "lucide-react"

interface PeriodLogDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  cycleToEdit?: CycleRecord | null
  onSuccess?: (cycleId?: string) => void
}

interface PeriodLogFormProps {
  cycleToEdit?: CycleRecord | null
  onClose: () => void
  onSuccess?: (cycleId?: string) => void
}

function PeriodLogForm({ cycleToEdit, onClose, onSuccess }: PeriodLogFormProps) {
  const isEditing = Boolean(cycleToEdit)
  const todayStr = getTodayDateString()

  const [startDate, setStartDate] = React.useState(
    cycleToEdit?.start_date || todayStr
  )
  const [endDate, setEndDate] = React.useState(cycleToEdit?.end_date || "")
  const [notes, setNotes] = React.useState(cycleToEdit?.notes || "")
  const [error, setError] = React.useState<string | null>(null)
  const [isPending, setIsPending] = React.useState(false)

  // Real-time period duration calculation (only when end is filled)
  let calculatedDuration: number | null = null
  if (startDate && endDate && endDate >= startDate) {
    calculatedDuration = calculateInclusiveDays(startDate, endDate)
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)

    if (!startDate) {
      setError("Please select a period start date.")
      return
    }

    if (startDate > todayStr) {
      setError("Period start date cannot be in the future.")
      return
    }

    if (endDate) {
      if (endDate > todayStr) {
        setError("Period end date cannot be in the future.")
        return
      }
      if (endDate < startDate) {
        setError("Period end date cannot be before the start date.")
        return
      }
    }

    const formData = new FormData()
    formData.append("startDate", startDate)
    if (endDate) {
      formData.append("endDate", endDate)
    }
    if (notes.trim()) {
      formData.append("notes", notes.trim())
    }

    setIsPending(true)
    try {
      let result
      if (isEditing && cycleToEdit) {
        result = await updateCycleAction(cycleToEdit.id, null, formData)
      } else {
        result = await createCycleAction(null, formData)
      }

      if (!result.success) {
        setError(result.error || "Failed to save cycle. Please check your dates.")
      } else {
        onClose()
        onSuccess?.(result.cycleId)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.")
    } finally {
      setIsPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
      {/* Error message */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <AlertCircle className="size-4 shrink-0 mt-0.5" />
          <span className="leading-snug">{error}</span>
        </div>
      )}

      {/* Start Date */}
      <div className="space-y-1.5">
        <Label htmlFor="periodStartDate">Period Start Date *</Label>
        <DatePicker
          id="periodStartDate"
          value={startDate}
          onChange={setStartDate}
          maxDate={todayStr}
          placeholder="Select start date"
          disabled={isPending}
        />
        <p className="text-xs text-muted-foreground">
          First day of bleeding for this cycle.
        </p>
      </div>

      {/* End Date — always shown, optional */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="periodEndDate">Period End Date</Label>
          {endDate && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setEndDate("")} disabled={isPending} className="h-7 px-2 text-xs">
              Clear end date
            </Button>
          )}
        </div>
        <DatePicker
          id="periodEndDate"
          value={endDate}
          onChange={setEndDate}
          maxDate={todayStr}
          placeholder="End date (leave blank if in progress)"
          disabled={isPending}
        />
        <p className="text-xs text-muted-foreground">
          {endDate ? "Last day of bleeding for this cycle." : "Leave blank if your period is still in progress."}
        </p>
      </div>

      {/* Duration Preview */}
      {calculatedDuration !== null && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-lavender text-primary text-xs font-medium border border-lavender-border/60">
          <Clock className="size-3.5" />
          <span>Calculated Period Duration: {calculatedDuration} days</span>
        </div>
      )}

      {/* Notes */}
      <div className="space-y-1.5">
        <Label htmlFor="cycleNotes">Notes (Optional)</Label>
        <textarea
          id="cycleNotes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Started in the morning, heavier on day 2..."
          disabled={isPending}
          rows={3}
          className="w-full rounded-xl border border-border/80 bg-card p-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/15 transition-all resize-none"
        />
      </div>

      <DialogFooter className="pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin mr-2" />
              Saving...
            </>
          ) : isEditing ? (
            "Save Changes"
          ) : (
            "Save Period"
          )}
        </Button>
      </DialogFooter>
    </form>
  )
}


export function PeriodLogDialog({
  open,
  onOpenChange,
  cycleToEdit,
  onSuccess,
}: PeriodLogDialogProps) {
  const isEditing = Boolean(cycleToEdit)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="size-5 text-primary" />
            <span>{isEditing ? "Edit Period" : "Log Period"}</span>
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the actual period start and end dates. Leave the end date empty while in progress."
              : "Record your period start and end dates to track your cycle pattern."}
          </DialogDescription>
        </DialogHeader>

        {open && (
          <PeriodLogForm
            key={cycleToEdit?.id || "new-log"}
            cycleToEdit={cycleToEdit}
            onClose={() => onOpenChange(false)}
            onSuccess={onSuccess}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
