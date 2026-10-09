"use client"

import * as React from "react"
import { RediLogo } from "@/components/brand/redi-logo"
import { SeijunMeadow } from "@/components/brand/seijun-meadow"
import { MpinInput } from "@/components/auth/mpin-input"
import {
  verifyMpin,
  getAttemptState,
  isMpinRememberMeEnabled,
  setMpinRememberMeEnabled,
  getAutofillMpin,
  saveAutofillMpin,
  clearAutofillMpin,
} from "@/lib/auth/mpin-storage"
import { Button } from "@/components/ui/button"
import { AlertCircle, Loader2, LogIn } from "lucide-react"

export interface MpinReturningUser {
  id: string
  email?: string
  displayName?: string | null
}

export interface MpinReturningFormProps {
  user: MpinReturningUser
  onSuccess: () => void | Promise<void>
  onSwitchAccount: () => void
  onForgotMpin: () => void
  onSetupDeviceMpin?: () => void
  version?: string
}

function getInitialLockout(userId: string) {
  if (typeof window === "undefined" || !userId) return { locked: false, remaining: 0 }
  const attempt = getAttemptState(userId)
  if (attempt.lockedUntil && Date.now() < attempt.lockedUntil) {
    const remaining = Math.ceil((attempt.lockedUntil - Date.now()) / 1000)
    return { locked: true, remaining }
  }
  return { locked: false, remaining: 0 }
}

