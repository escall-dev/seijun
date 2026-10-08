"use server"

import { createClient, getAuthenticatedUser } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { after } from "next/server"
import {
  NOTE_MAX_LENGTH,
  type DailyNoteRecord,
  type DailyNoteActionResult,
} from "@/lib/notes/types"
import { deliverNoteNotifications } from "@/lib/server/note-notifications"
import { getTodayDateString } from "@/lib/calculations/cycle-calculations"
import { canEditNote } from "@/lib/notes/timeline"
import { loadNotesPage } from "@/lib/notes/server"
import { resolveServerCycleContext } from "@/lib/cycle-context/server"

export type { DailyNoteRecord, DailyNoteActionResult }

/**
 * Internal: Fetch all daily notes for a specific authenticated user, newest first.
 */
export async function getDailyNotesForUser(
  userId: string,
  customClient?: Awaited<ReturnType<typeof createClient>>
): Promise<DailyNoteRecord[]> {
  const supabase = customClient || (await createClient())
  const { data, error } = await supabase
    .from("daily_notes")
    .select("*")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[getDailyNotesForUser]", error.message)
    return []
  }

  return (data ?? []) as DailyNoteRecord[]
}

/**
 * Internal: Fetch all daily notes for a specific date and user, newest first.
 */
export async function getDailyNotesByDateForUser(
  userId: string,
  date: string,
  customClient?: Awaited<ReturnType<typeof createClient>>
): Promise<DailyNoteRecord[]> {
  const supabase = customClient || (await createClient())
  const { data, error } = await supabase
    .from("daily_notes")
    .select("*")
    .eq("user_id", userId)
    .eq("date", date)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[getDailyNotesByDateForUser]", error.message)
    return []
  }

  return (data ?? []) as DailyNoteRecord[]
}

/**
 * Internal: Fetch the latest daily note for a specific date and user (backwards compatible).
 */
export async function getDailyNoteByDateForUser(
  userId: string,
  date: string,
  customClient?: Awaited<ReturnType<typeof createClient>>
): Promise<DailyNoteRecord | null> {
  const notes = await getDailyNotesByDateForUser(userId, date, customClient)
  return notes[0] ?? null
}

/**
 * Public Server Action: Fetch all daily notes for the authenticated user, newest first.
 */
export async function getDailyNotesAction(): Promise<DailyNoteRecord[]> {
  const user = await getAuthenticatedUser()
  if (!user) return []
  const supabase = await createClient()
  return getDailyNotesForUser(user.id, supabase)
}

/**
 * Public Server Action: Fetch all daily notes for a specific date, newest first.
 */
export async function getDailyNotesByDateAction(
  date: string
): Promise<DailyNoteRecord[]> {
  const user = await getAuthenticatedUser()
  if (!user) return []
  const supabase = await createClient()
  return getDailyNotesByDateForUser(user.id, date, supabase)
}

/**
 * Public Server Action: Fetch a single (latest) daily note for a specific date.
 */
export async function getDailyNoteByDateAction(
  date: string
): Promise<DailyNoteRecord | null> {
  const user = await getAuthenticatedUser()
  if (!user) return null
  const supabase = await createClient()
  return getDailyNoteByDateForUser(user.id, date, supabase)
}

/**
 * Create a daily note for a specific date.
 * Supports multiple distinct note entries on the same date with timestamps.
 */
export async function createDailyNoteAction(
  _prev: DailyNoteActionResult | null,
  formData: FormData
): Promise<DailyNoteActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "You must be signed in to save notes." }
  }

  const todayStr = getTodayDateString()
  const date = (formData.get("date") as string | null)?.trim() ?? ""
  const rawContent = (formData.get("content") as string | null)?.trim() ?? ""

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { success: false, error: "A valid date is required." }
  }

  if (date > todayStr) {
    return { success: false, error: "You cannot save a note for a future date." }
  }

  if (!rawContent) {
    return { success: false, error: "Note content cannot be empty." }
  }

  if (rawContent.length > NOTE_MAX_LENGTH) {
    return {
      success: false,
      error: `Note content cannot exceed ${NOTE_MAX_LENGTH.toLocaleString()} characters.`,
    }
  }

  const requestId = formData.get("request_id")?.toString()
  if (!requestId || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) return { success: false, error: "Invalid note request. Reopen the editor." }
  const { data, error } = await supabase
    .from("daily_notes")
    .insert({
      request_id: requestId,
      user_id: user.id,
      author_id: user.id,
      date,
      content: rawContent,
    })
    .select("id, created_at")
    .single()

  if (error?.code === "23505") {
    const { data: existing } = await supabase.from("daily_notes").select("id").eq("author_id", user.id).eq("request_id", requestId).maybeSingle()
    if (existing) return { success: true, noteId: existing.id }
  }
  if (error || !data) {
    console.error("[createDailyNoteAction]", error?.message)
    return { success: false, error: "Failed to save note. Please try again." }
  }

  after(async () => {
    try { await deliverNoteNotifications(data.id) } catch { console.error("[notes] Notification delivery failed; note remains saved.") }
  })

  revalidatePath("/notes")
  revalidatePath("/calendar")
  revalidatePath("/dashboard")
  revalidatePath("/partner")
  return { success: true, noteId: data.id }
}

