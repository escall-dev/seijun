import { createClient } from "@/lib/supabase/server"
import { groupNotesByDate } from "./timeline"
import type { DailyNoteRecord } from "./types"

export const NOTE_DATE_PAGE_SIZE = 8
export interface NotesPageData {
  notes: DailyNoteRecord[]
  nextCursor: string | null
  snapshot: string
  migrationRequired?: boolean
}

export async function loadNotesPage(userId: string, author: "own" | "partner" | "all", cursor: string | null = null, snapshot = new Date().toISOString()): Promise<NotesPageData> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("get_notes_date_page", {
    p_user_id: userId, p_author: author, p_before: cursor ?? undefined, p_snapshot: snapshot, p_limit: NOTE_DATE_PAGE_SIZE + 1,
  })
  let records = (data ?? []) as unknown as DailyNoteRecord[]
  if (error?.code === "PGRST202" || error?.code === "42883") {
    // An application rollout can precede its SQL migration. Keep legacy records
    // readable through the same RLS-protected table; never use an admin client.
    records = await loadLegacyDateGroups(supabase, userId, author, cursor, snapshot)
  } else if (error) {
    console.error("[notes-page] Query failed", error.code)
    throw new Error("Unable to load notes. Please try again.")
  }
  const groups = groupNotesByDate(records)
  const visible = groups.slice(0, NOTE_DATE_PAGE_SIZE)
  return { notes: visible.flatMap(group => group.entries), nextCursor: groups.length > NOTE_DATE_PAGE_SIZE ? visible.at(-1)!.date : null, snapshot, migrationRequired: Boolean(error) }
}

async function loadLegacyDateGroups(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  author: "own" | "partner" | "all",
  cursor: string | null,
  snapshot: string,
): Promise<DailyNoteRecord[]> {
  const eligible = (columns: string) => {
    let query = supabase.from("daily_notes").select(columns).eq("user_id", userId).lte("created_at", snapshot)
    if (author === "own") query = query.or(`author_id.is.null,author_id.eq.${userId}`)
    if (author === "partner") query = query.neq("author_id", userId)
    return query
  }
  const dates = new Set<string>()
  let before = cursor
  while (dates.size <= NOTE_DATE_PAGE_SIZE) {
    let query = eligible("date").order("date", { ascending: false }).limit(128)
    if (before) query = query.lt("date", before)
    const { data, error } = await query
    if (error) {
      console.error("[notes-page] Legacy date query failed", error.code)
      throw new Error("Unable to load notes. Please try again.")
    }
    const rows = (data ?? []) as unknown as { date: string }[]
    if (!rows.length) break
    for (const row of rows) {
      dates.add(row.date)
      if (dates.size > NOTE_DATE_PAGE_SIZE) break
    }
    before = rows.at(-1)!.date
  }
  if (!dates.size) return []
  // Fetch all entries for the chosen dates, including groups larger than the
  // PostgREST row cap. A row limit must never silently split a date group.
  const records: DailyNoteRecord[] = []
  let offset = 0
  const batchSize = 500
  while (true) {
    const { data, error } = await eligible("*").in("date", [...dates])
      .order("date", { ascending: false }).order("created_at", { ascending: false }).order("id", { ascending: false })
      .range(offset, offset + batchSize - 1)
    if (error) {
      console.error("[notes-page] Legacy entries query failed", error.code)
      throw new Error("Unable to load notes. Please try again.")
    }
    const batch = (data ?? []) as unknown as DailyNoteRecord[]
    records.push(...batch)
    if (!batch.length) break
    offset += batch.length
  }
  return records
}
