import { createClient, getAuthenticatedUser } from "@/lib/supabase/server"
import { getServerUserProfile } from "@/lib/server/profile"
import { redirect } from "next/navigation"
import { after } from "next/server"
import { getCyclesForUser } from "@/app/actions/cycles"
import { getSymptomsByDateForUser } from "@/app/actions/symptoms"
import { Suspense } from "react"
import { CompactCalendar } from "@/components/dashboard/compact-calendar"
import {
  getCurrentCycle,
  getCurrentCycleStatus,
  getLatestPeriod,
  calculateAverageCycleLength,
  calculateAveragePeriodDuration,
  calculateEstimatedNextPeriod,
  getTodayDateString,
} from "@/lib/calculations/cycle-calculations"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { SupporterBanner } from "@/components/dashboard/supporter-banner"
import { CurrentCycleCard } from "@/components/dashboard/current-cycle-card"
import { PeriodInsights } from "@/components/dashboard/period-insights"
import { DashboardQuickActions } from "@/components/dashboard/dashboard-quick-actions"
import { TodaySymptomsCard } from "@/components/dashboard/today-symptoms-card"
import { HomeNotesCard } from "@/components/dashboard/home-notes-card"
import { Skeleton } from "@/components/ui/skeleton"
import { NotificationPermissionPrompt } from "@/components/notifications/notification-permission-prompt"
import { resolveServerCycleContext } from "@/lib/cycle-context/server"
import { CycleContextSwitcher } from "@/components/cycle-context/cycle-context-switcher"
import { PartnerDashboardView } from "@/components/partner/partner-dashboard-view"
import { getPartnerDashboardFullAction } from "@/app/actions/partner-shared"
import { RelationshipContextCard } from "@/components/partner/relationship-context-card"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Dashboard",
  description: "Your personal cycle overview and insights.",
}