/**
 * Update an existing daily note by unique note ID.
 */
export async function updateDailyNoteAction(
  id: string,
  _prev: DailyNoteActionResult | null,
  formData: FormData
): Promise<DailyNoteActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "You must be signed in to edit notes." }
  }
  const { data: existing } = await supabase.from("daily_notes").select("*").eq("id", id).maybeSingle()
  if (!existing || !canEditNote(existing, user.id)) return { success: false, error: "Sent partner notes cannot be changed. Add a new note." }

  const todayStr = getTodayDateString()
  const date = (formData.get("date") as string | null)?.trim() ?? ""
  const rawContent = (formData.get("content") as string | null)?.trim() ?? ""

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { success: false, error: "A valid date is required." }
  }

  if (date > todayStr) {
    return { success: false, error: "You cannot save a note for a future date." }
  }

  if (!rawContent) {
    return { success: false, error: "Note content cannot be empty." }
  }

  if (rawContent.length > NOTE_MAX_LENGTH) {
    return {
      success: false,
      error: `Note content cannot exceed ${NOTE_MAX_LENGTH.toLocaleString()} characters.`,
    }
  }

  const { data: changed, error } = await supabase
    .from("daily_notes")
    .update({
      date,
      content: rawContent,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .is("sent_at", null)
    .select("id")
    .maybeSingle()

  if (error || !changed) {
    console.error("[updateDailyNoteAction]", error?.message)
    return { success: false, error: "Failed to update note. Please try again." }
  }

  revalidatePath("/notes")
  revalidatePath("/calendar")
  revalidatePath("/dashboard")
  revalidatePath("/partner")
  return { success: true, noteId: id }
}

/**
 * Delete a single daily note by unique note ID.
 */
export async function deleteDailyNoteAction(
  id: string
): Promise<DailyNoteActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "You must be signed in to delete notes." }
  }
  const { data: existing } = await supabase.from("daily_notes").select("*").eq("id", id).maybeSingle()
  if (!existing || !canEditNote(existing, user.id)) return { success: false, error: "Sent partner notes cannot be changed. Add a new note." }

  const { data: changed, error } = await supabase
    .from("daily_notes")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .is("sent_at", null)
    .select("id")
    .maybeSingle()

  if (error || !changed) {
    console.error("[deleteDailyNoteAction]", error?.message)
    return { success: false, error: "Failed to delete note. Please try again." }
  }

  revalidatePath("/notes")
  revalidatePath("/calendar")
  revalidatePath("/dashboard")
  revalidatePath("/partner")
  return { success: true }
}

export async function getOlderNotesAction(input: { cursor: string; snapshot: string; author: "own" | "partner" | "all"; partnerView: boolean }) {
  const user = await getAuthenticatedUser()
  if (!user) throw new Error("Sign in to view notes.")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.cursor) || !Number.isFinite(Date.parse(input.snapshot))) throw new Error("Invalid page cursor")
  const supabase = await createClient()
  const context = await resolveServerCycleContext(supabase, user.id, input.partnerView ? "partner" : undefined)
  if (input.partnerView && (!context.isPartnerContext || !context.permissions.hasDailyNotes)) throw new Error("Partner notes are not available.")
  return loadNotesPage(input.partnerView ? context.activeUserId : user.id, input.partnerView ? "all" : input.author, input.cursor, input.snapshot)
}
