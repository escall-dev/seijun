"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { RediBrand } from "@/components/brand/redi-brand"
import { NAV_ITEMS } from "@/components/shell/app-nav-items"
import { useQuickLog } from "@/components/shell/quick-log-context"
import { useCycleContext } from "@/lib/cycle-context/cycle-context"
import { CycleContextSwitcher } from "@/components/cycle-context/cycle-context-switcher"
import { useRouter } from "next/navigation"
import { ThemeToggle } from "@/components/theme/theme-toggle"
import { Avatar } from "@/components/ui/avatar"
import { useUserProfile } from "@/lib/hooks/use-user-profile"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { AddPartnerModal } from "@/components/partner/add-partner-modal"
import { Plus, User, UserPlus, Droplets, BookOpen } from "lucide-react"

export function DesktopHeader() {
  const pathname = usePathname()
  const router = useRouter()
  const { openQuickLog, canQuickLog } = useQuickLog()
  const { context } = useCycleContext()
  const { isPartnerContext, canSwitchContext } = context
  const [addPartnerOpen, setAddPartnerOpen] = React.useState(false)
  const { avatarUrl, displayName } = useUserProfile()

  // Dynamic context-aware navigation items
  const homeItem = {
    ...NAV_ITEMS[0],
    label: isPartnerContext ? "Partner" : "Home",
  }
  const calendarItem = {
    ...NAV_ITEMS[1],
    label: isPartnerContext ? "Partner Calendar" : "Calendar",
  }
  const historyItem = isPartnerContext
    ? {
        label: "Partner Notes",
        href: "/notes",
        icon: BookOpen,
      }
    : NAV_ITEMS[2] // History
  const settingsItem = NAV_ITEMS[3] // Settings

  const renderLink = (item: { label: string; href: string; icon: import("lucide-react").LucideIcon }) => {
    const Icon = item.icon
    const isActive =
      pathname === item.href ||
      (item.href !== "/dashboard" && pathname.startsWith(item.href))

    return (
      <Link
        key={item.href}
        href={item.href}
        prefetch={true}
        className={cn(
          "flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition-all duration-150 select-none",
          isActive
            ? "bg-lavender text-lavender-foreground shadow-xs border border-lavender-border/70"
            : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
        )}
      >
        <Icon className={cn("size-4", isActive ? "text-primary" : "text-muted-foreground")} />
        <span>{item.label}</span>
      </Link>
    )
  }

  return (
    <header className="hidden sm:block sticky top-0 z-40 w-full bg-background/85 backdrop-blur-md transition-all">
      <div className="mx-auto flex h-16 w-full max-w-4xl items-center justify-between px-6">
        {/* Brand & Optional Context Switcher */}
        <div className="flex items-center gap-4">
          <RediBrand size="md" />
          {canSwitchContext && (
            <CycleContextSwitcher compact className="hidden md:flex" />
          )}
        </div>

        {/* Navigation Menu: Centered Soft Pill */}
        <nav className="flex items-center gap-1 rounded-full border border-border/70 bg-card/60 p-1 shadow-xs backdrop-blur-xs">
          {/* 1. Home / Partner */}
          {renderLink(homeItem)}

          {/* 2. Calendar / Partner Calendar */}
          {renderLink(calendarItem)}

          {/* 3. Center Action Button: Log Period or Manage Period */}
          {canQuickLog && (
            <button
              type="button"
              onClick={openQuickLog}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-150 select-none shadow-xs active:scale-95 cursor-pointer",
                isPartnerContext
                  ? "bg-rose-600 hover:bg-rose-700 text-white shadow-rose-500/20"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              )}
            >
              {isPartnerContext ? (
                <Droplets className="size-3.5" />
              ) : (
                <Plus className="size-3.5 stroke-[2.5]" />
              )}
              <span>{isPartnerContext ? "Manage Period" : "Log Period"}</span>
            </button>
          )}

          {/* 4. History / Partner Notes */}
          {!isPartnerContext && renderLink({ label: "Notes", href: "/notes", icon: BookOpen })}
          {renderLink(historyItem)}

          {/* 5. Settings */}
          {renderLink(settingsItem)}
        </nav>

        {/* Right Action: Theme Toggle, Notifications, Profile & Quick Add Partner */}
        <div className="flex items-center gap-2">
          {/* Quick Theme Toggle */}
          <ThemeToggle />

          {/* Dynamic In-App Notification Center */}
          <NotificationBell />

          {/* Profile Avatar Link */}
          <Link
            href="/settings/profile"
            prefetch={true}
            aria-label="User Profile Details"
            title="User Profile"
            className={cn(
              "size-9 rounded-2xl border flex items-center justify-center text-primary transition-all active:scale-95 shadow-xs overflow-hidden",
              pathname === "/settings/profile"
                ? "bg-lavender text-lavender-foreground border-lavender-border ring-2 ring-primary/40 shadow-xs"
                : "bg-secondary/70 hover:bg-secondary border-border/50"
            )}
          >
            {avatarUrl ? (
              <Avatar
                src={avatarUrl}
                alt={displayName || "Profile"}
                fallbackInitials={displayName}
                size="sm"
                className="size-7 border-0 shadow-none bg-transparent"
              />
            ) : (
              <User className="size-4 stroke-[2.2]" />
            )}
          </Link>

          {/* Quick Add Partner / Friend Button */}
          <button
            type="button"
            onClick={() => setAddPartnerOpen(true)}
            aria-label="Add Partner or Friend"
            title="Add Partner or Friend"
            className="size-9 rounded-2xl bg-secondary/70 hover:bg-secondary border border-border/50 flex items-center justify-center text-primary transition-all active:scale-95 shadow-xs"
          >
            <UserPlus className="size-4 stroke-[2.2]" />
          </button>
        </div>
      </div>

      {/* Quick Add Partner Dialog */}
      <AddPartnerModal
        open={addPartnerOpen}
        onOpenChange={setAddPartnerOpen}
        onInvitationSent={() => router.refresh()}
      />
    </header>
  )
}
