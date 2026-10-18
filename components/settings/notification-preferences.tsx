"use client"

import * as React from "react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Bell,
  BellRing,
  HeartHandshake,
  Users,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  CalendarHeart,
  FileText,
  Activity,
  UserCheck,
  Clock,
  Laptop,
  Volume2,
  VolumeX,
} from "lucide-react"
import {
  type NotificationCategory,
  type NotificationPreferences,
  type ReminderTimingOption,
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_GROUPS,
} from "@/lib/notifications/types"
import {
  getNotificationPreferencesAction,
  updateNotificationPreferenceAction,
  updateReminderTimingAction,
  updateNotificationSoundAction,
} from "@/app/actions/notification-preferences"
import {
  isWebPushSupported,
  getNotificationPermission,
  registerAndPersistWebPush,
} from "@/lib/push/subscription-manager"
import { playNotificationSound, setSoundEnabledLocally } from "@/lib/notifications/sound"
import type { ProfileUsageRole } from "@/lib/supabase/types"

interface NotificationPreferencesProps {
  initialPreferences?: NotificationPreferences
  usageRole?: ProfileUsageRole | null
}

const GROUP_ICONS = {
  personal: CalendarHeart,
  partner: HeartHandshake,
  shared: Users,
  system: ShieldCheck,
}

const CATEGORY_ICONS: Record<NotificationCategory, React.ElementType> = {
  period_reminders: CalendarHeart,
  fertile_window_reminders: Sparkles,
  ovulation_reminders: CalendarHeart,
  cycle_transition_reminders: Clock,
  missed_period_reminders: AlertCircle,
  personal_reminders: CalendarHeart,
  personal_updates: Sparkles,
  partner_daily_notes: FileText,
  partner_cycle_updates: CalendarHeart,
  partner_activity: Activity,
  partner_connection: UserCheck,
  shared_reminders: CalendarHeart,
  shared_updates: Sparkles,
  system_notifications: Bell,
  security_notifications: ShieldCheck,
}

const TIMING_OPTIONS: { days: ReminderTimingOption; label: string; description: string }[] = [
  { days: 3, label: "3 days before", description: "Advance heads-up 3 days prior" },
  { days: 1, label: "1 day before", description: "Reminder the day before estimated start" },
  { days: 0, label: "On expected day", description: "Day-of reminder when period is estimated to arrive" },
]

