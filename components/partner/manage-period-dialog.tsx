"use client"

import * as React from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { recordPartnerPeriodAction, updatePartnerPeriodAction } from "@/app/actions/partner-mutations"
import { calculateInclusiveDays, calculatePeriodRecordStatus, getTodayDateString } from "@/lib/calculations/cycle-calculations"
import { AlertCircle, Check, Loader2 } from "lucide-react"

export interface ManagePeriodDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  partnerDisplayName?: string
  cycleId?: string | null
  initialStartDate?: string | null
  initialEndDate?: string | null
  onSuccess?: () => void
}

/**
 * Seijun Phase 19.1: Partner Period Management Dialog
 *
 * Dedicated modal for supporters with `manage_period_status = true` to log
 * and update period entries for the connected Cycle Owner.
 * Targets the partner's cycle via `recordPartnerPeriodAction()`.
 * Never modifies the supporter's personal cycle records.
 */
interface ManagePeriodFormProps {
  partnerDisplayName?: string
  cycleId?: string | null
  initialStartDate?: string | null
  initialEndDate?: string | null
  onClose: () => void
  onSuccess?: () => void
}

function ManagePeriodForm({
  partnerDisplayName,
  cycleId,
  initialStartDate,
  initialEndDate,
  onClose,
  onSuccess,
}: ManagePeriodFormProps) {
  void partnerDisplayName
  const todayStr = getTodayDateString()
  const [startDate, setStartDate] = React.useState(initialStartDate || todayStr)
  const [endDate, setEndDate] = React.useState(initialEndDate || "")
  const [submitting, setSubmitting] = React.useState(false)
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState(false)

  const isInvalidRange = Boolean(startDate && endDate && endDate < startDate)
  const periodStatus = calculatePeriodRecordStatus(startDate, endDate || null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isInvalidRange) {
      setErrorMsg("Period end date cannot be earlier than start date.")
      return
    }

    setSubmitting(true)
    setErrorMsg(null)
    setSuccess(false)

    try {
      const res = cycleId
        ? await updatePartnerPeriodAction({ cycleId, startDate, endDate: endDate || null })
        : await recordPartnerPeriodAction({ startDate, endDate: endDate || null })

      if (res.ok) {
        setSuccess(true)
        setTimeout(() => {
          onClose()
          onSuccess?.()
          setSuccess(false)
        }, 800)
      } else {
        setErrorMsg(res.error || "Failed to log period.")
      }
    } catch {
      setErrorMsg("Network error saving period record.")
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="flex items-center justify-center py-6 gap-2 text-emerald-600 dark:text-emerald-400 font-medium text-sm">
        <Check className="size-4" />
        <span>Period recorded successfully!</span>
      </div>
    )
  }

  return (
    <>
      {errorMsg && (
        <div className="flex items-start gap-2 p-2.5 rounded-xl bg-destructive/10 text-destructive text-xs">
          <AlertCircle className="size-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3.5 pt-2">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Period Start Date</Label>
          <Input
            type="date"
            max={todayStr}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
            className="h-10 text-xs rounded-xl"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs font-medium">Period End Date</Label>
            {endDate && <Button type="button" variant="ghost" size="sm" onClick={() => setEndDate("")} disabled={submitting} className="h-7 px-2 text-[10px]">Clear date</Button>}
          </div>
          <Input
            type="date"
            max={todayStr}
            min={startDate}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="h-10 text-xs rounded-xl"
          />
          <p className="text-[10px] text-muted-foreground">
            {isInvalidRange ? (
              <span className="text-destructive font-medium">Period end date cannot be earlier than start date.</span>
            ) : periodStatus === "Done" ? (
              `Done · ${calculateInclusiveDays(startDate, endDate)} ${calculateInclusiveDays(startDate, endDate) === 1 ? "day" : "days"}`
            ) : (
              "In Progress · leave empty until the actual last day."
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={onClose}
            className="flex-1 h-10 rounded-xl text-xs cursor-pointer"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={submitting || !startDate || isInvalidRange}
            className="flex-1 h-10 rounded-xl text-xs font-semibold cursor-pointer gap-1.5 bg-rose-600 hover:bg-rose-700 text-white"
          >
            {submitting ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <span>{cycleId ? "Save Changes" : "Record Period"}</span>
            )}
          </Button>
        </div>
      </form>
    </>
  )
}

export function ManagePeriodDialog({
  open,
  onOpenChange,
  partnerDisplayName,
  cycleId,
  initialStartDate,
  initialEndDate,
  onSuccess,
}: ManagePeriodDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-3xl p-6">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-base font-semibold">
            {cycleId ? "Edit Partner Period" : "Manage Partner Period"}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Edit the actual start and end dates for {partnerDisplayName || "partner"}. Status is In Progress when active, Done when completed.
          </DialogDescription>
        </DialogHeader>

        {open && (
          <ManagePeriodForm
            key={cycleId ? `edit-${cycleId}-${initialStartDate}-${initialEndDate}` : "new-period"}
            partnerDisplayName={partnerDisplayName}
            cycleId={cycleId}
            initialStartDate={initialStartDate}
            initialEndDate={initialEndDate}
            onClose={() => onOpenChange(false)}
            onSuccess={onSuccess}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
