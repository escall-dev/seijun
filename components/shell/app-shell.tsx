"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { DesktopHeader } from "@/components/shell/desktop-header"
import { MobileHeader } from "@/components/shell/mobile-header"
import { MobileBottomNav } from "@/components/shell/mobile-bottom-nav"
import { QuickLogProvider } from "@/components/shell/quick-log-context"
import { CycleContextProvider } from "@/lib/cycle-context/cycle-context"
import { SessionTimeoutProvider } from "@/components/auth/session-timeout-provider"
import type { CycleContextState } from "@/lib/cycle-context/types"
import { useRouter } from "next/navigation"
import { UserProfileProvider, useUserProfile } from "@/lib/hooks/use-user-profile"
import { RealtimeNotificationProvider } from "@/components/notifications/realtime-notification-provider"
import { cn } from "@/lib/utils"

interface AppShellProps {
  children: React.ReactNode
  initialContext?: CycleContextState | null
  className?: string
}

export function AppShell({ children, className, initialContext }: AppShellProps) {
  const pathname = usePathname()
  const isAuthRoute =
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/onboarding"

  return (
    <SessionTimeoutProvider>
      {isAuthRoute ? (
        pathname === "/login" ? (
          <div className="relative h-dvh flex flex-col bg-background text-foreground overflow-x-clip">
            <main className="w-full flex-1 flex flex-col min-h-0">{children}</main>
          </div>
        ) : (
          <div className="relative min-h-screen min-h-dvh flex flex-col items-center justify-center bg-background text-foreground px-4 py-8 sm:px-6 overflow-x-clip pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
            <main className="w-full max-w-md mx-auto">{children}</main>
          </div>
        )
      ) : (
        <UserProfileProvider key={initialContext?.currentUserId ?? "anonymous"} initialState={initialContext ? { userId: initialContext.currentUserId, displayName: initialContext.currentUserInfo?.displayName ?? null, avatarUrl: initialContext.currentUserInfo?.avatarUrl ?? null, isLoading: false } : undefined}>
          <AccountContent expectedUserId={initialContext?.currentUserId ?? null}>
          <CycleContextProvider key={`${initialContext?.currentUserId}-${initialContext?.mode}-${initialContext?.activeUserId}-${initialContext?.partnerInfo.relationshipId}-${initialContext?.permissions.enabledCategories.join(",")}-${initialContext?.permissions.managementPermissions.join(",")}`} initialState={initialContext}>
          <QuickLogProvider>
              <RealtimeNotificationProvider>
                <div className="relative min-h-screen min-h-dvh flex flex-col bg-background text-foreground overflow-x-clip">
                  {/* Desktop Header */}
                  <DesktopHeader />

                  {/* Mobile Top Header */}
                  <MobileHeader />

                  {/* Main Content Area */}
                  <main
                    className={cn(
                      "flex-1 w-full max-w-4xl mx-auto px-4 py-6 sm:px-6 sm:py-8 pb-24 sm:pb-12 transition-all",
                      className
                    )}
                  >
                    {children}
                  </main>
                </div>

                {/* Mobile Bottom Navigation - placed outside container to stick reliably to viewport */}
                <MobileBottomNav />
              </RealtimeNotificationProvider>
          </QuickLogProvider>
        </CycleContextProvider>
        </AccountContent>
        </UserProfileProvider>
      )}
    </SessionTimeoutProvider>
  )
}

function AccountContent({ expectedUserId, children }: { expectedUserId: string | null; children: React.ReactNode }) {
  const { userId } = useUserProfile()
  const router = useRouter()
  React.useEffect(() => { if (userId !== expectedUserId) router.refresh() }, [userId, expectedUserId, router])
  if (userId !== expectedUserId) return <p role="status" className="p-6 text-sm text-muted-foreground">Loading your account…</p>
  return children
}
