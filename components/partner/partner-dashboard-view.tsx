"use client"

import * as React from "react"
import Link from "next/link"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Avatar } from "@/components/ui/avatar"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  HeartHandshake,
  Activity,
  Droplets,
  Settings2,
  BookOpen,
  ChevronLeft,
  ShieldCheck,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  Check,
  UserX,
  CalendarDays,
  TrendingUp,
  Clock,
  Plus,
  Edit3,
  Sparkles,
} from "lucide-react"
import {
  getPartnerDashboardFullAction,
  getSharedCycleEstimatesAction,
  getSharedPeriodStatusAction,
  getSharedCyclePreferencesAction,
  type PartnerDashboardData,
  type SharedCycleEstimateResult,
  type SharedPeriodStatusResult,
  type SharedCyclePreferencesResult,
  type FullPartnerDashboardResult,
} from "@/app/actions/partner-shared"
import { updatePartnerCyclePreferencesAction } from "@/app/actions/partner-mutations"
import { ManagePeriodDialog } from "@/components/partner/manage-period-dialog"
import { useAppRouter } from "@/components/navigation/use-app-router"
import { CycleContextSwitcher } from "@/components/cycle-context/cycle-context-switcher"
import { AffinityCard } from "@/components/partner/affinity-card"

/**
 * Seijun Phase 19 Batch 4
 * Supporter-Facing Partner Dashboard & Co-Management
 *
 * This is a dedicated view for supporters.
 * When co-management permissions are enabled by the owner, capability-specific
 * mutation controls appear seamlessly. When disabled, the dashboard remains
 * strictly read-only.
 */

