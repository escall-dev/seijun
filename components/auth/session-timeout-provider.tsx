"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { logoutAction, setSessionLockAction } from "@/app/actions/auth"
import { fetchUserMpinConfiguration, setSessionLocked } from "@/lib/auth/mpin-storage"
import {
  INACTIVITY_TIMEOUT_MS,
  INACTIVITY_WARNING_MS,
  ACTIVITY_THROTTLE_MS,
} from "@/lib/auth/session-timeout-constants"
import { SessionTimeoutModal } from "@/components/auth/session-timeout-modal"

interface SessionTimeoutProviderProps {
  children: React.ReactNode
}

/**
 * Centralized Inactivity Session Timeout Monitor
 *
 * Enforces an exact 10-minute inactivity timeout for authenticated users,
 * with a dynamic 2-minute countdown warning at 8 minutes of inactivity.
 *
 * Resets exclusively on genuine user interactions (throttled to 1s).
 * Protects against background timer throttling by recalculating elapsed
 * duration using actual epoch timestamps on visibility/focus change.
 */
export function SessionTimeoutProvider({ children }: SessionTimeoutProviderProps) {
  const pathname = usePathname()
  const router = useRouter()

  // Track if user is currently authenticated
  const [isAuthenticated, setIsAuthenticated] = React.useState<boolean>(false)

  // Warning modal state
  const [isWarningOpen, setIsWarningOpen] = React.useState<boolean>(false)
  const [remainingMs, setRemainingMs] = React.useState<number>(INACTIVITY_WARNING_MS)

  // Timestamps and guard refs (mutated without triggering re-renders)
  const lastActivityRef = React.useRef<number>(0)
  const lastRecordedActivityRef = React.useRef<number>(0)
  const isLoggingOutRef = React.useRef<boolean>(false)
  const isWarningOpenRef = React.useRef<boolean>(false)
  const currentUserIdRef = React.useRef<string | null>(null)

  // Keep ref in sync for synchronous access inside event listeners
  React.useEffect(() => {
    isWarningOpenRef.current = isWarningOpen
  }, [isWarningOpen])

  // Unauthenticated/auth routes where inactivity monitor should remain dormant
  const isAuthRoute = pathname === "/login" || pathname === "/register"

  // 1. Initial auth detection and subscription
  React.useEffect(() => {
    const supabase = createClient()
    let isMounted = true

    async function checkAuth() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (isMounted) {
          setIsAuthenticated(Boolean(user))
          if (user) {
            currentUserIdRef.current = user.id
            lastActivityRef.current = Date.now()
          } else {
            currentUserIdRef.current = null
          }
        }
      } catch {
        if (isMounted) {
          setIsAuthenticated(false)
          currentUserIdRef.current = null
        }
      }
    }

    checkAuth()

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return
      const hasUser = Boolean(session?.user)
      setIsAuthenticated(hasUser)

      if (hasUser && session?.user) {
        currentUserIdRef.current = session.user.id
        lastActivityRef.current = Date.now()
        isLoggingOutRef.current = false
      } else {
        currentUserIdRef.current = null
        // Clear warning state if user logged out or session disappeared
        setIsWarningOpen(false)
      }
    })

    return () => {
      isMounted = false
      authListener?.subscription.unsubscribe()
    }
  }, [])

  // 2. Perform timeout handling: Lock session with MPIN if configured, otherwise full logout
  const performTimeoutAction = React.useCallback(async () => {
    if (isLoggingOutRef.current) return
    isLoggingOutRef.current = true
    setIsWarningOpen(false)

    const userId = currentUserIdRef.current
    if (userId && await fetchUserMpinConfiguration(userId).catch(() => false)) {
      // User has MPIN: Lock session to MPIN unlock screen, preserving Supabase session
      setSessionLocked(true)
      await setSessionLockAction(true)
      router.push(`/login?redirect=${encodeURIComponent(pathname)}`)
      router.refresh()
      return
    }

    // Fallback: Full logout
    try {
      await logoutAction()
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) {
        return
      }
      try {
        const supabase = createClient()
        await supabase.auth.signOut()
      } catch {
        // Ignore fallback error
      }
      router.push("/login")
      router.refresh()
    }
  }, [pathname, router])

  // 3. User action: "Stay Logged In"
  const handleStayLoggedIn = React.useCallback(() => {
    lastActivityRef.current = Date.now()
    setIsWarningOpen(false)
    setRemainingMs(INACTIVITY_WARNING_MS)
  }, [])

  // 4. Inactivity evaluation logic (based strictly on elapsed timestamp delta)
  const evaluateInactivity = React.useCallback(() => {
    if (!isAuthenticated || isAuthRoute || isLoggingOutRef.current || lastActivityRef.current === 0) {
      return
    }

    const now = Date.now()
    const elapsed = now - lastActivityRef.current
    const remaining = INACTIVITY_TIMEOUT_MS - elapsed

    if (remaining <= 0) {
      // 10 minutes of inactivity reached
      performTimeoutAction()
    } else if (remaining <= INACTIVITY_WARNING_MS) {
      // Within warning window (remaining <= 2 minutes)
      setRemainingMs(remaining)
      if (!isWarningOpenRef.current) {
        setIsWarningOpen(true)
      }
    } else {
      // User is active, ensure warning is closed
      if (isWarningOpenRef.current) {
        setIsWarningOpen(false)
      }
    }
  }, [isAuthenticated, isAuthRoute, performTimeoutAction])

  // 5. Activity listener setup and periodic check timer
  React.useEffect(() => {
    if (!isAuthenticated || isAuthRoute) {
      return
    }

    // Reset baseline timestamp upon activation
    lastActivityRef.current = Date.now()
    lastRecordedActivityRef.current = Date.now()

    // Activity handler throttled to at most once per second
    const handleUserActivity = () => {
      const now = Date.now()

      // Throttle recording to prevent excessive state or ref churn
      if (now - lastRecordedActivityRef.current < ACTIVITY_THROTTLE_MS) {
        return
      }

      lastRecordedActivityRef.current = now
      lastActivityRef.current = now

      // If user interacts while warning modal is active, dismiss and reset
      if (isWarningOpenRef.current) {
        setIsWarningOpen(false)
        setRemainingMs(INACTIVITY_WARNING_MS)
      }
    }

    // Handlers for browser tab visibility and window focus
    // Immediately recalculates elapsed time to avoid background timer throttling
    const handleVisibilityOrFocus = () => {
      evaluateInactivity()
    }

    // Register passive, throttled event listeners for genuine user interactions
    const eventOptions: AddEventListenerOptions = { passive: true, capture: true }
    const activityEvents = [
      "pointermove",
      "pointerdown",
      "keydown",
      "touchstart",
      "scroll",
      "wheel",
    ] as const

    activityEvents.forEach((eventType) => {
      window.addEventListener(eventType, handleUserActivity, eventOptions)
    })

    document.addEventListener("visibilitychange", handleVisibilityOrFocus)
    window.addEventListener("focus", handleVisibilityOrFocus)

    // Periodic evaluation interval (every 1 second)
    const intervalId = setInterval(() => {
      evaluateInactivity()
    }, 1000)

    return () => {
      activityEvents.forEach((eventType) => {
        window.removeEventListener(eventType, handleUserActivity, eventOptions)
      })
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus)
      window.removeEventListener("focus", handleVisibilityOrFocus)
      clearInterval(intervalId)
    }
  }, [isAuthenticated, isAuthRoute, evaluateInactivity])

  return (
    <>
      {children}

      {/* Accessible Session Timeout Warning Modal */}
      <SessionTimeoutModal
        isOpen={isWarningOpen && isAuthenticated && !isAuthRoute}
        remainingMs={remainingMs}
        onStayLoggedIn={handleStayLoggedIn}
      />
    </>
  )
}
