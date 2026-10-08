import { createClient, getAuthenticatedUser } from "@/lib/supabase/server"
import { getServerUserProfile } from "@/lib/server/profile"
import { redirect } from "next/navigation"
import { getCyclesForUser } from "@/app/actions/cycles"
import { getSymptomsForUser } from "@/app/actions/symptoms"
import { getDailyNotesForUser } from "@/app/actions/notes"
import { CalendarView } from "@/components/calendar/calendar-view"
import { Badge } from "@/components/ui/badge"
import { CalendarDays, HeartHandshake } from "lucide-react"
import { resolveServerCycleContext } from "@/lib/cycle-context/server"
import { CycleContextSwitcher } from "@/components/cycle-context/cycle-context-switcher"
import { Card, CardContent } from "@/components/ui/card"
import Link from "next/link"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Calendar",
  description: "View and explore menstrual cycle timeline and period tracking history.",
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams
  const initialDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined
  const user = await getAuthenticatedUser()

  if (!user) {
    redirect("/login")
  }

  const supabase = await createClient()

  // 1. Resolve authoritative cycle context
  const cycleContext = await resolveServerCycleContext(supabase, user.id)

  const profile = await getServerUserProfile(user.id)

  if (profile && profile.onboarding_completed === false) {
    redirect("/onboarding")
  }

  // ─── PARTNER CONTEXT ────────────────────────────────────────────────────────
  if (cycleContext.isPartnerContext) {
    if (!cycleContext.partnerInfo.hasActivePartner) {
      return (
        <div className="space-y-6 pb-8 max-w-2xl mx-auto">
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
              Partner Calendar
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Connect with a partner to view their shared menstrual calendar.
            </p>
          </div>
          <Card className="border-border/60">
            <CardContent className="flex flex-col items-center justify-center py-12 gap-3 text-center">
              <HeartHandshake className="size-8 text-primary" />
              <p className="text-sm font-semibold">No Partner Connection</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Connect with your partner in settings to view their shared calendar.
              </p>
              <Link
                href="/settings/partner"
                className="inline-flex items-center justify-center h-9 px-4 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 mt-2"
              >
                Partner Settings
              </Link>
            </CardContent>
          </Card>
        </div>
      )
    }

    const partnerName = cycleContext.partnerInfo.displayName || "Partner"
    const canViewCycles =
      cycleContext.permissions.hasCycleEstimates || cycleContext.permissions.hasPeriodStatus
    const canViewNotes = cycleContext.permissions.hasDailyNotes

    const [partnerCycles, partnerNotes] = await Promise.all([
      canViewCycles ? getCyclesForUser(cycleContext.activeUserId, supabase) : Promise.resolve([]),
      canViewNotes ? getDailyNotesForUser(cycleContext.activeUserId, supabase) : Promise.resolve([]),
    ])

    return (
      <div className="space-y-6 pb-8 max-w-4xl mx-auto">
        {/* Context Switcher for dual-role users */}
        {cycleContext.canSwitchContext && <CycleContextSwitcher />}

        {/* Page Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="lavender" className="gap-1 font-normal text-xs">
              <CalendarDays className="size-3 text-primary" />
              Partner Calendar
            </Badge>
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              {partnerName}&apos;s Cycle
            </Badge>
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
            {partnerName}&apos;s Calendar
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Menstrual cycle timeline and shared period history for {partnerName}.
          </p>
        </div>

        {/* Main Calendar View configured for Partner Display */}
        <CalendarView initialDate={initialDate}
          cycles={partnerCycles}
          symptoms={[]}
          notes={partnerNotes}
          isPartnerView={true}
          partnerDisplayName={partnerName}
        />
      </div>
    )
  }

  // ─── OWN CONTEXT ───────────────────────────────────────────────────────────
  const [cycles, symptoms, notes] = await Promise.all([
    getCyclesForUser(user.id, supabase),
    getSymptomsForUser(user.id, supabase),
    getDailyNotesForUser(user.id, supabase),
  ])

  return (
    <div className="space-y-6 pb-8 max-w-4xl mx-auto">
      {/* Context Switcher for dual-role users */}
      {cycleContext.canSwitchContext && <CycleContextSwitcher />}

      {/* Page Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Badge variant="lavender" className="gap-1 font-normal text-xs">
            <CalendarDays className="size-3" />
            Calendar
          </Badge>
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
          Calendar
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Menstrual cycle timeline and period tracking history.
        </p>
      </div>

      {/* Main Interactive Calendar View */}
      <CalendarView initialDate={initialDate} cycles={cycles} symptoms={symptoms} notes={notes} />
    </div>
  )
}
