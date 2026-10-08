import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { sendWebPushNotification } from "@/lib/server/web-push"

/** Only server code may access recipient subscription credentials. */
export async function deliverNoteNotifications(noteId?: string) {
  if (typeof window !== "undefined") throw new Error("Server-only notification delivery")
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!key || !url) {
    console.error("[note-notifications] Server delivery credentials are not configured; events remain queued.")
    return
  }
  const admin = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  let query = admin.from("notification_events").select("id, user_id, metadata")
    .eq("type", "partner_daily_notes").eq("status", "sent").is("sent_at", null).limit(100)
  if (noteId) query = query.contains("metadata", { noteId })
  const { data: events, error } = await query
  if (error) throw new Error("Unable to load queued note notifications")
  for (const event of events ?? []) {
    // Atomic claim before sending: overlapping requests/retries never dispatch twice.
    const { data: claimed } = await admin.rpc("claim_note_notification", { p_event_id: event.id })
    if (!claimed) continue
    const { data: subscriptions } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", event.user_id)
    for (const sub of subscriptions ?? []) {
      try {
        const result = await sendWebPushNotification(sub, {
          title: "New note from your partner", body: "Your partner sent you a new note.",
          url: claimed, tag: `seijun-note-${event.id}`, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png",
          data: { url: claimed, eventId: event.id, type: "partner_daily_notes" },
        })
        if (!result.ok && result.isExpired) await admin.from("push_subscriptions").delete().eq("id", sub.id)
        if (!result.ok) console.error("[note-notifications] Push delivery failed", result.statusCode)
      } catch {
        console.error("[note-notifications] Push delivery failed")
      }
    }
  }
}
