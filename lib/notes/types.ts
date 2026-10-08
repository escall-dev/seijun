/**
 * Type definitions and constants for Redi Phase 11 — Daily Notes.
 */

export interface DailyNoteRecord {
  id: string
  user_id: string
  author_id?: string | null
  sent_at?: string | null
  request_id?: string | null
  date: string // YYYY-MM-DD
  content: string
  created_at: string
  updated_at: string
}

export const NOTE_MAX_LENGTH = 2000

export interface DailyNoteActionResult {
  success?: boolean
  error?: string
  noteId?: string
}
