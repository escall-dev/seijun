/**
 * Seijun Phase 18: Notification Event Processor & Scheduler Delivery
 *
 * Pulls due pending notification events, verifies user eligibility and preferences,
 * delivers payloads via Phase 17 Web Push, cleans up expired subscriptions,
 * and transitions event states.
 *
 * SECURITY INVARIANTS:
 * 1. Server-Only: Protected by server execution guard.
 * 2. Secrets Protection: VAPID private key is never returned or leaked.
 * 3. Expired Cleanup: Automatically purges 404/410 subscriptions.
 * 4. In-App Preservation: Events transition to 'sent' so they appear in In-App Notification Center.
 */

import { createClient } from "@/lib/supabase/server"
import { getTodayDateString } from "@/lib/calculations/cycle-calculations"
import { isNotificationEnabled } from "@/lib/server/notification-preferences"
import { sendWebPushNotification } from "@/lib/server/web-push"
import type { NotificationCategory } from "@/lib/notifications/types"
import type { CycleReminderType } from "./types"

// Server-only guard
if (typeof window !== "undefined") {
  throw new Error(
    "[SECURITY VIOLATION] notification processor must only be executed in a server environment."
  )
}

export interface ProcessEventsOptions {
  userId?: string
  targetDateStr?: string
  batchLimit?: number
}

export interface ProcessEventsSummary {
  ok: boolean
  processedCount: number
  sentCount: number
  deliveredPushCount: number
  expiredCleanedCount: number
  failedPushCount: number
  cancelledCount: number
  error?: string
}

const TYPE_TO_CATEGORY: Record<CycleReminderType, NotificationCategory> = {
  period_upcoming: "period_reminders",
  period_expected: "period_reminders",
  fertile_window: "fertile_window_reminders",
  ovulation: "ovulation_reminders",
  cycle_transition: "cycle_transition_reminders",
  missed_period: "missed_period_reminders",
  partner_invitation: "partner_connection",
  partner_cycle_updates: "partner_cycle_updates",
  partner_daily_notes: "partner_daily_notes",
}

/**
 * Processes all pending notification events that are due on or before targetDateStr.
 */
export async function processPendingNotificationEvents(
  options?: ProcessEventsOptions
): Promise<ProcessEventsSummary> {
  const targetDateStr = options?.targetDateStr ?? getTodayDateString()
  const batchLimit = options?.batchLimit ?? 100

  const summary: ProcessEventsSummary = {
    ok: true,
    processedCount: 0,
    sentCount: 0,
    deliveredPushCount: 0,
    expiredCleanedCount: 0,
    failedPushCount: 0,
    cancelledCount: 0,
  }

  try {
    const supabase = await createClient()

    // 1. Query pending due events
    let query = supabase
      .from("notification_events")
      .select("id, user_id, cycle_id, type, scheduled_for, title, body, url, metadata")
      .eq("status", "pending")
      .neq("type", "partner_daily_notes")
      .lte("scheduled_for", targetDateStr)
      .order("scheduled_for", { ascending: true })
      .limit(batchLimit)

    if (options?.userId) {
      query = query.eq("user_id", options.userId)
    }

    const { data: events, error: fetchError } = await query

    if (fetchError) {
      console.error("[processPendingNotificationEvents] Query error:", fetchError.message)
      return { ...summary, ok: false, error: fetchError.message }
    }

    if (!events || events.length === 0) {
      return summary
    }

    // 2. Iterate through each due event
    for (const event of events) {
      summary.processedCount++

      // A. Check user role eligibility (supporters must not receive cycle reminders)
      const { data: profile } = await supabase
        .from("profiles")
        .select("usage_role")
        .eq("user_id", event.user_id)
        .maybeSingle()

      if (profile?.usage_role === "supporter") {
        await supabase
          .from("notification_events")
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
          .eq("id", event.id)
        summary.cancelledCount++
        continue
      }

      // B. Check user notification preferences
      const category = TYPE_TO_CATEGORY[event.type as CycleReminderType] || "personal_reminders"
      const isEnabled = await isNotificationEnabled(event.user_id, category)

      if (!isEnabled) {
        await supabase
          .from("notification_events")
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
          .eq("id", event.id)
        summary.cancelledCount++
        continue
      }

      // C. Query recipient user's active push subscriptions
      const { data: subscriptions } = await supabase
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth")
        .eq("user_id", event.user_id)

      let pushDelivered = false

      if (subscriptions && subscriptions.length > 0) {
        const payload = {
          title: event.title,
          body: event.body,
          url: event.url || "/dashboard",
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
          tag: `seijun-${event.type}-${event.scheduled_for}`,
          sound: "/sounds/notification.wav",
          data: {
            url: event.url || "/dashboard",
            eventId: event.id,
            type: event.type,
          },
        }

        // Deliver push to all user devices
        for (const sub of subscriptions) {
          try {
            const pushResult = await sendWebPushNotification(
              {
                endpoint: sub.endpoint,
                p256dh: sub.p256dh,
                auth: sub.auth,
              },
              payload
            )

            if (pushResult.ok) {
              summary.deliveredPushCount++
              pushDelivered = true
            } else {
              summary.failedPushCount++
              // Clean up expired or unsubscribed endpoints immediately
              if (pushResult.isExpired) {
                await supabase.from("push_subscriptions").delete().eq("id", sub.id)
                summary.expiredCleanedCount++
              }
            }
          } catch {
            summary.failedPushCount++
          }
        }
      }

      // D. Mark event as 'sent' so it is preserved and accessible in In-App Notification Center
      await supabase
        .from("notification_events")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", event.id)

      summary.sentCount++
    }

    return summary
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error ? err.message : "Unexpected failure in notification event processor."
    console.error("[processPendingNotificationEvents] Exception:", errorMsg)
    return { ...summary, ok: false, error: errorMsg }
  }
}
