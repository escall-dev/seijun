"use client"

import * as React from "react"
import Link from "next/link"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DatePicker } from "@/components/ui/date-picker"
import { updateSettingsAction } from "@/app/actions/settings"
import { cn } from "@/lib/utils"
import {
  CalendarHeart,
  Sparkles,
  HeartHandshake,
  CheckCircle2,
  AlertCircle,
  Loader2,
  History,
  ChevronRight,
} from "lucide-react"

export interface CycleFormData {
  typicalCycleLength: number
  lastPeriodStart: string
  usageRole?: "cycle_tracker" | "supporter" | "both" | null
  displayName?: string
  avatarUrl?: string | null
  sex?: "male" | "female" | "prefer_not_to_say" | null
}

interface CycleSettingsFormProps {
  initialData: CycleFormData
}

export function CycleSettingsForm({ initialData }: CycleSettingsFormProps) {
  const [typicalCycleLength, setTypicalCycleLength] = React.useState<string>(
    initialData.typicalCycleLength ? String(initialData.typicalCycleLength) : "28"
  )
  const [lastPeriodStart, setLastPeriodStart] = React.useState<string>(
    initialData.lastPeriodStart || ""
  )

  const [isPending, setIsPending] = React.useState(false)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)

  const [modalNotif, setModalNotif] = React.useState<{
    title: string
    message: string
  } | null>(null)
  const [isModalExiting, setIsModalExiting] = React.useState(false)
  const modalTimerRef = React.useRef<NodeJS.Timeout | null>(null)
  const modalExitTimerRef = React.useRef<NodeJS.Timeout | null>(null)

  const showModalNotification = React.useCallback((title: string, message: string, durationMs: number = 1000) => {
    if (modalTimerRef.current) clearTimeout(modalTimerRef.current)
    if (modalExitTimerRef.current) clearTimeout(modalExitTimerRef.current)

    setErrorMessage(null)
    setIsModalExiting(false)
    setModalNotif({ title, message })

    modalTimerRef.current = setTimeout(() => {
      setIsModalExiting(true)
      modalExitTimerRef.current = setTimeout(() => {
        setModalNotif(null)
        setIsModalExiting(false)
      }, 150)
    }, durationMs)
  }, [])

  React.useEffect(() => {
    return () => {
      if (modalTimerRef.current) clearTimeout(modalTimerRef.current)
      if (modalExitTimerRef.current) clearTimeout(modalExitTimerRef.current)
    }
  }, [])

  const todayStr = React.useMemo(() => new Date().toISOString().split("T")[0], [])
  const isSupporter = initialData.usageRole === "supporter"

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setErrorMessage(null)

    // 1. Validate Cycle Length (21–45 days)
    let cycleLengthNum: number | null = null
    if (!isSupporter || typicalCycleLength.trim()) {
      if (!typicalCycleLength.trim() && !isSupporter) {
        setErrorMessage("Please enter your typical cycle length.")
        return
      }
      if (typicalCycleLength.trim()) {
        if (!/^\d+$/.test(typicalCycleLength.trim())) {
          setErrorMessage("Typical cycle length must be a whole number of days.")
          return
        }
        const parsed = parseInt(typicalCycleLength.trim(), 10)
        if (isNaN(parsed) || parsed < 21 || parsed > 45) {
          setErrorMessage("Typical cycle length must be between 21 and 45 days.")
          return
        }
        cycleLengthNum = parsed
      }
    }

    // 2. Validate Last Period Start Date
    if (!isSupporter && !lastPeriodStart) {
      setErrorMessage("Please select when your last period started.")
      return
    }
    if (lastPeriodStart && lastPeriodStart > todayStr) {
      setErrorMessage("Last period start date cannot be in the future.")
      return
    }

    setIsPending(true)

    try {
      const formData = new FormData()
      formData.set("displayName", initialData.displayName || "User")
      if (initialData.avatarUrl) {
        formData.set("avatarUrl", initialData.avatarUrl)
      }
      if (initialData.sex) {
        formData.set("sex", initialData.sex)
      }
      if (cycleLengthNum !== null) {
        formData.set("typicalCycleLength", String(cycleLengthNum))
      }
      if (lastPeriodStart) {
        formData.set("lastPeriodStart", lastPeriodStart)
      }

      const result = await updateSettingsAction(null, formData)

      if (!result.success) {
        setErrorMessage(result.error ?? "Failed to save cycle preferences. Please try again.")
      } else {
        showModalNotification("Cycle Saved", "Your cycle baseline metrics have been updated.", 1000)
      }
    } catch {
      setErrorMessage("An unexpected error occurred while saving cycle preferences.")
    } finally {
      setIsPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl mx-auto pb-12">
      {errorMessage && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive shadow-xs animate-in fade-in slide-in-from-top-1 duration-200"
        >
          <AlertCircle className="size-5 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium">Unable to save changes</p>
            <p className="leading-relaxed opacity-90">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* Modal Notification */}
      {modalNotif && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none transition-all duration-150",
            isModalExiting ? "opacity-0 scale-95" : "opacity-100 scale-100"
          )}
        >
          <div
            className={cn(
              "fixed inset-0 bg-black/20 dark:bg-black/50 backdrop-blur-[2px] transition-opacity duration-150 pointer-events-auto",
              isModalExiting ? "opacity-0" : "opacity-100"
            )}
            onClick={() => {
              setModalNotif(null)
              setIsModalExiting(false)
            }}
          />
          <div
            className={cn(
              "relative z-10 flex flex-col items-center justify-center gap-3 px-6 py-5 rounded-2xl bg-card border border-emerald-500/30 text-card-foreground shadow-2xl max-w-xs w-full text-center pointer-events-auto backdrop-blur-md transition-all duration-150",
              isModalExiting ? "scale-95 opacity-0" : "scale-100 opacity-100"
            )}
          >
            <div className="flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-4 ring-emerald-500/20">
              <CheckCircle2 className="size-6 stroke-[2.2]" />
            </div>
            <div className="space-y-0.5">
              <h3 className="text-sm font-semibold text-foreground tracking-tight">
                {modalNotif.title}
              </h3>
              <p className="text-xs text-muted-foreground">{modalNotif.message}</p>
            </div>
          </div>
        </div>
      )}

      {/* Cycle History Card Entry */}
      <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-xs flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-lavender/60 text-primary border border-lavender-border/50">
            <History className="size-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Cycle History</h3>
            <p className="text-xs text-muted-foreground">View and manage past cycle intervals & period days</p>
          </div>
        </div>
        <Link
          href="/cycles"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-xl gap-1")}
        >
          <span>View Cycles</span>
          <ChevronRight className="size-3.5" />
        </Link>
      </div>

      {/* Cycle Preferences Card */}
      <Card className="overflow-hidden border-border/70 shadow-xs">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-lavender text-primary border border-lavender-border/60">
              <CalendarHeart className="size-5" />
            </div>
            <div>
              <CardTitle>Cycle Baseline Preferences</CardTitle>
              <CardDescription>
                Baseline metrics to calculate your cycle windows and projections
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {isSupporter && (
            <div className="flex items-start gap-2.5 rounded-xl bg-lavender/40 p-3.5 border border-lavender-border/70 text-xs text-muted-foreground leading-relaxed">
              <HeartHandshake className="size-4 text-primary shrink-0 mt-0.5" />
              <span>
                <strong>Supporter account:</strong> Personal cycle tracking is optional. You may enter cycle values below if you also wish to track personal cycle data.
              </span>
            </div>
          )}

          <div className="flex items-start gap-2.5 rounded-xl bg-secondary/60 p-3.5 border border-border/50 text-xs text-muted-foreground leading-relaxed">
            <Sparkles className="size-4 text-primary shrink-0 mt-0.5" />
            <span>
              Tracking preferences are used solely to personalize your cycle estimates and journal. They are not medical diagnoses or healthcare advice.
            </span>
          </div>

          <div className="flex items-start gap-2.5 rounded-xl bg-lavender/30 p-3.5 border border-lavender-border/50 text-xs text-muted-foreground leading-relaxed">
            <CalendarHeart className="size-4 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-foreground">How your next period estimate changes</p>
              <p className="mt-1">
                Until Seijun can calculate completed cycle intervals from your history, it uses the typical cycle length you set below. With usable history, it uses the median of up to six recent intervals and filters unusually different intervals when enough history is available. Recording period starts and completing more cycles can update the estimate.
              </p>
            </div>
          </div>

          {/* Typical Cycle Length */}
          <div className="space-y-1.5">
            <Label htmlFor="typicalCycleLength" className="text-sm font-medium">
              Typical Cycle Length (Days) <span className="text-destructive">*</span>
            </Label>
            <Input
              id="typicalCycleLength"
              name="typicalCycleLength"
              type="number"
              min={21}
              max={45}
              step={1}
              required
              value={typicalCycleLength}
              onChange={(e) => setTypicalCycleLength(e.target.value)}
              placeholder="e.g. 28"
              disabled={isPending}
              className="h-11 rounded-xl"
            />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Standard cycles typically range from 21 to 45 days. This provides an initial baseline until sufficient logged cycles are available.
            </p>
          </div>

          {/* Last Period Start Date */}
          <div className="space-y-1.5">
            <Label htmlFor="lastPeriodStart" className="text-sm font-medium">
              Last Period Start Date <span className="text-destructive">*</span>
            </Label>
            <DatePicker
              id="lastPeriodStart"
              name="lastPeriodStart"
              value={lastPeriodStart}
              onChange={setLastPeriodStart}
              maxDate={todayStr}
              placeholder="Select start date"
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground leading-relaxed">
              The first day of bleeding in your most recent cycle. Future dates cannot be selected.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="sticky bottom-4 z-10 flex items-center justify-end gap-3 rounded-2xl border border-border/80 bg-card/95 backdrop-blur-md p-3.5 shadow-redi-md">
        <Button
          type="submit"
          disabled={isPending}
          className="min-h-[44px] min-w-[140px] px-5 rounded-xl font-medium shadow-xs"
        >
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin mr-2" />
              Saving Preferences...
            </>
          ) : (
            "Save Preferences"
          )}
        </Button>
      </div>
    </form>
  )
}
