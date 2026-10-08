"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { type CycleContextMode, type CycleContextState, CYCLE_CONTEXT_COOKIE_NAME } from "./types"
import { getCycleContextAction, setCycleContextAction } from "@/app/actions/cycle-context"

interface CycleContextValue {
  context: CycleContextState
  isLoading: boolean
  switchContext: (mode: CycleContextMode) => Promise<void>
  refreshContext: () => Promise<void>
}

const defaultContextState: CycleContextState = {
  mode: "own",
  isPartnerContext: false,
  isOwnContext: true,
  activeUserId: "",
  currentUserId: "",
  usageRole: null,
  partnerInfo: {
    partnerUserId: null,
    displayName: null,
    username: null,
    relationshipId: null,
    hasActivePartner: false,
    isSupporter: false,
    isOwner: false,
  },
  permissions: {
    enabledCategories: [],
    managementPermissions: [],
    canManagePeriod: false,
    canManageCyclePrefs: false,
    canManageDailyNotes: false,
    hasCycleEstimates: false,
    hasPeriodStatus: false,
    hasDailyNotes: false,
    hasCyclePreferences: false,
  },
  canSwitchContext: false,
}

const CycleReactContext = React.createContext<CycleContextValue | null>(null)

export interface CycleContextProviderProps {
  children: React.ReactNode
  initialState?: CycleContextState | null
}

export function CycleContextProvider({
  children,
  initialState,
}: CycleContextProviderProps) {
  const router = useRouter()
  const [context, setContext] = React.useState<CycleContextState>(
    initialState || defaultContextState
  )
  const [isLoading, setIsLoading] = React.useState(!initialState)
  const lastFetchedRef = React.useRef<number>(0)

  const refreshContext = React.useCallback(async (force = false) => {
    const now = Date.now()
    if (!force && now - lastFetchedRef.current < 30000) {
      return
    }
    lastFetchedRef.current = now
    try {
      const fresh = await getCycleContextAction()
      if (fresh) {
        setContext(fresh)
      }
    } catch {
      // Non-blocking
    } finally {
      setIsLoading(false)
    }
  }, [])

  React.useEffect(() => {
    // Initial fetch if not provided or to ensure freshness
    lastFetchedRef.current = initialState ? Date.now() : 0
    if (!initialState) setTimeout(() => void refreshContext(true), 0)

    const handleFocus = () => {
      refreshContext(false)
    }
    const handleContextEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ mode: CycleContextMode }>
      if (customEvent.detail?.mode) {
        setContext((prev) => ({
          ...prev,
          mode: customEvent.detail.mode,
          isPartnerContext: customEvent.detail.mode === "partner",
          isOwnContext: customEvent.detail.mode === "own",
          activeUserId:
            customEvent.detail.mode === "partner" && prev.partnerInfo.partnerUserId
              ? prev.partnerInfo.partnerUserId
              : prev.currentUserId,
        }))
      }
      refreshContext()
    }

    window.addEventListener("focus", handleFocus)
    window.addEventListener("seijun:cycle-context-changed", handleContextEvent)

    return () => {
      window.removeEventListener("focus", handleFocus)
      window.removeEventListener("seijun:cycle-context-changed", handleContextEvent)
    }
  }, [refreshContext, initialState])

  const switchContext = React.useCallback(
    async (mode: CycleContextMode) => {
      // 1. Optimistic local update
      setContext((prev) => ({
        ...prev,
        mode,
        isPartnerContext: mode === "partner",
        isOwnContext: mode === "own",
        activeUserId:
          mode === "partner" && prev.partnerInfo.partnerUserId
            ? prev.partnerInfo.partnerUserId
            : prev.currentUserId,
      }))

      // 2. Set document cookie immediately for instant client/server sync
      try {
        document.cookie = `${CYCLE_CONTEXT_COOKIE_NAME}=${mode}; path=/; max-age=31536000; SameSite=Lax`
      } catch {
        // Fallback
      }

      // 3. Inform other components in current window
      window.dispatchEvent(
        new CustomEvent("seijun:cycle-context-changed", { detail: { mode } })
      )

      // 4. Server cookie synchronization
      try {
        await setCycleContextAction(mode)
      } catch {
        // Non-blocking
      }

      // 5. Refresh current route so server components re-render with new context
      router.refresh()
    },
    [router]
  )

  const value = React.useMemo<CycleContextValue>(
    () => ({
      context,
      isLoading,
      switchContext,
      refreshContext,
    }),
    [context, isLoading, switchContext, refreshContext]
  )

  return (
    <CycleReactContext.Provider value={value}>
      {children}
    </CycleReactContext.Provider>
  )
}

export function useCycleContext(): CycleContextValue {
  const ctx = React.useContext(CycleReactContext)
  if (!ctx) {
    return {
      context: defaultContextState,
      isLoading: false,
      switchContext: async () => {},
      refreshContext: async () => {},
    }
  }
  return ctx
}
