"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { NAV_ITEMS } from "@/components/shell/app-nav-items"
import { useQuickLog } from "@/components/shell/quick-log-context"
import { useCycleContext } from "@/lib/cycle-context/cycle-context"
import { Plus, Droplets, BookOpen, HeartHandshake } from "lucide-react"

export function MobileBottomNav() {
  const pathname = usePathname()
  const { openQuickLog, canQuickLog } = useQuickLog()
  const { context } = useCycleContext()
  const { isPartnerContext } = context

  const mounted = React.useSyncExternalStore(
    (cb) => { window.addEventListener("focus", cb); return () => window.removeEventListener("focus", cb) },
    () => true,
    () => false
  )

  const homeItem = {
    ...NAV_ITEMS[0],
    label: isPartnerContext ? "Partner" : "Home",
  }
  const calendarItem = {
    ...NAV_ITEMS[1],
    label: isPartnerContext ? "Calendar" : "Calendar",
  }
  const historyItem = isPartnerContext
    ? {
        label: "Notes",
        href: "/notes",
        icon: BookOpen,
      }
    : { label: "Notes", href: "/notes", icon: BookOpen }
  const settingsItem = NAV_ITEMS.find(item => item.href === "/settings")! // Settings

  const renderNavLink = (item: { label: string; href: string; icon: import("lucide-react").LucideIcon }) => {
    const Icon = item.icon
    const isActive =
      mounted &&
      (pathname === item.href ||
        (item.href !== "/dashboard" && pathname.startsWith(item.href)))

    return (
      <Link
        key={item.href}
        href={item.href}
        prefetch={true}
        className={cn(
          "relative flex min-h-[48px] w-full flex-col items-center justify-center pt-2 pb-1 transition-all select-none active:scale-95",
          isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
        )}
      >
        {/* Active Indicator: 2px bar at top edge as per guideline */}
        <div
          aria-hidden="true"
          className={cn(
            "absolute top-0 h-[2px] w-5 rounded-full transition-all duration-200",
            isActive ? "bg-primary opacity-100 scale-x-100" : "bg-transparent opacity-0 scale-x-50"
          )}
        />

        {/* Icon: 24px size as per guideline */}
        <div className="flex items-center justify-center">
          <Icon
            className={cn(
              "size-6 transition-all duration-200",
              isActive ? "text-primary stroke-[2.2]" : "text-muted-foreground stroke-[1.8]"
            )}
          />
        </div>

        {/* Font Size: 12px label as per guideline */}
        <span
          className={cn(
            "text-[12px] leading-tight tracking-tight transition-colors mt-0.5",
            isActive ? "font-semibold text-primary" : "font-normal text-muted-foreground"
          )}
        >
          {item.label}
        </span>
      </Link>
    )
  }

  return (
    <nav
      aria-label="Mobile Navigation"
      className="fixed bottom-0 left-0 right-0 z-50 block border-t border-border/70 bg-card/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-0 shadow-[0_-4px_16px_rgba(76,45,115,0.05)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.5)] backdrop-blur-md sm:hidden overflow-visible"
    >
      <div className="grid grid-cols-5 items-center justify-items-center px-1 w-full max-w-md mx-auto">
        {/* 1. Home / Partner */}
        {renderNavLink(homeItem)}

        {/* 2. Calendar */}
        {renderNavLink(calendarItem)}

        {/* 3. Center Action Button */}
        <div className="relative flex flex-col items-center justify-end w-full">
          {canQuickLog ? (
            <button
              type="button"
              onClick={openQuickLog}
              aria-label={isPartnerContext ? "Manage Period" : "Log Period"}
              className="group relative flex flex-col items-center justify-center select-none active:scale-95 transition-all -mt-9 focus:outline-none cursor-pointer"
            >
              {/* 72px Outer Clearance / Halo */}
              <div className="flex size-[72px] items-center justify-center rounded-full bg-card/95 backdrop-blur-md border border-border/70 shadow-[0_-2px_12px_rgba(76,45,115,0.06)] dark:shadow-[0_-2px_12px_rgba(0,0,0,0.6)]">
                {/* 52px Inner Action Button */}
                <div
                  className={cn(
                    "flex size-[52px] items-center justify-center rounded-full text-white transition-all group-hover:scale-105",
                    isPartnerContext
                      ? "bg-rose-600 shadow-[0_6px_18px_rgba(225,29,72,0.35)]"
                      : "bg-primary shadow-[0_6px_18px_rgba(76,45,115,0.28)]"
                  )}
                >
                  {isPartnerContext ? (
                    <Droplets className="size-6" />
                  ) : (
                    <Plus className="size-6 stroke-[2.5]" />
                  )}
                </div>
              </div>
              <span
                className={cn(
                  "text-[12px] leading-tight tracking-tight font-medium mt-1",
                  isPartnerContext ? "text-rose-600 dark:text-rose-400 font-semibold" : "text-primary"
                )}
              >
                {isPartnerContext ? "Manage" : "Log"}
              </span>
            </button>
          ) : isPartnerContext ? (
            /* Supporter without manage permissions: link to Partner page instead of fake log button */
            <Link
              href="/partner"
              prefetch={true}
              aria-label="Partner Dashboard"
              className="group relative flex flex-col items-center justify-center select-none active:scale-95 transition-all -mt-9 focus:outline-none"
            >
              <div className="flex size-[72px] items-center justify-center rounded-full bg-card/95 backdrop-blur-md border border-border/70 shadow-[0_-2px_12px_rgba(76,45,115,0.06)] dark:shadow-[0_-2px_12px_rgba(0,0,0,0.6)]">
                <div className="flex size-[52px] items-center justify-center rounded-full bg-lavender text-primary border border-lavender-border/80 shadow-xs group-hover:scale-105 transition-all">
                  <HeartHandshake className="size-6" />
                </div>
              </div>
              <span className="text-[12px] leading-tight tracking-tight font-medium text-primary mt-1">
                Partner
              </span>
            </Link>
          ) : (
            <div className="h-12 w-full" />
          )}
        </div>

        {/* 4. History / Notes */}
        {renderNavLink(historyItem)}

        {/* 5. Settings */}
        {renderNavLink(settingsItem)}
      </div>
    </nav>
  )
}
