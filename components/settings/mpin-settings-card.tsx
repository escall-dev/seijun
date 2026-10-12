"use client"

import * as React from "react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { MpinInput } from "@/components/auth/mpin-input"
import { createClient } from "@/lib/supabase/client"
import { forgotMpinAction } from "@/app/actions/auth"
import { changeMpinAction } from "@/app/actions/mpin"
import {
  verifyMpin,
  saveMpin,
  clearMpin,
  isRememberDeviceEnabled,
  setRememberDeviceEnabled,
  fetchUserMpinConfiguration,
} from "@/lib/auth/mpin-storage"
import { KeyRound, ShieldCheck, Check, AlertCircle, Loader2, Smartphone } from "lucide-react"

export function MpinSettingsCard() {
  const [userId, setUserId] = React.useState<string | null>(null)
  const [isConfigured, setIsConfigured] = React.useState<boolean>(false)
  const [rememberDevice, setRememberDevice] = React.useState<boolean>(true)

  // Change MPIN Modal state
  const [isChangeModalOpen, setIsChangeModalOpen] = React.useState<boolean>(false)
  const [changeStep, setChangeStep] = React.useState<"current" | "new" | "confirm">("current")
  const [currentMpin, setCurrentMpin] = React.useState<string>("")
  const [newMpin, setNewMpin] = React.useState<string>("")
  const [confirmMpin, setConfirmMpin] = React.useState<string>("")
  const [modalError, setModalError] = React.useState<string | null>(null)
  const [isProcessing, setIsProcessing] = React.useState<boolean>(false)
  const [successToast, setSuccessToast] = React.useState<string | null>(null)

  // Reset / Forgot Modal state
  const [isResetModalOpen, setIsResetModalOpen] = React.useState<boolean>(false)

  // 1. Fetch current user and load preferences
  React.useEffect(() => {
    let isMounted = true
    async function loadUserState() {
      try {
        const supabase = createClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!isMounted || !user) return

        setUserId(user.id)
        const configured = await fetchUserMpinConfiguration(user.id)
        if (!isMounted) return
        setIsConfigured(configured)
        setRememberDevice(isRememberDeviceEnabled(user.id))
      } catch {
        // Ignore error
      }
    }

    loadUserState()
    return () => {
      isMounted = false
    }
  }, [])

  // Auto-hide success toast after 4 seconds
  React.useEffect(() => {
    if (!successToast) return
    const timer = setTimeout(() => setSuccessToast(null), 4000)
    return () => clearTimeout(timer)
  }, [successToast])

  // Handle Remember Device toggle
  const handleToggleRememberDevice = (checked: boolean) => {
    setRememberDevice(checked)
    if (userId) {
      setRememberDeviceEnabled(userId, checked)
      setSuccessToast(checked ? "Device trust enabled." : "Device trust disabled.")
    }
  }

  // Open Change MPIN modal
  const openChangeModal = () => {
    setChangeStep(isConfigured ? "current" : "new")
    setCurrentMpin("")
    setNewMpin("")
    setConfirmMpin("")
    setModalError(null)
    setIsChangeModalOpen(true)
  }

  // Step 1: Verify current MPIN
  const handleVerifyCurrentMpin = async (pin: string) => {
    if (!userId || pin.length !== 6) return
    setIsProcessing(true)
    setModalError(null)

    try {
      const result = await verifyMpin(userId, pin)
      if (!result.success) {
        setModalError(result.error || "Incorrect current MPIN.")
        setCurrentMpin("")
        return
      }
      setChangeStep("new")
    } catch {
      setModalError("Verification failed. Please try again.")
      setCurrentMpin("")
    } finally {
      setIsProcessing(false)
    }
  }

  // Step 2: Advance to confirm new MPIN
  const handleNewMpinEntered = (pin: string) => {
    if (pin.length !== 6) return
    setModalError(null)
    setChangeStep("confirm")
  }

  // Step 3: Confirm and save new MPIN
  const handleConfirmAndSaveMpin = async (pin: string) => {
    if (!userId || pin.length !== 6) return
    if (pin !== newMpin) {
      setModalError("MPINs do not match. Please re-enter.")
      setConfirmMpin("")
      return
    }

    setIsProcessing(true)
    setModalError(null)

    try {
      if (isConfigured) {
        const result = await changeMpinAction(currentMpin, pin)
        if (!result.success) throw new Error("Unable to change MPIN. Please verify your current MPIN again.")
      } else {
        await saveMpin(userId, pin, rememberDevice)
      }
      setIsConfigured(true)
      setIsChangeModalOpen(false)
      setSuccessToast("Your 6-digit MPIN has been updated successfully.")
    } catch {
      setModalError("Failed to save new MPIN. Please try again.")
    } finally {
      setIsProcessing(false)
    }
  }

  // Handle Forgot / Reset MPIN action
  const handleConfirmResetMpin = async () => {
    setIsProcessing(true)
    if (userId) {
      clearMpin(userId)
    }
    await forgotMpinAction()
  }

  return (
    <>
      <Card className="overflow-hidden border-border/70 shadow-xs">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-lavender text-primary border border-lavender-border/60">
              <KeyRound className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle>MPIN & Device Security</CardTitle>
                <Badge variant="lavender" className="text-[10px] px-1.5 py-0 font-normal">
                  Phase 20 Prep
                </Badge>
              </div>
              <CardDescription>
                Configure your 6-digit local unlock code, device trust, and quick-access behavior
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Success Banner */}
          {successToast && (
            <div
              role="status"
              className="flex items-center gap-2 p-3 rounded-xl bg-success-soft border border-success-border/60 text-xs text-success-foreground animate-in fade-in duration-200"
            >
              <Check className="size-4 shrink-0 text-success" />
              <span>{successToast}</span>
            </div>
          )}

          {/* MPIN Status & Action Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-secondary/50 border border-border/50 text-sm">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="size-4.5 text-primary shrink-0" />
              <div>
                <span className="font-medium text-foreground block">6-Digit MPIN Status</span>
                <span className="text-xs text-muted-foreground">
                  {isConfigured
                    ? "Account MPIN is enabled across your devices"
                    : "No account MPIN configured yet"}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Badge
                variant="outline"
                className={
                  isConfigured
                    ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-xs font-normal"
                    : "text-amber-600 dark:text-amber-400 border-amber-500/30 text-xs font-normal"
                }
              >
                {isConfigured ? "Active" : "Not Set"}
              </Badge>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={openChangeModal}
                className="h-8 text-xs font-medium rounded-lg cursor-pointer"
              >
                {isConfigured ? "Change MPIN" : "Set MPIN"}
              </Button>
            </div>
          </div>

          {/* Remember this Device Toggle */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-secondary/30 border border-border/40">
            <div className="flex items-start gap-3">
              <Smartphone className="size-4.5 text-primary shrink-0 mt-0.5" />
              <div>
                <label
                  htmlFor="rememberDeviceToggle"
                  className="font-medium text-foreground text-sm block cursor-pointer select-none"
                >
                  Remember Me
                </label>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Keep your encrypted session active across browser restarts without re-entering email and password.
                </p>
              </div>
            </div>

            <input
              id="rememberDeviceToggle"
              type="checkbox"
              checked={rememberDevice}
              onChange={(e) => handleToggleRememberDevice(e.target.checked)}
              className="size-4.5 rounded border-border text-primary focus:ring-primary/20 accent-primary cursor-pointer shrink-0 ml-3"
            />
          </div>

          {/* Forgot MPIN Option */}
          {isConfigured && (
            <div className="flex items-center justify-between pt-1 px-1">
              <p className="text-xs text-muted-foreground">
                Need to reset your MPIN?
              </p>
              <button
                type="button"
                onClick={() => setIsResetModalOpen(true)}
                className="text-xs font-semibold text-primary hover:underline underline-offset-4 cursor-pointer"
              >
                Forgot MPIN
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Change MPIN Modal */}
      <Dialog open={isChangeModalOpen} onOpenChange={setIsChangeModalOpen}>
        <DialogContent className="max-w-sm rounded-3xl p-6 border-lavender-border/80">
          <DialogHeader className="text-center">
            <DialogTitle className="text-xl font-bold">
              {changeStep === "current"
                ? "Enter Current MPIN"
                : changeStep === "new"
                ? "Choose New 6-Digit MPIN"
                : "Confirm New MPIN"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {changeStep === "current"
                ? "Verify your identity with your existing 6-digit MPIN."
                : changeStep === "new"
                ? "Select a new 6-digit code for unlocking your session."
                : "Re-enter the 6 digits to verify."}
            </DialogDescription>
          </DialogHeader>

          {modalError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive"
            >
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <span>{modalError}</span>
            </div>
          )}

          <div className="py-2">
            {changeStep === "current" && (
              <MpinInput
                id="settings-current-mpin"
                name="currentMpin"
                autoComplete="current-password"
                value={currentMpin}
                onChange={(val) => {
                  setCurrentMpin(val)
                  setModalError(null)
                }}
                onComplete={handleVerifyCurrentMpin}
                disabled={isProcessing}
                autoFocus={true}
              />
            )}

            {changeStep === "new" && (
              <MpinInput
                id="settings-new-mpin"
                name="newMpin"
                autoComplete="new-password"
                value={newMpin}
                onChange={(val) => {
                  setNewMpin(val)
                  setModalError(null)
                }}
                onComplete={handleNewMpinEntered}
                disabled={isProcessing}
                autoFocus={true}
              />
            )}

            {changeStep === "confirm" && (
              <MpinInput
                id="settings-confirm-mpin"
                name="confirmMpin"
                autoComplete="new-password"
                value={confirmMpin}
                onChange={(val) => {
                  setConfirmMpin(val)
                  setModalError(null)
                }}
                onComplete={handleConfirmAndSaveMpin}
                disabled={isProcessing}
                autoFocus={true}
              />
            )}
          </div>

          <DialogFooter className="flex flex-row justify-between gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (changeStep === "confirm") {
                  setChangeStep("new")
                  setConfirmMpin("")
                } else if (changeStep === "new" && isConfigured) {
                  setChangeStep("current")
                } else {
                  setIsChangeModalOpen(false)
                }
              }}
              disabled={isProcessing}
              className="h-10 flex-1 rounded-xl"
            >
              {changeStep === "confirm" ? "Back" : "Cancel"}
            </Button>

            {changeStep === "new" && (
              <Button
                type="button"
                size="sm"
                onClick={() => handleNewMpinEntered(newMpin)}
                disabled={newMpin.length !== 6 || isProcessing}
                className="h-10 flex-1 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Next
              </Button>
            )}

            {changeStep === "confirm" && (
              <Button
                type="button"
                size="sm"
                onClick={() => handleConfirmAndSaveMpin(confirmMpin)}
                disabled={confirmMpin.length !== 6 || isProcessing}
                className="h-10 flex-1 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {isProcessing ? <Loader2 className="size-4 animate-spin" /> : "Save MPIN"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset / Forgot MPIN Confirmation Modal */}
      <Dialog open={isResetModalOpen} onOpenChange={setIsResetModalOpen}>
        <DialogContent className="max-w-sm rounded-3xl p-6 border-destructive/30">
          <DialogHeader className="text-center">
            <DialogTitle className="text-xl font-bold text-destructive">
              Reset MPIN & Sign Out?
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed pt-1">
              You will sign in again, confirm your account password, and choose a new MPIN for all devices.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="flex flex-row justify-between gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsResetModalOpen(false)}
              disabled={isProcessing}
              className="h-10 flex-1 rounded-xl"
            >
              Cancel
            </Button>

            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleConfirmResetMpin}
              disabled={isProcessing}
              className="h-10 flex-1 rounded-xl"
            >
              {isProcessing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Reset & Sign Out"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
