import type { DailyNoteRecord } from "./types"

export function groupNotesByDate(notes: DailyNoteRecord[]) {
  const map = new Map<string, DailyNoteRecord[]>()
  for (const note of notes) {
    const entries = map.get(note.date) ?? []
    entries.push(note)
    map.set(note.date, entries)
  }
  return [...map.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([date, entries]) => ({
    date,
    entries: entries.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)),
  }))
}

export function canEditNote(note: DailyNoteRecord, userId?: string) {
  return note.sent_at === null && note.user_id === userId && (note.author_id ?? note.user_id) === userId
}

export function getNoteAuthorLabel(note: DailyNoteRecord, userId?: string, partnerId?: string | null, partnerName = "Partner") {
  if (note.author_id === userId || (!note.author_id && !note.sent_at && note.user_id === userId)) return "You"
  if (note.author_id && note.author_id === partnerId) return `By ${partnerName}`
  return note.author_id ? `Original author · ${note.author_id.slice(0, 8)}` : "Original author unavailable"
}
