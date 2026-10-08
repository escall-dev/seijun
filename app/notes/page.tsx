import { createClient, getAuthenticatedUser } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { loadNotesPage } from "@/lib/notes/server"
import Link from "next/link"
import { getServerUserProfile } from "@/lib/server/profile"
import { NotesHistory } from "@/components/notes/notes-history"
import { Badge } from "@/components/ui/badge"
import { BookOpen, Users } from "lucide-react"
import { resolveServerCycleContext } from "@/lib/cycle-context/server"
import { CycleContextSwitcher } from "@/components/cycle-context/cycle-context-switcher"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Daily Notes",
  description: "Private personal daily reflections and journal entries.",
}

export default async function NotesPage({ searchParams }: { searchParams: Promise<{ view?: string; tab?: string }> }) {
  const query = await searchParams
  const user = await getAuthenticatedUser()

  if (!user) {
    redirect("/login?redirect=" + encodeURIComponent(query.view === "partner" ? "/notes?view=partner" : query.tab === "partner" ? "/notes?tab=partner" : "/notes"))
  }

  const supabase = await createClient()
  const cycleContext = await resolveServerCycleContext(supabase, user.id, query.view === "partner" ? "partner" : undefined)

  // In partner context when daily notes are not shared, redirect to partner dashboard
  if (cycleContext.isPartnerContext && !cycleContext.permissions.hasDailyNotes) {
    redirect("/partner")
  }

  const targetUserId = cycleContext.isPartnerContext
    ? cycleContext.activeUserId
    : user.id

  const snapshot = new Date().toISOString()
  const [profile, ownPage, partnerPage] = await Promise.all([
    getServerUserProfile(user.id),
    loadNotesPage(targetUserId, cycleContext.isPartnerContext ? "all" : "own", null, snapshot),
    cycleContext.isPartnerContext ? Promise.resolve(null) : loadNotesPage(targetUserId, "partner", null, snapshot),
  ])

  if (profile && profile.onboarding_completed === false) {
    redirect("/onboarding")
  }

  // When viewing own cycle, distinguish own personal notes from notes contributed by authorized partner
  const ownNotes = ownPage.notes
  const partnerNotes = partnerPage?.notes ?? []

  return (
    <div className="space-y-6 pb-8">
      {/* Context Switcher for dual-role users */}
      {cycleContext.canSwitchContext && <CycleContextSwitcher />}

      <Link href="/dashboard" prefetch={true} className="text-sm font-semibold text-primary">Back to Home</Link>
      {/* Page Header */}
      <div className="space-y-1 max-w-2xl mx-auto">
        <div className="flex items-center gap-2">
          <Badge variant="lavender" className="gap-1 font-normal text-xs">
            {cycleContext.isPartnerContext ? (
              <>
                <Users className="size-3 text-primary" />
                Partner&apos;s Notes
              </>
            ) : (
              <>
                <BookOpen className="size-3 text-primary" />
                Daily Notes
              </>
            )}
          </Badge>
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
          {cycleContext.isPartnerContext
            ? `${cycleContext.partnerInfo.displayName || "Partner"}'s Notes`
            : "Daily Notes"}
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {cycleContext.isPartnerContext
            ? `Daily reflections and notes recorded for ${cycleContext.partnerInfo.displayName || "your partner"}'s cycle.`
            : "Your notes and partner messages. Shared notes are sent as immutable versions; add a new note to revise a message."}
        </p>
      </div>

      {/* Main Notes Timeline View */}
      {ownPage.migrationRequired && <p role="status" className="max-w-2xl mx-auto rounded-xl border border-border p-3 text-sm text-muted-foreground">Your existing notes are available. Notes are temporarily read-only while the app update completes.</p>}
      <NotesHistory
        initialTab={query.tab === "partner" ? "partner" : "own"}
        key={`${user.id}-${targetUserId}-${snapshot}`}
        notes={ownNotes}
        ownCursor={ownPage.nextCursor}
        partnerCursor={partnerPage?.nextCursor ?? null}
        snapshot={snapshot}
        partnerNotes={partnerNotes}
        isPartnerContext={cycleContext.isPartnerContext}
        hasActivePartner={cycleContext.partnerInfo.hasActivePartner}
        partnerDisplayName={cycleContext.partnerInfo.displayName || "Partner"}
        partnerUserId={cycleContext.partnerInfo.partnerUserId}
        canManage={!ownPage.migrationRequired && (
          cycleContext.isPartnerContext
            ? cycleContext.permissions.canManageDailyNotes
            : true
        )}
        currentUserId={user.id}
      />
    </div>
  )
}