export default async function DashboardPage() {
  const user = await getAuthenticatedUser()

  if (!user) {
    redirect("/login")
  }

  const supabase = await createClient()
  const todayStr = getTodayDateString()

  // 1. Resolve authoritative cycle context (OWN vs PARTNER)
  const cycleContext = await resolveServerCycleContext(supabase, user.id)

  // 2. Fetch user profile for onboarding status and display name (memoized)
  const profile = await getServerUserProfile(user.id)

  if (profile && profile.onboarding_completed === false) {
    redirect("/onboarding")
  }

  const displayName = profile?.display_name || user.user_metadata?.display_name || "Friend"

  // Opportunistic evaluation of pending due reminders in the background
  after(async () => {
    try {
      const { processPendingNotificationEvents } = await import("@/lib/reminders/processor")
      await processPendingNotificationEvents({ userId: user.id })
    } catch { /* Non-blocking */ }
  })

  // ─── PARTNER CYCLE CONTEXT (Supporter Mode or Both-Role Partner Context) ───────
  if (cycleContext.isPartnerContext) {
    if (cycleContext.partnerInfo.hasActivePartner) {
      // Naturally present the connected Partner's cycle experience
      const initialData = await getPartnerDashboardFullAction()
      return <PartnerDashboardView isPrimaryDashboard={true} initialData={initialData} />
    }

    // Supporter account without active partner connection yet:
    // Present dedicated supporter connection setup instead of inappropriate personal cycle cards
    return (
      <div className="space-y-6 pb-8 max-w-4xl mx-auto">
        <DashboardHeader displayName={displayName} />
        <NotificationPermissionPrompt usageRole={profile?.usage_role} />
        <SupporterBanner hasActivePartner={false} />
      </div>
    )
  }

  // ─── OWN CYCLE CONTEXT (Cycle Tracker or Both-Role Own Context) ────────────────
  const typicalCycleLength = profile?.typical_cycle_length ?? 28
  const onboardingStartDate = profile?.last_period_start ?? null

  const cycles = await getCyclesForUser(user.id, supabase)

  // A. Current Cycle & Status
  const currentCycle = getCurrentCycle(cycles, todayStr)
  const statusInfo = getCurrentCycleStatus(currentCycle, todayStr)

  // B. Statistics
  const avgCycleLength = calculateAverageCycleLength(cycles)
  const avgPeriodDuration = calculateAveragePeriodDuration(cycles)
  const expectedCycleLength = avgCycleLength || typicalCycleLength || 28

  // C. Period Insights
  const latestPeriod = getLatestPeriod(cycles)
  const latestCycleStart = currentCycle?.start_date ?? onboardingStartDate
  const estimatedNextPeriod = calculateEstimatedNextPeriod({
    latestCycleStartDate: latestCycleStart,
    averageCycleLength: avgCycleLength,
    typicalCycleLength,
    referenceDateStr: todayStr,
    cycles,
  })

  return (
    <div className="space-y-6 pb-8 max-w-4xl mx-auto">
      {/* Context Switcher for users with dual roles */}
      {cycleContext.canSwitchContext && <CycleContextSwitcher />}

      {/* Personalized Greeting Header */}
      <DashboardHeader
        displayName={displayName}
        partnerDisplayName={cycleContext.partnerInfo.displayName}
        hasActivePartner={cycleContext.partnerInfo.hasActivePartner}
      />

      {/* Explanatory Notification Permission Prompt */}
      <NotificationPermissionPrompt usageRole={profile?.usage_role} />

      {/* ─── MY SPACE (Personal Cycle Tracking & Private Journal) ─── */}
      {cycleContext.partnerInfo.hasActivePartner && (
        <div className="flex items-center justify-between pt-1 px-1 select-none">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              My Space
            </h2>
            <span className="text-[10px] text-muted-foreground/80 bg-secondary/60 px-2 py-0.5 rounded-full border border-border/50">
              Personal tracking
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground/80 hidden sm:inline">
            Personal cycle logs &amp; journal
          </span>
        </div>
      )}

      {/* Current Cycle Card with Progress Visualizer & Predictions */}
      <CurrentCycleCard
        currentCycle={currentCycle}
        statusInfo={statusInfo}
        expectedCycleLength={expectedCycleLength}
        expectedNoLaterThanDate={
          estimatedNextPeriod?.windowEndDate || estimatedNextPeriod?.estimatedStartDate || null
        }
      />

      {/* Direct Calendar Placement on Home */}
      <CompactCalendar cycles={cycles} todayStr={todayStr} prediction={estimatedNextPeriod} />

      {/* Quick Actions (Log Period dialog, Calendar, Cycles) */}
      <DashboardQuickActions />

      {/* Dedicated Daily Notes Entry */}
      <HomeNotesCard
        todayStr={todayStr}
        hasActivePartner={cycleContext.partnerInfo.hasActivePartner}
        partnerDisplayName={cycleContext.partnerInfo.displayName}
      />

      {/* Period Insights: Last Period & Next Expected Period */}
      <PeriodInsights
        latestPeriod={latestPeriod}
        estimatedNextPeriod={estimatedNextPeriod}
        onboardingStartDate={onboardingStartDate}
      />

      {/* Daily Observations: Today's Symptoms */}
      <Suspense fallback={<Skeleton className="h-40 rounded-2xl" />}>
        <DailySymptoms userId={user.id} todayStr={todayStr} />
      </Suspense>

      {/* Our Space Relationship Context Card when connected with an active partner */}
      {cycleContext.partnerInfo.hasActivePartner && (
        <RelationshipContextCard
          userDisplayName={displayName}
          userAvatarUrl={profile?.avatar_url || user.user_metadata?.avatar_url || null}
          partnerDisplayName={cycleContext.partnerInfo.displayName || "Partner"}
          partnerUsername={cycleContext.partnerInfo.username}
          partnerAvatarUrl={cycleContext.partnerInfo.avatarUrl}
          relationshipRole={cycleContext.partnerInfo.isOwner ? "owner" : "supporter"}
          relationshipStartDate={cycleContext.partnerInfo.relationshipStartDate}
          affinityDisplayFormat={profile?.affinity_display_format || "detailed"}
          sharedCategoriesCount={cycleContext.permissions.enabledCategories.length}
          totalCategoriesCount={4}
          isCoManagementActive={cycleContext.permissions.managementPermissions.length > 0}
        />
      )}
    </div>
  )
}

async function DailySymptoms({ userId, todayStr }: { userId: string; todayStr: string }) {
  const symptoms = await getSymptomsByDateForUser(userId, todayStr)
  return <TodaySymptomsCard todaySymptoms={symptoms} todayStr={todayStr} />
}