export function MpinReturningForm({
  user,
  onSuccess,
  onSwitchAccount,
  onForgotMpin,
  onSetupDeviceMpin,
  version,
}: MpinReturningFormProps) {
  const initialAutofillPin = React.useMemo(() => {
    if (typeof window === "undefined" || !user?.id) return null
    return getAutofillMpin(user.id)
  }, [user.id])

  const initialRememberMe = React.useMemo(() => {
    if (typeof window === "undefined") return false
    return Boolean(initialAutofillPin) || isMpinRememberMeEnabled(user.id)
  }, [initialAutofillPin, user.id])

  const [initialLockout] = React.useState(() => getInitialLockout(user.id))

  const [mpin, setMpin] = React.useState<string>(() => initialAutofillPin || "")
  const [error, setError] = React.useState<string | null>(() =>
    initialLockout.locked ? `Too many failed attempts. Locked for ${initialLockout.remaining}s.` : null
  )
  const [isVerifying, setIsVerifying] = React.useState(false)
  const [isLockedOut, setIsLockedOut] = React.useState(() => initialLockout.locked)
  const [lockedSeconds, setLockedSeconds] = React.useState(() => initialLockout.remaining)
  const [rememberMe, setRememberMe] = React.useState<boolean>(() => initialRememberMe)
  const rememberMeRef = React.useRef<boolean>(initialRememberMe)
  const [isAutofilled, setIsAutofilled] = React.useState<boolean>(() => Boolean(initialAutofillPin))
  const isSubmittingRef = React.useRef(false)
  const isMountedRef = React.useRef(true)

  React.useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Countdown timer for lockout
  React.useEffect(() => {
    if (!isLockedOut || lockedSeconds <= 0) return

    const timer = setInterval(() => {
      setLockedSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          setIsLockedOut(false)
          setError(null)
          return 0
        }
        const updated = prev - 1
        setError(`Too many failed attempts. Locked for ${updated}s.`)
        return updated
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [isLockedOut, lockedSeconds])

  const handleVerify = React.useCallback(
    async (codeToVerify: string) => {
      // Synchronous boundary guard to prevent duplicate submissions from rapid taps, repeated clicks, Enter key, or autofill
      if (isSubmittingRef.current || isVerifying || isLockedOut || codeToVerify.length !== 6) {
        return
      }

      isSubmittingRef.current = true
      setIsVerifying(true)
      setError(null)

      try {
        const result = await verifyMpin(user.id, codeToVerify)
        if (result.success) {
          const shouldSave = rememberMeRef.current || rememberMe || isMpinRememberMeEnabled(user.id)
          if (shouldSave) {
            saveAutofillMpin(user.id, codeToVerify)
            setMpinRememberMeEnabled(user.id, true)
          } else {
            clearAutofillMpin(user.id)
            setMpinRememberMeEnabled(user.id, false)
          }

          // Await post-login navigation while keeping loading state active.
          // On success, do NOT reset isVerifying or isSubmittingRef to keep the button disabled
          // and showing "Signing in..." while the existing navigation transition completes.
          await onSuccess()
          return
        }

        // Authentication failure / invalid MPIN:
        isSubmittingRef.current = false
        if (isMountedRef.current) {
          setIsVerifying(false)
          setError(result.error || "Incorrect MPIN. Please try again.")
          setMpin("")
          setIsAutofilled(false)

          if (result.isLockedOut && result.lockedSecondsRemaining) {
            setIsLockedOut(true)
            setLockedSeconds(result.lockedSecondsRemaining)
          }
        }
      } catch (err: unknown) {
        // Unexpected error (or if post-login handler throws): safely restore idle state
        isSubmittingRef.current = false
        if (isMountedRef.current) {
          setIsVerifying(false)
          setError(err instanceof Error ? err.message : "Failed to verify MPIN.")
          setMpin("")
          setIsAutofilled(false)
        }
      }
    },
    [isVerifying, isLockedOut, user.id, rememberMe, onSuccess]
  )

  const handleComplete = (code: string) => {
    // Only auto-submit if user interactively completed typing (not when autofilled on load)
    handleVerify(code)
  }

  const handleRememberMeChange = (checked: boolean) => {
    rememberMeRef.current = checked
    setRememberMe(checked)
    if (user?.id) {
      setMpinRememberMeEnabled(user.id, checked)
      if (!checked) {
        clearAutofillMpin(user.id)
      } else if (mpin.length === 6) {
        saveAutofillMpin(user.id, mpin)
      }
    }
  }

  const handleClear = () => {
    isSubmittingRef.current = false
    setError(null)
    setMpin("")
    setIsAutofilled(false)
  }

  const rawName =
    user.displayName?.trim() ||
    (user.email ? user.email.split("@")[0] : null) ||
    "User"

  const displayName = rawName
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ")

  return (
    <div className="w-full max-w-md mx-auto min-h-full flex-1 flex flex-col justify-between px-4 sm:px-6 py-4 sm:py-6 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      {/* ── Form content: centered in upper/middle portion of viewport ── */}
      <div className="w-full flex-1 flex flex-col justify-center my-auto py-2 space-y-5 sm:space-y-6">
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

          {/* Welcome Back & Subtitle */}
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Welcome back, {displayName}
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Enter your 6-digit MPIN
            </p>
          </div>
        </div>

        {/* Feedback error alert if any */}
        {error && (
          <div
            role="alert"
            className="flex flex-col gap-2 rounded-2xl border border-destructive/20 bg-destructive/10 p-3.5 text-sm text-destructive"
          >
            <div className="flex items-start gap-2.5">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <span className="leading-snug">{error}</span>
            </div>
            {onSetupDeviceMpin && (error.toLowerCase().includes("no mpin configured") || error.toLowerCase().includes("no pin configured")) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onSetupDeviceMpin}
                className="mt-1 h-8 text-xs font-semibold rounded-xl border-destructive/30 text-foreground hover:bg-destructive/15 self-start cursor-pointer"
              >
                Set up MPIN for this device
              </Button>
            )}
          </div>
        )}

        {/* MPIN Input with Clear Button */}
        <div className="space-y-3.5 pt-1">
          <MpinInput
            value={mpin}
            onChange={(val) => {
              setMpin(val)
              if (isAutofilled) {
                setIsAutofilled(false)
              }
              setError(null)
            }}
            onComplete={handleComplete}
            disabled={isVerifying || isLockedOut}
            error={Boolean(error)}
            label="Enter your MPIN"
            showClear={true}
            onClear={handleClear}
            autoFocus={!isAutofilled}
          />

          {/* Balanced Row: Remember me on the left, Forgot MPIN on the right */}
          <div className="flex items-center justify-between px-1 text-sm">
            <label
              htmlFor="rememberMpin"
              className="flex items-center gap-2 cursor-pointer select-none text-muted-foreground hover:text-foreground transition-colors group"
            >
              <input
                id="rememberMpin"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => handleRememberMeChange(e.target.checked)}
                disabled={isVerifying}
                className="size-4 rounded border-border text-primary focus:ring-primary/20 accent-primary cursor-pointer transition-all"
              />
              <span className="text-xs sm:text-sm font-medium">Remember me</span>
            </label>

            <button
              type="button"
              onClick={onForgotMpin}
              disabled={isVerifying}
              className="text-xs sm:text-sm font-semibold text-primary hover:underline underline-offset-4 cursor-pointer"
            >
              Forgot MPIN?
            </button>
          </div>

          {/* Prominent Sign In Button when MPIN is 6 digits */}
          {mpin.length === 6 && (
            <div className="pt-1 animate-in fade-in slide-in-from-top-1 duration-200">
              <Button
                type="button"
                onClick={() => handleVerify(mpin)}
                disabled={isVerifying || isLockedOut}
                aria-busy={isVerifying}
                aria-disabled={isVerifying || isLockedOut}
                className="w-full h-11 sm:h-12 text-sm sm:text-base font-semibold rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90 shadow-redi hover:shadow-redi-md transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-[0.99]"
              >
                {isVerifying ? (
                  <>
                    <Loader2 className="size-4.5 animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="size-4.5 stroke-[2.2]" />
                    <span>Sign In</span>
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        {/* User Email Pill & Switch Account */}
        <div className="flex flex-col items-center justify-center pt-2 space-y-2.5">
          <div className="inline-flex items-center justify-center max-w-full px-5 py-1.5 rounded-2xl bg-lavender/40 dark:bg-primary/10 border border-lavender-border/50 dark:border-primary/20 text-sm font-medium text-foreground/90 tracking-normal shadow-2xs truncate">
            {user.email || "Authenticated Account"}
          </div>

          <div className="text-sm text-muted-foreground flex items-center justify-center gap-1.5">
            <span>Not you?</span>
            <button
              type="button"
              onClick={onSwitchAccount}
              disabled={isVerifying}
              className="font-semibold text-primary hover:underline underline-offset-4 cursor-pointer"
            >
              Switch Account
            </button>
          </div>
        </div>
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

