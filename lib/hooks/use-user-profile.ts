"use client"

import * as React from "react"
import { createClient } from "@/lib/supabase/client"

export interface UserProfileState {
  userId: string | null
  displayName: string | null
  avatarUrl: string | null
  isLoading: boolean
}

const UserProfileContext = React.createContext<UserProfileState | null>(null)

export interface UserProfileProviderProps {
  children: React.ReactNode
  initialState?: UserProfileState
}

/**
 * Shell-level provider that resolves user profile once and shares state across
 * DesktopHeader, MobileHeader, MobileBottomNav, and child page components.
 */
export function UserProfileProvider({ children, initialState }: UserProfileProviderProps) {
  const [state, setState] = React.useState<UserProfileState>(initialState ?? {
    userId: null,
    displayName: null,
    avatarUrl: null,
    isLoading: true,
  })

  React.useEffect(() => {
    let isMounted = true
    const supabase = createClient()

    let generation = 0
    let activeUserId = initialState?.userId ?? null
    async function fetchProfile() {
      const currentGeneration = ++generation
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
          if (isMounted && currentGeneration === generation) {
            setState({ userId: null, displayName: null, avatarUrl: null, isLoading: false })
          }
          return
        }

        if (currentGeneration !== generation) return
        activeUserId = user.id
        // Fast metadata initial state
        const metaName = user.user_metadata?.display_name || null
        const rawMetaAvatar = user.user_metadata?.avatar_url || null
        const cleanMetaAvatar = rawMetaAvatar && !rawMetaAvatar.startsWith("preset:") ? rawMetaAvatar : null

        if (isMounted && currentGeneration === generation) {
          setState({
            userId: user.id,
            displayName: metaName,
            avatarUrl: cleanMetaAvatar,
            isLoading: false,
          })
        }

        // Fetch fresh database record
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name, avatar_url")
          .eq("user_id", user.id)
          .single()

        if (isMounted && currentGeneration === generation && profile) {
          const rawDbAvatar = profile.avatar_url || cleanMetaAvatar
          const cleanAvatar = rawDbAvatar && !rawDbAvatar.startsWith("preset:") ? rawDbAvatar : null

          setState({
            userId: user.id,
            displayName: profile.display_name || metaName,
            avatarUrl: cleanAvatar,
            isLoading: false,
          })
        }
      } catch {
        if (isMounted && currentGeneration === generation) {
          setState((prev) => ({ ...prev, isLoading: false }))
        }
      }
    }

    if (!initialState) void fetchProfile()

    // Listen for auth state change
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      const nextId = session?.user.id ?? null
      if (nextId !== activeUserId) {
        activeUserId = nextId
        generation++
        setState({ userId: nextId, displayName: null, avatarUrl: null, isLoading: Boolean(nextId) })
        // Leave auth callback before calling auth APIs (avoids auth lock contention).
        setTimeout(() => void fetchProfile(), 0)
      } else if (event === "USER_UPDATED") setTimeout(() => void fetchProfile(), 0)
    })

    // Listen for instant local profile updates
    const handleProfileUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ avatarUrl?: string; displayName?: string }>
      if (customEvent.detail) {
        if (isMounted) {
          setState((prev) => ({
            ...prev,
            ...(customEvent.detail.avatarUrl ? { avatarUrl: customEvent.detail.avatarUrl } : {}),
            ...(customEvent.detail.displayName ? { displayName: customEvent.detail.displayName } : {}),
          }))
        }
      } else {
        fetchProfile()
      }
    }

    window.addEventListener("seijun:profile-updated", handleProfileUpdate)

    return () => {
      isMounted = false
      authListener?.subscription.unsubscribe()
      window.removeEventListener("seijun:profile-updated", handleProfileUpdate)
    }
  }, [initialState])

  return React.createElement(UserProfileContext.Provider, { value: state }, children)
}

/**
 * Consumes the shell-level unified user profile state.
 * If invoked outside of UserProfileProvider, safely falls back to a standalone state.
 */
export function useUserProfile(): UserProfileState {
  const context = React.useContext(UserProfileContext)
  if (context) {
    return context
  }

  // Fallback for standalone usage outside of shell
  return {
    userId: null,
    displayName: null,
    avatarUrl: null,
    isLoading: false,
  }
}

