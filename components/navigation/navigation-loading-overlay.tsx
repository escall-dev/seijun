"use client"

import * as React from "react"
import { SeijunSpinner } from "@/components/ui/seijun-spinner"
import { useNavigationLoading } from "@/components/navigation/navigation-loading-context"
import { cn } from "@/lib/utils"

/**
 * Global Navigation Loading Overlay
 *
 * Appears during slow route transitions (> 200ms threshold) to communicate
 * immediate responsiveness without interfering with fast/instant navigations.
 *
 * Implements WAI-ARIA role="status", aria-live="polite", and aria-busy="true"
 * with complete support for light/dark themes, safe-area padding, and PWA viewports.
 */
export function NavigationLoadingOverlay() {
  const { isLoading } = useNavigationLoading()
  const mounted = React.useSyncExternalStore(() => () => {}, () => true, () => false)

  if (!mounted || !isLoading) {
    return null
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading page content"
      className={cn(
        "fixed bottom-24 right-4 z-[100] pointer-events-none",
        "max-w-full",
        "",
        "",
        "animate-in fade-in duration-150 select-none cursor-wait"
      )}
    >
      {/* Centered elevated floating card matching Seijun design system */}
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-3 px-4 py-3 rounded-3xl",
          "bg-card/95 dark:bg-card/95 border border-border/80",
          "shadow-xl shadow-primary/5 dark:shadow-[0_12px_36px_rgba(0,0,0,0.6)]"
        )}
      >
        {/* Purple & White Circular Spinner */}
        <SeijunSpinner size="sm" aria-hidden="true" />

        {/* Text Label */}
        <span className="text-sm font-medium tracking-tight text-foreground select-none">
          Loading...
        </span>

        {/* Assistive Technology Description */}
        <span className="sr-only">Navigating to page, please wait</span>
      </div>
    </div>
  )
}
