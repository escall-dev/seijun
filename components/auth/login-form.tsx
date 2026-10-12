"use client"

import * as React from "react"
import Link from "next/link"
import { useSearchParams, useRouter } from "next/navigation"
import { loginAction, setSessionLockAction, setMpinSetupPendingAction, type AuthActionResult } from "@/app/actions/auth"
import { getMpinStatusAction, lockMpinAction } from "@/app/actions/mpin"
import { createClient } from "@/lib/supabase/client"
import {
  isSessionLocked,
  setSessionLocked,
  setRememberedUser,
  clearRememberedUser,
  retireLegacyMpin,
  hasDeviceMpin,
  setRememberDeviceEnabled,
  setMpinRememberMeEnabled,
} from "@/lib/auth/mpin-storage"
import { MpinReturningForm, type MpinReturningUser } from "@/components/auth/mpin-returning-form"
import { MpinSetupForm } from "@/components/auth/mpin-setup-form"
import { RediLogo } from "@/components/brand/redi-logo"
import { SeijunMeadow } from "@/components/brand/seijun-meadow"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Eye, EyeOff, AlertCircle, CheckCircle2, Loader2 } from "lucide-react"
import { InstallAppButton } from "@/components/pwa/install-app-button"

export interface LoginFormProps {
  version?: string
}

type AuthViewMode = "loading" | "returning-mpin" | "setup-mpin" | "email-password"

function subscribeToLocalStorage(callback: () => void) {
  window.addEventListener("storage", callback)
  return () => window.removeEventListener("storage", callback)
}

function getRememberedEmailSnapshot(): string {
  try {
    return localStorage.getItem("seijun_remembered_email") || ""
  } catch {
    return ""
  }
}

function getServerRememberedEmailSnapshot(): string {
  return ""
}

function formatDisplayName(name?: string | null): string {
  if (!name) return ""
  const trimmed = name.trim()
  if (!trimmed) return ""
  return trimmed
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ")
}