export function NotificationPreferencesCard({
  initialPreferences,
  usageRole,
}: NotificationPreferencesProps) {
  const [preferences, setPreferences] = React.useState<NotificationPreferences>(
    initialPreferences || DEFAULT_NOTIFICATION_PREFERENCES
  )
  const [loading, setLoading] = React.useState<boolean>(!initialPreferences)
  const [pendingCategory, setPendingCategory] = React.useState<NotificationCategory | null>(null)
  const [pendingTiming, setPendingTiming] = React.useState<boolean>(false)
  const [pendingSound, setPendingSound] = React.useState<boolean>(false)
  const [isPlayingPreview, setIsPlayingPreview] = React.useState<boolean>(false)
  const [bannerMessage, setBannerMessage] = React.useState<{
    type: "success" | "error" | "info"
    text: string
  } | null>(null)

  // Device push status telemetry
  const [devicePushActive, setDevicePushActive] = React.useState<boolean | null>(null)
  const [permissionState, setPermissionState] = React.useState<string>("checking")
  const [enablingPush, setEnablingPush] = React.useState<boolean>(false)

  React.useEffect(() => {
    let isMounted = true

    async function loadData() {
      if (!initialPreferences) {
        try {
          const res = await getNotificationPreferencesAction()
          if (isMounted && res.ok && res.preferences) {
            setPreferences(res.preferences)
            setSoundEnabledLocally(res.preferences.sound_enabled ?? true)
          }
        } catch {
          if (isMounted) {
            setBannerMessage({
              type: "error",
              text: "Could not load saved notification preferences. Using defaults.",
            })
          }
        } finally {
          if (isMounted) setLoading(false)
        }
      }

      // Check device push capability and permission
      if (typeof window !== "undefined" && isWebPushSupported()) {
        const perm = getNotificationPermission()
        if (isMounted) setPermissionState(perm)

        if (perm === "granted" && "serviceWorker" in navigator) {
          try {
            const reg = await navigator.serviceWorker.ready
            const sub = await reg?.pushManager?.getSubscription()
            if (isMounted) setDevicePushActive(Boolean(sub))
          } catch {
            if (isMounted) setDevicePushActive(false)
          }
        } else {
          if (isMounted) setDevicePushActive(false)
        }
      } else {
        if (isMounted) setPermissionState("unsupported")
        if (isMounted) setDevicePushActive(false)
      }
    }

    void loadData()

    return () => {
      isMounted = false
    }
  }, [initialPreferences])

  // Clear transient messages after 4 seconds
  React.useEffect(() => {
    if (!bannerMessage) return
    const t = setTimeout(() => setBannerMessage(null), 4000)
    return () => clearTimeout(t)
  }, [bannerMessage])

  // Optimistic preference toggle handler
  const handleToggle = async (category: NotificationCategory) => {
    if (pendingCategory) return

    const previousValue = preferences[category]
    const nextValue = !previousValue

    setPreferences((prev) => ({
      ...prev,
      [category]: nextValue,
    }))
    setPendingCategory(category)
    setBannerMessage(null)

    try {
      const result = await updateNotificationPreferenceAction(category, nextValue)

      if (!result.ok) {
        setPreferences((prev) => ({
          ...prev,
          [category]: previousValue,
        }))
        setBannerMessage({
          type: "error",
          text: result.error || "Failed to update notification preference.",
        })
      } else {
        if (result.preferences) {
          setPreferences(result.preferences)
        }
        setBannerMessage({
          type: "success",
          text: `Updated ${NOTIFICATION_CATEGORIES[category]?.label || category} preference.`,
        })
      }
    } catch {
      setPreferences((prev) => ({
        ...prev,
        [category]: previousValue,
      }))
      setBannerMessage({
        type: "error",
        text: "Network error occurred while updating preference. Please try again.",
      })
    } finally {
      setPendingCategory(null)
    }
  }

  // Reminder timing option handler
  const handleTimingChange = async (days: ReminderTimingOption) => {
    if (pendingTiming || preferences.reminder_days_before === days) return

    const previousDays = preferences.reminder_days_before
    setPreferences((prev) => ({ ...prev, reminder_days_before: days }))
    setPendingTiming(true)
    setBannerMessage(null)

    try {
      const result = await updateReminderTimingAction(days)
      if (!result.ok) {
        setPreferences((prev) => ({ ...prev, reminder_days_before: previousDays }))
        setBannerMessage({
          type: "error",
          text: result.error || "Failed to update reminder timing.",
        })
      } else {
        if (result.preferences) {
          setPreferences(result.preferences)
        }
        setBannerMessage({
          type: "success",
          text: `Reminder timing updated to ${days === 0 ? "on expected day" : `${days} day${days > 1 ? "s" : ""} before`}.`,
        })
      }
    } catch {
      setPreferences((prev) => ({ ...prev, reminder_days_before: previousDays }))
      setBannerMessage({
        type: "error",
        text: "Failed to update timing preference.",
      })
    } finally {
      setPendingTiming(false)
    }
  }

  // Handle explicit permission prompt
  const handleEnableDevicePush = async () => {
    setEnablingPush(true)
    try {
      const res = await registerAndPersistWebPush({
        deviceName: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 80) : undefined,
      })
      if (res.ok) {
        setDevicePushActive(true)
        setPermissionState("granted")
        setBannerMessage({
          type: "success",
          text: "Browser notifications successfully enabled on this device!",
        })
      } else {
        setPermissionState(getNotificationPermission())
        setBannerMessage({
          type: "error",
          text: res.message || "Could not enable browser notifications on this device.",
        })
      }
    } catch {
      setBannerMessage({
        type: "error",
        text: "Could not enable browser notifications. Please try again.",
      })
    } finally {
      setEnablingPush(false)
    }
  }

  // Handle notification sound toggle
  const handleSoundToggle = async () => {
    if (pendingSound) return

    const previousValue = preferences.sound_enabled ?? true
    const nextValue = !previousValue

    setPreferences((prev) => ({ ...prev, sound_enabled: nextValue }))
    setSoundEnabledLocally(nextValue)
    setPendingSound(true)
    setBannerMessage(null)

    try {
      const result = await updateNotificationSoundAction(nextValue)
      if (!result.ok) {
        setPreferences((prev) => ({ ...prev, sound_enabled: previousValue }))
        setSoundEnabledLocally(previousValue)
        setBannerMessage({
          type: "error",
          text: result.error || "Failed to update notification sound preference.",
        })
      } else {
        if (result.preferences) {
          setPreferences(result.preferences)
        }
        setBannerMessage({
          type: "success",
          text: `Notification sound ${nextValue ? "enabled" : "muted"}.`,
        })
      }
    } catch {
      setPreferences((prev) => ({ ...prev, sound_enabled: previousValue }))
      setSoundEnabledLocally(previousValue)
      setBannerMessage({
        type: "error",
        text: "Network error occurred while updating sound preference.",
      })
    } finally {
      setPendingSound(false)
    }
  }

  // Handle sound preview playback
  const handlePreviewSound = async () => {
    setIsPlayingPreview(true)
    try {
      await playNotificationSound(undefined, true)
    } finally {
      setTimeout(() => setIsPlayingPreview(false), 1200)
    }
  }

  return (
    <Card className="overflow-hidden border-border/80 shadow-xs" id="notification-preferences">
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-lavender text-primary border border-lavender-border/60">
              <BellRing className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle>Notification Preferences</CardTitle>
                <Badge variant="outline" className="text-[10px] px-2 py-0 font-normal">
                  Cycle & Alerts
                </Badge>
              </div>
              <CardDescription>
                Customize cycle reminders, timing alerts, and browser delivery settings.
              </CardDescription>
            </div>
          </div>
        </div>

        {/* Transient feedback banner */}
        {bannerMessage && (
          <div
            role="status"
            aria-live="polite"
            className={`mt-3 flex items-center gap-2 rounded-xl p-3 text-xs font-medium border ${
              bannerMessage.type === "success"
                ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60"
                : bannerMessage.type === "error"
                ? "bg-destructive/10 text-destructive border-destructive/20"
                : "bg-secondary text-foreground border-border"
            }`}
          >
            {bannerMessage.type === "success" ? (
              <CheckCircle2 className="size-4 shrink-0" />
            ) : (
              <AlertCircle className="size-4 shrink-0" />
            )}
            <span>{bannerMessage.text}</span>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-6 pt-0">
        {/* A. Browser Notifications Status Bar */}
        <div className="rounded-xl border border-border/70 bg-secondary/30 p-3.5 space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5">
              <Laptop className="size-4 text-primary shrink-0" />
              <div>
                <h4 className="text-xs font-semibold text-foreground">Browser Push Delivery</h4>
                <p className="text-[11px] text-muted-foreground">
                  Status on this browser:{" "}
                  <span className="font-medium text-foreground capitalize">
                    {permissionState === "granted"
                      ? "Granted"
                      : permissionState === "denied"
                      ? "Blocked in browser"
                      : permissionState === "unsupported"
                      ? "Not supported by this browser"
                      : permissionState === "checking"
                      ? "Checking…"
                      : "Not requested yet"}
                  </span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-center">
              <Badge
                variant={devicePushActive ? "default" : "outline"}
                className={`text-[10px] px-2 py-0.5 ${
                  devicePushActive
                    ? "bg-emerald-600 hover:bg-emerald-600 text-white"
                    : "text-muted-foreground border-border/70"
                }`}
              >
                {devicePushActive ? "Active on this device" : "Device inactive"}
              </Badge>

              {(permissionState === "default" || permissionState === "granted") && !devicePushActive && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleEnableDevicePush}
                  disabled={enablingPush}
                  className="h-7 text-xs px-2.5 gap-1.5 shadow-2xs"
                >
                  {enablingPush ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Sparkles className="size-3 text-primary" />
                  )}
                  <span>{permissionState === "granted" ? "Finish Setup" : "Enable Push"}</span>
                </Button>
              )}
            </div>
          </div>
          {permissionState === "denied" && (
            <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
              Notifications are blocked for this site. Allow them in your browser or device settings, reload this page, then select Enable Push.
            </p>
          )}
          {permissionState === "unsupported" && (
            <p className="rounded-lg border border-border/70 bg-background/70 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
              This browser does not support push notifications. You can still manage your reminder preferences here.
            </p>
          )}
        </div>

        {/* B. Notification Sound Controls */}
        <div className="rounded-xl border border-border/70 bg-secondary/30 p-3.5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-3">
              <div
                className={`flex size-8 shrink-0 items-center justify-center rounded-lg border ${
                  preferences.sound_enabled
                    ? "bg-primary/10 text-primary border-primary/20"
                    : "bg-muted text-muted-foreground border-border/60"
                }`}
              >
                {preferences.sound_enabled ? (
                  <Volume2 className="size-4" />
                ) : (
                  <VolumeX className="size-4" />
                )}
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-semibold text-foreground">Notification Sound</h4>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                    Positive Chime
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Play an audible chime for push notifications, partner invites, and alerts.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 self-end sm:self-center shrink-0">
              {/* Preview Button */}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handlePreviewSound}
                disabled={isPlayingPreview}
                className="h-7 text-xs px-2.5 gap-1.5 rounded-lg border-border/70 hover:bg-secondary cursor-pointer shadow-2xs"
                title="Preview notification sound"
              >
                <Volume2 className={`size-3 text-primary ${isPlayingPreview ? "animate-pulse" : ""}`} />
                <span>{isPlayingPreview ? "Playing..." : "Preview"}</span>
              </Button>

              <span
                className={`text-[11px] font-semibold tracking-wide uppercase ${
                  preferences.sound_enabled ? "text-primary" : "text-muted-foreground/60"
                }`}
                aria-hidden="true"
              >
                {preferences.sound_enabled ? "On" : "Off"}
              </span>

              {/* Accessible Switch Toggle */}
              <button
                id="toggle-sound-enabled"
                type="button"
                role="switch"
                aria-checked={preferences.sound_enabled}
                aria-label="Notification sound toggle"
                disabled={pendingSound}
                onClick={handleSoundToggle}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    handleSoundToggle()
                  }
                }}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 ${
                  preferences.sound_enabled ? "bg-primary" : "bg-muted-foreground/30"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block size-5 transform rounded-full bg-background shadow-md ring-0 transition duration-200 ease-in-out flex items-center justify-center ${
                    preferences.sound_enabled ? "translate-x-5" : "translate-x-0"
                  }`}
                >
                  {pendingSound && (
                    <Loader2 className="size-3 animate-spin text-muted-foreground" />
                  )}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* C. Reminder Timing Options */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 border-b border-border/50 pb-2">
            <Clock className="size-4 text-primary shrink-0" />
            <h3 className="text-sm font-semibold tracking-tight text-foreground">
              Reminder Timing
            </h3>
            <span className="text-xs text-muted-foreground hidden sm:inline">
              — When to receive period notifications
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {TIMING_OPTIONS.map((opt) => {
              const isSelected = preferences.reminder_days_before === opt.days

              return (
                <button
                  key={opt.days}
                  type="button"
                  disabled={pendingTiming}
                  onClick={() => handleTimingChange(opt.days)}
                  className={`flex flex-col items-start gap-1 p-3 rounded-xl border text-left transition-all select-none cursor-pointer ${
                    isSelected
                      ? "bg-lavender/40 border-primary text-foreground shadow-xs ring-1 ring-primary/40"
                      : "bg-secondary/40 border-border/60 hover:bg-secondary/70 text-muted-foreground"
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-xs font-semibold text-foreground">
                      {opt.label}
                    </span>
                    {isSelected && (
                      <span className="size-2 rounded-full bg-primary" />
                    )}
                  </div>
                  <span className="text-[11px] leading-tight text-muted-foreground">
                    {opt.description}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* C. Notification Categories by Group */}
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" />
            <span>Loading notification preferences...</span>
          </div>
        ) : (
          NOTIFICATION_GROUPS.map((group) => {
            const GroupIcon = GROUP_ICONS[group.id] || Bell

            return (
              <div key={group.id} className="space-y-3">
                {/* Group Heading */}
                <div className="flex items-center gap-2 border-b border-border/50 pb-2">
                  <GroupIcon className="size-4 text-primary shrink-0" />
                  <h3 className="text-sm font-semibold tracking-tight text-foreground">
                    {group.title}
                  </h3>
                  <span className="text-xs text-muted-foreground hidden sm:inline">
                    — {group.description}
                  </span>
                </div>

                {/* Group Categories */}
                <div className="grid gap-2.5">
                  {group.categories.map((categoryKey) => {
                    const config = NOTIFICATION_CATEGORIES[categoryKey]
                    if (!config) return null
                    const isEnabled = preferences[categoryKey] ?? true
                    const isPending = pendingCategory === categoryKey
                    const CategoryIcon = CATEGORY_ICONS[categoryKey] || Bell

                    const showSupporterContext =
                      usageRole === "supporter" && group.id === "personal"

                    return (
                      <div
                        key={categoryKey}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-secondary/40 border border-border/50 hover:bg-secondary/60 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground border border-border/60 mt-0.5">
                            <CategoryIcon className="size-4 text-foreground/80" />
                          </div>
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <label
                                htmlFor={`toggle-${categoryKey}`}
                                className="text-sm font-medium text-foreground cursor-pointer select-none"
                              >
                                {config.label}
                              </label>
                              {showSupporterContext && (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] px-1.5 py-0 font-normal text-muted-foreground"
                                >
                                  Cycle Tracker
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {config.description}
                            </p>
                          </div>
                        </div>

                        {/* Accessible Switch Toggle Button */}
                        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                          <span
                            className={`text-[11px] font-semibold tracking-wide uppercase ${
                              isEnabled ? "text-primary" : "text-muted-foreground/60"
                            }`}
                            aria-hidden="true"
                          >
                            {isEnabled ? "On" : "Off"}
                          </span>

                          <button
                            id={`toggle-${categoryKey}`}
                            type="button"
                            role="switch"
                            aria-checked={isEnabled}
                            aria-label={`${config.label} notifications`}
                            disabled={isPending}
                            onClick={() => handleToggle(categoryKey)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault()
                                handleToggle(categoryKey)
                              }
                            }}
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 ${
                              isEnabled ? "bg-primary" : "bg-muted-foreground/30"
                            }`}
                          >
                            <span
                              aria-hidden="true"
                              className={`pointer-events-none inline-block size-5 transform rounded-full bg-background shadow-md ring-0 transition duration-200 ease-in-out flex items-center justify-center ${
                                isEnabled ? "translate-x-5" : "translate-x-0"
                              }`}
                            >
                              {isPending && (
                                <Loader2 className="size-3 animate-spin text-muted-foreground" />
                              )}
                            </span>
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
