"use client"

import * as React from "react"
import { RediLogo } from "@/components/brand/redi-logo"
import { MpinInput } from "@/components/auth/mpin-input"
import { saveMpin } from "@/lib/auth/mpin-storage"
import { recoverMpinAction } from "@/app/actions/mpin"
import { Button } from "@/components/ui/button"
import { Shield, AlertCircle, ArrowLeft, Loader2 } from "lucide-react"

export interface MpinSetupFormProps {
  userId: string
  userEmail?: string
  displayName?: string | null
  onSuccess: () => void
  onCancel?: () => void
  recovery?: boolean
}

export function MpinSetupForm({
  userId,
  userEmail,
  displayName,
  onSuccess,
  onCancel,
  recovery = false,
}: MpinSetupFormProps) {
  const [step, setStep] = React.useState<"create" | "confirm">("create")
  const [mpin, setMpin] = React.useState("")
  const [confirmMpin, setConfirmMpin] = React.useState("")
  const [rememberDevice, setRememberDevice] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [isSaving, setIsSaving] = React.useState(false)
  const [password, setPassword] = React.useState("")

  const handleCreateComplete = (val: string) => {
    if (val.length === 6) {
      setError(null)
      setStep("confirm")
    }
  }

  const handleConfirmComplete = async (val: string) => {
    if (val.length !== 6) return

    if (val !== mpin) {
      setError("MPINs do not match. Please try again.")
      setConfirmMpin("")
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      if (recovery) {
        const result = await recoverMpinAction(password, val)
        if (!result.success) throw new Error("Recovery failed. Check your password and try again.")
      } else {
        await saveMpin(userId, val, rememberDevice, { email: userEmail, displayName })
      }
      onSuccess()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save MPIN. Please try again.")
      setIsSaving(false)
    }
  }

  const handleBackToCreate = () => {
    setStep("create")
    setConfirmMpin("")
    setError(null)
  }

  return (
    <div className="w-full space-y-7 max-w-md mx-auto py-2">
      {/* Header & Logo Section */}
      <div className="flex flex-col items-center text-center space-y-3">
        {/* Highlighted Standalone Seijun Tulip Logo */}
        <div className="relative flex items-center justify-center pt-2 pb-1">
          <div
            className="absolute size-24 rounded-full bg-primary/15 dark:bg-primary/25 blur-xl pointer-events-none -z-10"
            aria-hidden="true"
          />
          <RediLogo size="xl" className="drop-shadow-md transition-transform hover:scale-105 duration-300" />
        </div>

        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            {step === "create" ? (recovery ? "Reset your account MPIN" : "Set your account MPIN") : "Confirm your 6-digit MPIN"}
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {step === "create"
              ? (recovery ? "Confirm your account password to replace your MPIN on all devices." : "Use the same 6 digits you used before if this account had a device-only MPIN.")
              : "Re-enter your 6 digits to verify."}
          </p>
        </div>
      </div>

          {/* Feedback Banner */}
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
            >
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <span className="leading-snug">{error}</span>
            </div>
          )}

          {/* Step 1: Create */}
          {step === "create" && (
            <div className="space-y-5">
              <MpinInput
                id="create-mpin-input"
                name="newMpin"
                autoComplete="new-password"
                value={mpin}
                onChange={(val) => {
                  setMpin(val)
                  setError(null)
                }}
                onComplete={handleCreateComplete}
                label="Choose 6 digits"
                showClear={true}
                error={Boolean(error)}
                autoFocus={true}
              />

              <div className="flex items-center justify-between pt-1">
                <label
                  htmlFor="rememberDeviceSetup"
                  className="flex items-center gap-2 cursor-pointer select-none text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <input
                    id="rememberDeviceSetup"
                    type="checkbox"
                    checked={rememberDevice}
                    onChange={(e) => setRememberDevice(e.target.checked)}
                    className="size-4 rounded border-border text-primary focus:ring-primary/20 accent-primary cursor-pointer"
                  />
                  <span>Remember me</span>
                </label>
              </div>

              <Button
                type="button"
                disabled={mpin.length !== 6}
                onClick={() => handleCreateComplete(mpin)}
                className="w-full h-11 text-sm font-medium rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 shadow-redi-sm transition-all cursor-pointer"
              >
                Continue
              </Button>
            </div>
          )}

          {/* Step 2: Confirm */}
          {step === "confirm" && (
            <div className="space-y-5">
              {recovery && (
                <label className="block text-sm font-medium">
                  Account password
                  <input type="password" autoComplete="current-password" value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2" required />
                </label>
              )}
              <MpinInput
                id="confirm-mpin-input"
                name="confirmMpin"
                autoComplete="new-password"
                value={confirmMpin}
                onChange={(val) => {
                  setConfirmMpin(val)
                  setError(null)
                }}
                onComplete={handleConfirmComplete}
                label="Confirm 6 digits"
                showClear={true}
                error={Boolean(error)}
                autoFocus={true}
                disabled={isSaving}
              />

              <div className="flex gap-2.5">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBackToCreate}
                  disabled={isSaving}
                  className="h-11 px-4 rounded-xl border-border/80 cursor-pointer"
                >
                  <ArrowLeft className="size-4 mr-1" />
                  Back
                </Button>

                <Button
                  type="button"
                  disabled={confirmMpin.length !== 6 || isSaving || (recovery && !password)}
                  onClick={() => handleConfirmComplete(confirmMpin)}
                  className="flex-1 h-11 text-sm font-medium rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 shadow-redi-sm transition-all cursor-pointer"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="size-4 animate-spin mr-2" />
                      Saving MPIN...
                    </>
                  ) : (
                    "Confirm & Finish"
                  )}
                </Button>
              </div>
            </div>
          )}

      <div className="text-center pt-2">
        <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground/80">
          <Shield className="size-3.5 text-primary" />
          <span>Stored as a cryptographic verifier; never in plaintext</span>
        </div>
      </div>
      {onCancel && (
        <button type="button" onClick={onCancel}
          className="mx-auto block text-sm font-medium text-primary hover:underline">
          Sign in again or switch account
        </button>
      )}
    </div>
  )
}