export function LoginForm({ version }: LoginFormProps = {}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const requestedRedirect = searchParams.get("redirect")
  const redirectTarget = requestedRedirect?.startsWith("/") && !requestedRedirect.startsWith("//")
    && !requestedRedirect.startsWith("/login") ? requestedRedirect : "/dashboard"
  const postMpinTargetRef = React.useRef(redirectTarget)
  const urlError = searchParams.get("error")
  const urlVerified = searchParams.get("verified") === "true"
  const urlResetMpin = searchParams.get("reset_mpin") === "true"
  const previewInstall = searchParams.get("preview_install") === "true"

  const [viewMode, setViewMode] = React.useState<AuthViewMode>("loading")
  const [currentUser, setCurrentUser] = React.useState<MpinReturningUser | null>(null)
  const [setupUserId, setSetupUserId] = React.useState<string | null>(null)
  const [setupUserEmail, setSetupUserEmail] = React.useState<string | undefined>(undefined)
  const [setupDisplayName, setSetupDisplayName] = React.useState<string | null>(null)
  const [recoveryMode, setRecoveryMode] = React.useState(false)

  const [showPassword, setShowPassword] = React.useState(false)
  const [rememberMeChecked, setRememberMeChecked] = React.useState(true)
  const [customEmail, setCustomEmail] = React.useState<string | null>(null)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const savedEmail = React.useSyncExternalStore(
    subscribeToLocalStorage,
    getRememberedEmailSnapshot,
    getServerRememberedEmailSnapshot
  )
  const email = customEmail ?? savedEmail

  const greetingName = React.useMemo(() => {
    if (currentUser?.displayName) {
      return formatDisplayName(currentUser.displayName)
    }
    if (currentUser?.email) {
      return formatDisplayName(currentUser.email.split("@")[0])
    }
    if (savedEmail) {
      return formatDisplayName(savedEmail.split("@")[0])
    }
    return null
  }, [currentUser, savedEmail])

  // 1. Initial audit of existing Supabase session and local MPIN on mount
  React.useEffect(() => {
    let isMounted = true

    async function evaluateExistingSession() {
      // If user came via explicit reset MPIN, force email/password login
      if (urlResetMpin) {
        if (isMounted) {
          setViewMode("email-password")
        }
        return
      }

      try {
        const supabase = createClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!isMounted) return

        if (user) {
          // Explicit loading state: fetch current authenticated user's MPIN configuration
          const status = await getMpinStatusAction()
          if (!status) throw new Error("Unable to check MPIN status")
          if (!isMounted) return

          const userObj: MpinReturningUser = {
            id: user.id,
            email: user.email,
            displayName: user.user_metadata?.display_name || null,
          }

          const clientSessionLocked = isSessionLocked()
          if (status.verified && clientSessionLocked) {
            // A lock was signaled by the client/cookie, but the database session is still marked verified.
            // Attempt an immediate server-side lock reconciliation.
            const lockSuccess = await lockMpinAction().catch(() => false)
            if (lockSuccess) {
              status.verified = false
            } else {
              // Both the previous logout lock and this retry failed.
              // Fail closed: perform full sign-out to prevent an unrevoked session from accessing protected data.
              await supabase.auth.signOut().catch(() => {})
              clearRememberedUser()
              setSessionLocked(false)
              await setSessionLockAction(false).catch(() => {})
              if (isMounted) {
                setCurrentUser(null)
                setViewMode("email-password")
              }
              return
            }
          }

          if (status.verified) {
            router.push(status.onboardingCompleted ? redirectTarget : "/onboarding")
            router.refresh()
            return
          }
          if (status.configured) {
            postMpinTargetRef.current = status.onboardingCompleted ? redirectTarget : "/onboarding"
            retireLegacyMpin(user.id)
            setCurrentUser(userObj)
            setRememberedUser(userObj)
            await setMpinSetupPendingAction(false)
            setViewMode("returning-mpin")
          } else if (hasDeviceMpin(user.id)) {
            postMpinTargetRef.current = status.onboardingCompleted ? redirectTarget : "/onboarding"
            setCurrentUser(userObj)
            setRememberedUser(userObj)
            await setMpinSetupPendingAction(false)
            setViewMode("returning-mpin")
          } else {
            postMpinTargetRef.current = status.onboardingCompleted ? redirectTarget : "/onboarding"
            // No trusted account verifier exists, including legacy local-only users on a fresh device.
            setCurrentUser(null)
            setSetupUserId(user.id)
            setSetupUserEmail(user.email)
            setSetupDisplayName(user.user_metadata?.display_name || null)
            setRecoveryMode(status.legacy)
            setSessionLocked(false)
            await setSessionLockAction(false)
            await setMpinSetupPendingAction(true)
            setViewMode("setup-mpin")
          }
        } else {
          setViewMode("email-password")
        }
      } catch {
        if (isMounted) {
          setFormError("Unable to check MPIN status. Please try again.")
          setViewMode("email-password")
        }
      }
    }

    evaluateExistingSession()

    return () => {
      isMounted = false
    }
  }, [urlResetMpin, redirectTarget, router])

  // 2. Handle MPIN unlock success for returning user
  const handleMpinUnlockSuccess = React.useCallback(async () => {
    setSessionLocked(false)
    await setSessionLockAction(false)

    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setFormError("Session expired. Please sign in with your email and password to reconnect.")
        setViewMode("email-password")
        return
      }
    } catch {
      // Ignore
    }

    router.push(postMpinTargetRef.current)
    router.refresh()
  }, [router])

  // 3. Handle Switch Account
  const handleSwitchAccount = React.useCallback(async () => {
    try {
      await lockMpinAction()
      const supabase = createClient()
      await supabase.auth.signOut()
    } catch {
      // Ignore
    }
    document.cookie = "seijun_cycle_context=; path=/; max-age=0; SameSite=Lax"
    document.cookie = "sb-remember-me=; path=/; max-age=0; SameSite=Lax"
    document.cookie = "seijun-mpin-locked=; path=/; max-age=0; SameSite=Lax"
    clearRememberedUser()
    setSessionLocked(false)
    await setSessionLockAction(false)
    await setMpinSetupPendingAction(false)
    // Clear all account-specific React state so nothing leaks to the next account
    setCurrentUser(null)
    setSetupUserId(null)
    setSetupUserEmail(undefined)
    setSetupDisplayName(null)
    setViewMode("email-password")
    router.refresh()
  }, [router])

  // 4. Handle Forgot MPIN
  const handleForgotMpin = React.useCallback(async () => {
    if (!currentUser) return
    setRecoveryMode(true)
    setSetupUserId(currentUser.id)
    setSetupUserEmail(currentUser.email)
    setSetupDisplayName(currentUser.displayName || null)
    setCurrentUser(null)
    setViewMode("setup-mpin")
  }, [currentUser])

  // 5. Handle First-Time MPIN Setup Success
  const handleMpinSetupSuccess = React.useCallback(async () => {
    setSessionLocked(false)
    await setSessionLockAction(false)
    await setMpinSetupPendingAction(false)
    router.push(postMpinTargetRef.current)
    router.refresh()
  }, [router])

  // 6. Handle Email + Password Submission
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)
    setFormError(null)

    const formData = new FormData(e.currentTarget)
    formData.set("skipRedirect", "true")

    const submittedEmail = formData.get("email")?.toString() || ""
    const isRemembered = formData.get("rememberMe") !== null

    if (isRemembered && submittedEmail) {
      try {
        localStorage.setItem("seijun_remembered_email", submittedEmail)
      } catch {
        // Ignore quota error
      }
    }

    try {
      const result: AuthActionResult = await loginAction(null, formData)

      if (!result.success || !result.user) {
        setFormError(result.error || "Invalid email or password.")
        setIsSubmitting(false)
        return
      }

      const authenticatedId = result.user.id

      // Synchronize device and MPIN remember preferences
      setRememberDeviceEnabled(authenticatedId, isRemembered)
      setMpinRememberMeEnabled(authenticatedId, isRemembered)

      // 1. Wipe all account-specific state from any prior account
      setCurrentUser(null)
      setSetupUserId(null)
      setSetupUserEmail(undefined)
      setSetupDisplayName(null)

      // 2. Explicit loading state: fetch current user's MPIN configuration
      setViewMode("loading")

      // 3. Inspect if THIS device has a local MPIN verifier for the authenticated user
      const status = await getMpinStatusAction()
      if (!status) throw new Error("Unable to check MPIN status")
      postMpinTargetRef.current = result.redirectUrl || redirectTarget

      const userObj: MpinReturningUser = {
        id: authenticatedId,
        email: result.user.email,
        displayName: result.user.displayName,
      }

      if (status.configured && !urlResetMpin) {
        retireLegacyMpin(authenticatedId)
        setCurrentUser(userObj)
        if (isRemembered) {
          setRememberedUser(userObj)
        } else {
          clearRememberedUser()
        }
        await setMpinSetupPendingAction(false)
        setViewMode("returning-mpin")
      } else if (hasDeviceMpin(authenticatedId) && !urlResetMpin) {
        setCurrentUser(userObj)
        if (isRemembered) {
          setRememberedUser(userObj)
        } else {
          clearRememberedUser()
        }
        await setMpinSetupPendingAction(false)
        setViewMode("returning-mpin")
      } else {
        // Initial enrollment or recovery for reset/legacy credential.
        setRecoveryMode((status.configured && urlResetMpin) || (status.legacy && !hasDeviceMpin(authenticatedId)))
        setSessionLocked(false)
        await setSessionLockAction(false)
        await setMpinSetupPendingAction(true)
        setSetupUserId(authenticatedId)
        setSetupUserEmail(result.user.email)
        setSetupDisplayName(result.user.displayName || null)
        setViewMode("setup-mpin")
      }
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "An unexpected error occurred.")
      setViewMode("email-password")
    } finally {
      setIsSubmitting(false)
    }
  }

  // --- RENDERING VIEWS ---

  if (viewMode === "loading") {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-3 min-h-[320px]">
        <Loader2 className="size-6 text-primary animate-spin" />
        <span className="text-xs text-muted-foreground">Checking authentication state...</span>
      </div>
    )
  }

  if (viewMode === "returning-mpin" && currentUser) {
    return (
      <MpinReturningForm
        user={currentUser}
        onSuccess={handleMpinUnlockSuccess}
        onSwitchAccount={handleSwitchAccount}
        onForgotMpin={handleForgotMpin}
        version={version}
      />
    )
  }

  if (viewMode === "setup-mpin" && setupUserId) {
    return (
      <MpinSetupForm
        userId={setupUserId}
        userEmail={setupUserEmail}
        displayName={setupDisplayName}
        recovery={recoveryMode}
        onSuccess={handleMpinSetupSuccess}
        onCancel={handleSwitchAccount}
      />
    )
  }

  const errorMessage =
    formError ||
    (urlError === "verification_failed"
      ? "The verification link is invalid or has expired. Please sign in or request a new link."
      : null)

  return (
    <div className="w-full max-w-md mx-auto min-h-full flex-1 flex flex-col justify-between px-4 sm:px-6 py-4 sm:py-6 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      {/* ── Form content: centered in upper/middle portion of viewport ── */}
      <div className="w-full flex-1 flex flex-col justify-center my-auto py-2 space-y-4 sm:space-y-5">
        {/* Header & Logo Section */}
        <div className="flex flex-col items-center text-center space-y-2.5">
          {/* Highlighted Standalone Seijun Tulip Logo */}
          <div className="relative flex items-center justify-center pt-1 pb-1">
            <div
              className="absolute size-24 rounded-full bg-primary/15 dark:bg-primary/25 blur-xl pointer-events-none -z-10"
              aria-hidden="true"
            />
            <RediLogo size="xl" className="drop-shadow-md transition-transform hover:scale-105 duration-300" />
          </div>

          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              {greetingName ? `Welcome back, ${greetingName}` : "Sign In"}
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {greetingName
                ? "Enter your password to sign in."
                : "Enter your credentials to access Seijun private cycle tracking."}
            </p>
          </div>
        </div>

        {/* Feedback Banners */}
        {urlVerified && (
          <div
            role="status"
            className="flex items-start gap-2.5 rounded-2xl border border-success-border/60 bg-success-soft p-3 text-sm text-success-foreground"
          >
            <CheckCircle2 className="size-4 shrink-0 mt-0.5 text-success" />
            <span className="leading-snug">
              Your email has been confirmed! You can now sign in.
            </span>
          </div>
        )}

        {errorMessage && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-2xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
          >
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <span className="leading-snug">{errorMessage}</span>
          </div>
        )}

        {/* Email / Password Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <input type="hidden" name="redirect" value={redirectTarget} />

          {/* Email Field */}
          <div className="space-y-1 text-left">
            <Label htmlFor="email" className="text-sm font-medium text-foreground">
              Email
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setCustomEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="username email"
              required
              disabled={isSubmitting}
              className="h-11 rounded-xl border-input/80 bg-background/50 focus-visible:ring-primary/25"
            />
          </div>

          {/* Password Field */}
          <div className="space-y-1 text-left">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-sm font-medium text-foreground">
                Password
              </Label>
            </div>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                disabled={isSubmitting}
                className="h-11 pr-11 rounded-xl border-input/80 bg-background/50 focus-visible:ring-primary/25"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1.5 transition-colors rounded-lg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/40 cursor-pointer"
              >
                {showPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
          </div>

          {/* Remember Me */}
          <div className="flex items-center justify-between pt-0.5">
            <label
              htmlFor="rememberMe"
              className="flex items-center gap-2 cursor-pointer select-none text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <input
                id="rememberMe"
                name="rememberMe"
                type="checkbox"
                checked={rememberMeChecked}
                onChange={(e) => setRememberMeChecked(e.target.checked)}
                disabled={isSubmitting}
                className="size-4 rounded border-border text-primary focus:ring-primary/20 accent-primary cursor-pointer"
              />
              <span>Remember me on this device</span>
            </label>
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-11 text-sm font-medium rounded-xl mt-2 bg-primary text-primary-foreground hover:bg-primary/90 shadow-redi-sm transition-all cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                Signing in...
              </>
            ) : (
              "Sign In"
            )}
          </Button>
        </form>

        {/* Switch to Register */}
        <div className="text-center pt-1">
          <p className="text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link
              href="/register"
              className="font-medium text-primary hover:underline underline-offset-4 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/40 rounded-sm"
            >
              Create an account
            </Link>
          </p>
        </div>

        {/* PWA Install CTA — distinct from authentication */}
        <InstallAppButton forceShow={previewInstall} />
      </div>

      {/* ── Bottom: Credits + Meadow nicely balanced slightly above bottom edge ── */}
      <footer className="shrink-0 flex flex-col items-center justify-end w-full pt-4 sm:pt-6">
        {/* Version badge & Credits — stacked right above meadow */}
        <div className="flex flex-col items-center justify-center space-y-1 pb-1.5 text-center pointer-events-auto">
          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground/75">
            <RediLogo size="xs" />
            <span>Developed by Alex</span>
          </div>

          {version && (
            <span className="text-[10px] text-muted-foreground/40 select-none tracking-tight font-mono">
              v{version}
            </span>
          )}
        </div>

        {/* Botanical Tulip Grass Meadow Illustration */}
        <div className="w-full leading-none" aria-hidden="true">
          <SeijunMeadow />
        </div>
      </footer>
    </div>
  )
}