export function PartnerDashboardView({
  isPrimaryDashboard = false,
  initialData,
}: {
  isPrimaryDashboard?: boolean
  initialData?: FullPartnerDashboardResult
} = {}) {
  const router = useAppRouter()
  const [dashboardData, setDashboardData] = React.useState<PartnerDashboardData | null>(initialData?.dashboardData ?? null)
  const [loading, setLoading] = React.useState(!initialData)
  const [error, setError] = React.useState<string | null>(null)

  // Category data
  const [cycleEstimates, setCycleEstimates] = React.useState<SharedCycleEstimateResult | null>(initialData?.cycleEstimates ?? null)
  const [periodStatus, setPeriodStatus] = React.useState<SharedPeriodStatusResult | null>(initialData?.periodStatus ?? null)
  const [cyclePreferences, setCyclePreferences] = React.useState<SharedCyclePreferencesResult | null>(initialData?.cyclePreferences ?? null)
  const [categoryLoading, setCategoryLoading] = React.useState(!initialData)

  const refreshEstimates = React.useCallback(async () => {
    const res = await getSharedCycleEstimatesAction()
    setCycleEstimates(res)
  }, [])

  const refreshPeriod = React.useCallback(async () => {
    const res = await getSharedPeriodStatusAction()
    setPeriodStatus(res)
  }, [])

  const refreshCyclePreferences = React.useCallback(async () => {
    const res = await getSharedCyclePreferencesAction()
    setCyclePreferences(res)
  }, [])


  const lastFocusRef = React.useRef<number>(0)

  const load = React.useCallback(async (isInitial = false) => {
    try {
      if (isInitial) {
        setLoading(true)
        setCategoryLoading(true)
      }
      setError(null)
      const res = await getPartnerDashboardFullAction()
      setDashboardData(res.dashboardData)

      setCycleEstimates(res.cycleEstimates)
      setPeriodStatus(res.periodStatus)
      setCyclePreferences(res.cyclePreferences)
    } catch {
      setError("Failed to load partner dashboard.")
    } finally {
      setLoading(false)
      setCategoryLoading(false)
    }
  }, [])

  React.useEffect(() => {
    lastFocusRef.current = Date.now()
    const initialTimer = initialData ? undefined : setTimeout(() => void load(true), 0)

    // Re-synchronize when partner tabs back to the dashboard (throttled to 30s)
    const handleFocus = () => {
      const now = Date.now()
      if (now - lastFocusRef.current > 30000) {
        lastFocusRef.current = now
        load(false)
      }
    }
    window.addEventListener("focus", handleFocus)
    return () => {
      clearTimeout(initialTimer)
      window.removeEventListener("focus", handleFocus)
    }
  }, [load, initialData])

  // Loading state
  if (loading) {
    return (
      <div className="space-y-6 pb-8 max-w-2xl mx-auto animate-in fade-in duration-200">
        <div className="space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-6 pb-8 max-w-2xl mx-auto animate-in fade-in duration-200">
        <PartnerDashboardHeader isPrimaryDashboard={isPrimaryDashboard} />
        <Card className="border-destructive/30">
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3 text-center">
            <AlertCircle className="size-8 text-destructive" />
            <p className="text-sm text-destructive font-medium">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.location.reload()}
              className="rounded-xl text-xs cursor-pointer"
            >
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // No active relationship / not a supporter
  if (!dashboardData?.authorized) {
    const isRevoked = dashboardData?.reason === "NO_ACTIVE_RELATIONSHIP" && (dashboardData?.message?.toLowerCase().includes("revoked") || dashboardData?.message?.toLowerCase().includes("no active"))
    return (
      <div className="space-y-6 pb-8 max-w-2xl mx-auto animate-in fade-in duration-200">
        {isPrimaryDashboard && <CycleContextSwitcher />}
        <PartnerDashboardHeader isPrimaryDashboard={isPrimaryDashboard} />
        <Card className="border-border/60 rounded-3xl overflow-hidden shadow-xs">
          <CardContent className="flex flex-col items-center justify-center py-16 px-6 gap-4 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-lavender/50 text-primary border border-lavender-border/60">
              <UserX className="size-7" />
            </div>
            <div className="space-y-2 max-w-sm">
              <p className="text-base font-semibold text-foreground">
                {dashboardData?.reason === "NOT_SUPPORTER"
                  ? "Cycle Owner Dashboard"
                  : isRevoked
                  ? "Partner Connection Ended"
                  : "No Partner Connected Yet"}
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {dashboardData?.reason === "NOT_SUPPORTER"
                  ? "This view is designed for supporters. As the cycle owner, your complete private cycle tracking is on your main personal dashboard."
                  : isRevoked
                  ? "This relationship connection has ended. All shared cycle data and notes were immediately revoked, keeping both accounts fully private and secure."
                  : "Welcome to your supporter space! Once your partner connects with you, their shared cycle metrics, period flow, and daily notes will appear here."}
              </p>
            </div>
            <Button
              variant="default"
              size="sm"
              onClick={() => router.push("/settings/partner")}
              className="rounded-xl text-xs gap-1.5 cursor-pointer shadow-xs font-semibold"
            >
              <HeartHandshake className="size-3.5" />
              <span>Partner Settings</span>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const categories = dashboardData.enabledCategories || dashboardData.categories || []
  const managementPermissions = dashboardData.managementPermissions || []

  const canManagePeriod = managementPermissions.includes("manage_period_status")
  const canManageCyclePrefs = managementPermissions.includes("manage_cycle_preferences")

  return (
    <div className="space-y-5 pb-8 max-w-2xl mx-auto animate-in fade-in duration-200">
      {/* Context Switcher if primary dashboard */}
      {isPrimaryDashboard && <CycleContextSwitcher />}

      {/* Header identifying the connected owner's cycle */}
      <PartnerDashboardHeader
        isPrimaryDashboard={isPrimaryDashboard}
        ownerDisplayName={dashboardData.ownerDisplayName}
      />

      {/* Compact Partner Context Banner */}
      <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-2xl border border-border/70 bg-gradient-to-r from-lavender/20 via-background to-card shadow-2xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <Avatar
            src={dashboardData.ownerAvatarUrl}
            alt={dashboardData.ownerDisplayName || "Partner"}
            fallbackInitials={dashboardData.ownerDisplayName || "Partner"}
            size="sm"
            className="size-8 ring-1 ring-background border border-lavender-border bg-lavender/60 shrink-0"
          />
          <div className="min-w-0 leading-tight">
            <p className="text-xs font-semibold text-foreground truncate">
              {dashboardData.ownerDisplayName}
            </p>
            {dashboardData.ownerUsername && (
              <p className="text-[10px] font-mono text-muted-foreground truncate">
                @{dashboardData.ownerUsername}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Badge
            variant="lavender"
            className="text-[10px] px-2 py-0.5 font-medium border-lavender-border/70 text-primary hidden sm:inline-flex"
          >
            Supporter Space
          </Badge>
          {managementPermissions.length > 0 ? (
            <Badge
              variant="outline"
              className="text-[10px] px-2 py-0.5 font-medium border-primary/30 text-primary bg-primary/5 gap-1"
            >
              <Sparkles className="size-2.5" />
              <span>Co-Management</span>
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="text-[10px] px-2 py-0.5 font-medium border-muted text-muted-foreground bg-muted/20 gap-1"
            >
              <Eye className="size-2.5" />
              <span>Read-only view</span>
            </Badge>
          )}
          <Badge
            variant="outline"
            className="text-[10px] px-2.5 py-0.5 font-medium border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
          >
            Connected
          </Badge>
        </div>
      </div>

      {/* Category Cards: Partner Cycle Overview, Period Details, Preferences */}
      {categoryLoading && categories.length > 0 ? (
        <div className="space-y-4">
          {categories.map((cat) => (
            <Skeleton key={cat} className="h-32 w-full rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {categories.length === 0 && (
            <p className="sr-only">No Data Shared Yet</p>
          )}

          {/* 1. Partner Cycle Overview (Cycle Estimates) */}
          {categories.includes("cycle_estimates") && cycleEstimates ? (
            <CycleEstimatesCard
              data={cycleEstimates}
              partnerDisplayName={dashboardData.ownerDisplayName}
            />
          ) : (
            <PrivateCategoryPlaceholderCard
              category="cycle_estimates"
              partnerDisplayName={dashboardData.ownerDisplayName}
            />
          )}

          {/* 2. Relevant Cycle Details (Period Status) */}
          {categories.includes("period_status") && periodStatus ? (
            <PeriodStatusCard
              data={periodStatus}
              canManage={canManagePeriod}
              partnerDisplayName={dashboardData.ownerDisplayName}
              onPeriodUpdated={() => {
                refreshPeriod()
                if (categories.includes("cycle_estimates")) refreshEstimates()
              }}
            />
          ) : (
            <PrivateCategoryPlaceholderCard
              category="period_status"
              partnerDisplayName={dashboardData.ownerDisplayName}
            />
          )}

          {/* 3. Cycle Preferences */}
          {categories.includes("cycle_preferences") && cyclePreferences ? (
            <CyclePreferencesCard
              data={cyclePreferences}
              canManage={canManageCyclePrefs}
              partnerDisplayName={dashboardData.ownerDisplayName}
              onPreferencesUpdated={() => {
                refreshCyclePreferences()
                if (categories.includes("cycle_estimates")) refreshEstimates()
              }}
            />
          ) : (
            <PrivateCategoryPlaceholderCard
              category="cycle_preferences"
              partnerDisplayName={dashboardData.ownerDisplayName}
            />
          )}

          {/* Daily Notes (when permitted) */}
          {categories.includes("daily_notes") ? (
            <Link
              href="/notes?view=partner"
              prefetch={true}
              className="flex items-center justify-between rounded-2xl border border-border/70 bg-card p-3.5 text-xs font-semibold text-primary hover:bg-muted/30 transition-colors shadow-2xs"
            >
              <div className="flex items-center gap-2.5">
                <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <BookOpen className="size-3.5" />
                </div>
                <span>Shared Daily Notes</span>
              </div>
              <span className="text-[11px] font-normal text-muted-foreground">
                {managementPermissions.includes("manage_daily_notes") ? "View & Add Notes →" : "View Notes →"}
              </span>
            </Link>
          ) : (
            <PrivateCategoryPlaceholderCard
              category="daily_notes"
              partnerDisplayName={dashboardData.ownerDisplayName}
            />
          )}
        </div>
      )}

      {/* 4. Affinity & Relationship Information (Placed Below Cycle Context) */}
      <div className="pt-1">
        <AffinityCard
          startDate={dashboardData.relationshipStartDate}
          initialFormat={dashboardData.affinityDisplayFormat}
          partnerDisplayName={dashboardData.ownerDisplayName || "Partner"}
          partnerUsername={dashboardData.ownerUsername}
          relationshipStatus="active"
          canEdit={true}
          onStartDateChange={() => load(false)}
          onFormatChange={() => load(false)}
        />
      </div>

      {/* 5. Secondary Navigation & Supporting Details */}
      <div className="flex items-center justify-between gap-2 px-1 pt-1 text-[10px] text-muted-foreground/70">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="size-3 shrink-0" />
          <span>Privacy-first • Your partner controls all sharing & co-management permissions</span>
        </div>
        <Link
          href="/settings/partner"
          className="text-primary hover:underline font-medium text-[11px]"
        >
          Partner Settings
        </Link>
      </div>
    </div>
  )
}

function PrivateCategoryPlaceholderCard({
  category,
  partnerDisplayName,
}: {
  category: "cycle_estimates" | "period_status" | "cycle_preferences" | "daily_notes"
  partnerDisplayName?: string
}) {
  const meta = {
    cycle_estimates: {
      title: "Cycle Estimates",
      description: `Current phase and cycle estimates are kept confidential by ${partnerDisplayName || "your partner"}.`,
      icon: Activity,
    },
    period_status: {
      title: "Period Status",
      description: `Active bleeding and period flow tracking are kept confidential by ${partnerDisplayName || "your partner"}.`,
      icon: Droplets,
    },
    cycle_preferences: {
      title: "Cycle Preferences",
      description: `Typical cycle length targets and preferences are kept confidential by ${partnerDisplayName || "your partner"}.`,
      icon: Settings2,
    },
    daily_notes: {
      title: "Daily Notes",
      description: `Daily journal observations and personal entries are kept confidential by ${partnerDisplayName || "your partner"}.`,
      icon: BookOpen,
    },
  }[category]

  const Icon = meta.icon

  return (
    <Card className="border-border/50 bg-secondary/15 opacity-80 hover:opacity-100 transition-opacity rounded-2xl shadow-2xs select-none">
      <CardContent className="p-3.5 flex items-center justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex size-8 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground shrink-0 mt-0.5 border border-border/40">
            <Icon className="size-4" />
          </div>
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs font-semibold text-foreground truncate">{meta.title}</p>
              <Badge
                variant="outline"
                className="text-[9px] px-1.5 py-0 font-normal border-border/60 text-muted-foreground bg-background/50"
              >
                Kept Private
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {meta.description}
            </p>
          </div>
        </div>
        <div className="shrink-0 flex items-center text-muted-foreground/60 pr-1">
          <EyeOff className="size-4" />
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

function PartnerDashboardHeader({
  isPrimaryDashboard = false,
  ownerDisplayName,
}: {
  isPrimaryDashboard?: boolean
  ownerDisplayName?: string
} = {}) {
  const router = useAppRouter()
  return (
    <div className="space-y-1 select-none">
      {!isPrimaryDashboard && (
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/dashboard")}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground rounded-lg -ml-2 cursor-pointer gap-1"
          >
            <ChevronLeft className="size-3.5" />
            <span>My Space</span>
          </Button>
        </div>
      )}
      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
        {ownerDisplayName ? `${ownerDisplayName}'s Cycle` : "Partner Dashboard"}
      </h1>
      <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
        {ownerDisplayName
          ? `Shared cycle awareness and authorized support for ${ownerDisplayName}.`
          : "Shared cycle awareness and authorized co-management."}
      </p>
    </div>
  )
}

function CycleEstimatesCard({
  data,
  partnerDisplayName,
}: {
  data: SharedCycleEstimateResult
  partnerDisplayName?: string
}) {
  if (!data.ok || !data.data) {
    return (
      <Card className="overflow-hidden border-border/50 bg-secondary/15 rounded-2xl shadow-2xs">
        <CardContent className="p-4 text-center space-y-1">
          <p className="text-xs font-semibold text-foreground">Cycle Estimates Unavailable</p>
          <p className="text-[11px] text-muted-foreground">{data.message || "No estimate data available."}</p>
        </CardContent>
      </Card>
    )
  }

  const d = data.data
  return (
    <Card className="overflow-hidden border-border/70 shadow-xs">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20">
            <Activity className="size-4" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">
              {partnerDisplayName ? `${partnerDisplayName}'s Cycle Overview` : "Cycle Overview"}
            </CardTitle>
            <CardDescription className="text-[11px]">Current cycle overview and estimates</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!d.currentCycleStartDate && !d.estimatedNextPeriodDate && !d.averageCycleLength ? (
          <div className="p-4 rounded-xl bg-secondary/20 border border-border/20 text-center space-y-1">
            <p className="text-xs font-medium text-foreground">No cycle data recorded yet</p>
            <p className="text-[11px] text-muted-foreground">
              Cycle estimates will appear once {partnerDisplayName || "your partner"} logs their period.
            </p>
          </div>
        ) : (
          <>
            {/* Current Status */}
            <div className="p-3 rounded-xl bg-secondary/30 border border-border/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Status</span>
                <span className={`text-xs font-semibold ${d.isOnPeriod ? "text-rose-500" : "text-foreground"}`}>
                  {d.currentCyclePhase}
                </span>
              </div>
              {d.currentCycleDay !== null && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Cycle Day</span>
                  <span className="text-xs font-bold text-foreground">Day {d.currentCycleDay}</span>
                </div>
              )}
            </div>

            {/* Estimates Grid */}
            <div className="grid grid-cols-2 gap-2">
              {d.estimatedNextPeriodDate && (
                <div className="p-2.5 rounded-xl bg-secondary/20 border border-border/20 space-y-0.5">
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <CalendarDays className="size-3" />
                    <span>Next Period</span>
                  </div>
                  <p className="text-xs font-semibold text-foreground">
                    {d.windowStartDate && d.windowEndDate
                      ? `${formatDate(d.windowStartDate, false)} – ${formatDate(d.windowEndDate)}`
                      : formatDate(d.estimatedNextPeriodDate)}
                  </p>
                  {d.estimatedNextPeriodDaysUntil !== null && (
                    <p className="text-[10px] text-primary font-medium">
                      {d.estimatedNextPeriodDaysUntil === 0
                        ? "Expected today"
                        : d.estimatedNextPeriodDaysUntil < 0
                        ? "Estimated date has passed; cycle continues"
                        : `${d.estimatedNextPeriodDaysUntil} days away (estimate)`}
                    </p>
                  )}
                </div>
              )}
              {d.averageCycleLength !== null && (
                <div className="p-2.5 rounded-xl bg-secondary/20 border border-border/20 space-y-0.5">
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <TrendingUp className="size-3" />
                    <span>Historical estimate</span>
                  </div>
                  <p className="text-xs font-semibold text-foreground">{d.averageCycleLength} days</p>
                </div>
              )}
              {d.averagePeriodDuration !== null && (
                <div className="p-2.5 rounded-xl bg-secondary/20 border border-border/20 space-y-0.5">
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Clock className="size-3" />
                    <span>Avg Period</span>
                  </div>
                  <p className="text-xs font-semibold text-foreground">{d.averagePeriodDuration} days</p>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function PeriodStatusCard({
  data,
  canManage = false,
  partnerDisplayName,
  onPeriodUpdated,
}: {
  data: SharedPeriodStatusResult
  canManage?: boolean
  partnerDisplayName?: string
  onPeriodUpdated: () => void
}) {
  const [modalOpen, setModalOpen] = React.useState(false)
  const [creatingPeriod, setCreatingPeriod] = React.useState(false)

  if (!data.ok || !data.data) return null

  const d = data.data
  return (
    <>
      <Card className="overflow-hidden border-border/70 shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-xl bg-rose-500/10 text-rose-500 dark:text-rose-400 border border-rose-500/20">
                <Droplets className="size-4" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold">
                  {partnerDisplayName ? `${partnerDisplayName}'s Period Status` : "Period Status"}
                </CardTitle>
                <CardDescription className="text-[11px]">Current period information</CardDescription>
              </div>
            </div>

            {canManage && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setCreatingPeriod(false); setModalOpen(true) }}
                className="h-8 px-2.5 text-xs gap-1.5 rounded-xl border-rose-500/30 text-rose-500 hover:bg-rose-500/10 cursor-pointer font-medium"
              >
                <Plus className="size-3.5" />
                <span>{d.cycleId ? "Edit Period" : "Manage Period"}</span>
              </Button>
            )}
            {canManage && d.cycleId && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Log a new period"
                title="Log a new period"
                onClick={() => { setCreatingPeriod(true); setModalOpen(true) }}
                className="size-8 text-rose-500"
              >
                <Plus className="size-4" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="p-3 rounded-xl bg-secondary/30 border border-border/30 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Currently on period</span>
              <Badge
                variant="outline"
                className={`text-[10px] px-2 py-0.5 font-medium ${
                  d.isOnPeriod
                    ? "border-rose-500/40 text-rose-500 bg-rose-500/10"
                    : "border-border/60 text-muted-foreground"
                }`}
              >
                {d.isOnPeriod ? "Yes" : "No"}
              </Badge>
            </div>
            {d.isOnPeriod && d.currentPeriodDay !== null && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Period Day</span>
                <span className="text-xs font-bold text-foreground">{d.currentPeriodDay}</span>
              </div>
            )}
            {d.lastPeriodStartDate && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Period start date</span>
                <span className="text-xs font-medium text-foreground">{formatDate(d.lastPeriodStartDate)}</span>
              </div>
            )}
            {d.cycleId && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Period end date</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-foreground">
                    {d.lastPeriodEndDate ? formatDate(d.lastPeriodEndDate) : "Not set"}
                  </span>
                  {!d.lastPeriodEndDate && canManage && (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      onClick={() => { setCreatingPeriod(false); setModalOpen(true) }}
                      className="h-auto p-0 text-[11px]"
                    >
                      Set end date
                    </Button>
                  )}
                </div>
              </div>
            )}
            {d.cycleId && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Status</span>
                <span className="text-xs font-medium text-foreground">{d.lastPeriodEndDate ? "Completed" : "Ongoing"}</span>
              </div>
            )}
            {d.lastPeriodDuration !== null && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Duration</span>
                <span className="text-xs font-medium text-foreground">{d.lastPeriodDuration} days</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {canManage && (
        <ManagePeriodDialog
          open={modalOpen}
          onOpenChange={setModalOpen}
          partnerDisplayName={partnerDisplayName}
          cycleId={creatingPeriod ? null : d.cycleId}
          initialStartDate={creatingPeriod ? null : d.lastPeriodStartDate}
          initialEndDate={creatingPeriod ? null : d.lastPeriodEndDate}
          onSuccess={onPeriodUpdated}
        />
      )}
    </>
  )
}

function CyclePreferencesCard({
  data,
  canManage = false,
  partnerDisplayName,
  onPreferencesUpdated,
}: {
  data: SharedCyclePreferencesResult
  canManage?: boolean
  partnerDisplayName?: string
  onPreferencesUpdated: () => void
}) {
  const [modalOpen, setModalOpen] = React.useState(false)

  if (!data.ok || !data.data) return null

  const d = data.data
  return (
    <>
      <Card className="overflow-hidden border-border/70 shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                <Settings2 className="size-4" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold">
                  {partnerDisplayName ? `${partnerDisplayName}'s Cycle Preferences` : "Cycle Preferences"}
                </CardTitle>
                <CardDescription className="text-[11px]">Shared cycle configuration</CardDescription>
              </div>
            </div>

            {canManage && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setModalOpen(true)}
                className="h-8 px-2.5 text-xs gap-1.5 rounded-xl border-sky-500/30 text-sky-600 dark:text-sky-400 hover:bg-sky-500/10 cursor-pointer font-medium"
              >
                <Edit3 className="size-3.5" />
                <span>Edit</span>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="p-3 rounded-xl bg-secondary/30 border border-border/30 space-y-2">
            {d.typicalCycleLength !== null && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Typical Cycle Length</span>
                <span className="text-xs font-bold text-foreground">{d.typicalCycleLength} days</span>
              </div>
            )}
            {d.lastPeriodStart && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Last Period Start</span>
                <span className="text-xs font-medium text-foreground">{formatDate(d.lastPeriodStart)}</span>
              </div>
            )}
            {d.typicalCycleLength === null && !d.lastPeriodStart && (
              <p className="text-xs text-muted-foreground text-center py-2">
                No cycle preferences data available.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {canManage && (
        <EditCyclePreferencesDialog
          key={`${d.typicalCycleLength}-${d.lastPeriodStart}`}
          open={modalOpen}
          onOpenChange={setModalOpen}
          initialTypicalLength={d.typicalCycleLength}
          initialLastPeriodStart={d.lastPeriodStart}
          partnerDisplayName={partnerDisplayName}
          onSuccess={onPreferencesUpdated}
        />
      )}
    </>
  )
}

function EditCyclePreferencesDialog({
  open,
  onOpenChange,
  initialTypicalLength,
  initialLastPeriodStart,
  partnerDisplayName,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialTypicalLength: number | null
  initialLastPeriodStart: string | null
  partnerDisplayName?: string
  onSuccess: () => void
}) {
  const todayStr = new Date().toISOString().split("T")[0]
  const [typicalLength, setTypicalLength] = React.useState<number>(initialTypicalLength || 28)
  const [lastPeriodStart, setLastPeriodStart] = React.useState<string>(initialLastPeriodStart || "")
  const [submitting, setSubmitting] = React.useState(false)
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setErrorMsg(null)
    setSuccess(false)

    try {
      const res = await updatePartnerCyclePreferencesAction({
        typicalCycleLength: typicalLength,
        lastPeriodStart: lastPeriodStart ? lastPeriodStart : null,
      })

      if (res.ok) {
        setSuccess(true)
        setTimeout(() => {
          onOpenChange(false)
          onSuccess()
          setSuccess(false)
        }, 800)
      } else {
        setErrorMsg(res.error || "Failed to update cycle preferences.")
      }
    } catch {
      setErrorMsg("Network error saving cycle preferences.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-3xl p-6">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-base font-semibold">Edit Cycle Preferences</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Update cycle configuration baseline for {partnerDisplayName || "partner"}.
          </DialogDescription>
        </DialogHeader>

        {errorMsg && (
          <div className="flex items-start gap-2 p-2.5 rounded-xl bg-destructive/10 text-destructive text-xs">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {success ? (
          <div className="flex items-center justify-center py-6 gap-2 text-emerald-600 dark:text-emerald-400 font-medium text-sm">
            <Check className="size-4" />
            <span>Preferences updated!</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3.5 pt-2">
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <Label className="text-xs font-medium">Typical Cycle Length</Label>
                <span className="text-xs font-bold text-foreground font-mono">{typicalLength} days</span>
              </div>
              <Input
                type="number"
                min={21}
                max={45}
                value={typicalLength}
                onChange={(e) => setTypicalLength(Number(e.target.value))}
                required
                className="h-10 text-xs rounded-xl"
              />
              <p className="text-[10px] text-muted-foreground">Must be between 21 and 45 days.</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Last Period Start Date</Label>
              <Input
                type="date"
                max={todayStr}
                value={lastPeriodStart}
                onChange={(e) => setLastPeriodStart(e.target.value)}
                className="h-10 text-xs rounded-xl"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={() => onOpenChange(false)}
                className="flex-1 h-10 rounded-xl text-xs cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="flex-1 h-10 rounded-xl text-xs font-semibold cursor-pointer gap-1.5"
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save Preferences</span>
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function formatDate(dateStr: string, includeYear: boolean = true): string {
  try {
    const [y, m, d] = dateStr.split("-").map(Number)
    const date = new Date(y, m - 1, d)
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      ...(includeYear ? { year: "numeric" } : {}),
    })
  } catch {
    return dateStr
  }
}
