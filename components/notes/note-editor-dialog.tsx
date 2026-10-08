"use client"

import * as React from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { DatePicker } from "@/components/ui/date-picker"
import {
  createDailyNoteAction,
  updateDailyNoteAction,
  type DailyNoteRecord,
} from "@/app/actions/notes"
import {
  createPartnerDailyNoteAction,
  updatePartnerDailyNoteAction,
} from "@/app/actions/partner-mutations"
import { getTodayDateString } from "@/lib/calculations/cycle-calculations"
import { NOTE_MAX_LENGTH } from "@/lib/notes/types"
import { FileText, AlertCircle, Loader2 } from "lucide-react"

interface NoteEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  noteToEdit?: DailyNoteRecord | null
  defaultDate?: string // YYYY-MM-DD
  existingNotes?: DailyNoteRecord[]
  isPartnerContext?: boolean
  partnerDisplayName?: string
  onSuccess?: (noteId?: string) => void
}

interface NoteEditorFormProps {
  noteToEdit?: DailyNoteRecord | null
  defaultDate?: string
  existingNotes: DailyNoteRecord[]
  isPartnerContext?: boolean
  partnerDisplayName?: string
  onClose: () => void
  onSuccess?: (noteId?: string) => void
}

function NoteEditorForm({
  noteToEdit,
  defaultDate,
  isPartnerContext = false,
  partnerDisplayName,
  onClose,
  onSuccess,
}: NoteEditorFormProps) {
  const [requestId] = React.useState(() => crypto.randomUUID())
  const isEditing = Boolean(noteToEdit)
  const todayStr = React.useMemo(() => getTodayDateString(), [])

  const [date, setDate] = React.useState(
    noteToEdit?.date || defaultDate || todayStr
  )
  const [content, setContent] = React.useState(noteToEdit?.content || "")
  const [error, setError] = React.useState<string | null>(null)
  const [isPending, setIsPending] = React.useState(false)

  const charCount = content.length
  const isOverLimit = charCount > NOTE_MAX_LENGTH

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)

    if (!date) {
      setError("Please select a date.")
      return
    }

    if (date > todayStr) {
      setError("Notes cannot be logged for future dates.")
      return
    }

    const trimmed = content.trim()
    if (!trimmed) {
      setError("Please write something in your note before saving.")
      return
    }

    if (trimmed.length > NOTE_MAX_LENGTH) {
      setError(`Note cannot exceed ${NOTE_MAX_LENGTH.toLocaleString()} characters.`)
      return
    }

    setIsPending(true)
    try {
      if (isPartnerContext) {
        if (isEditing && noteToEdit) {
          const res = await updatePartnerDailyNoteAction({
            noteId: noteToEdit.id,
            content: trimmed,
          })
          if (!res.ok) {
            setError(res.error || "Failed to update daily note.")
          } else {
            onClose()
            onSuccess?.(noteToEdit.id)
          }
        } else {
          const res = await createPartnerDailyNoteAction({
            requestId,
            date,
            content: trimmed,
          })
          if (!res.ok) {
            setError(res.error || "Failed to save daily note.")
          } else {
            onClose()
            onSuccess?.(res.data?.noteId)
          }
        }
      } else {
        const formData = new FormData()
        formData.append("request_id", requestId)
        formData.append("date", date)
        formData.append("content", trimmed)

        let result
        if (isEditing && noteToEdit) {
          result = await updateDailyNoteAction(noteToEdit.id, null, formData)
        } else {
          result = await createDailyNoteAction(null, formData)
        }

        if (!result.success) {
          setError(result.error || "Failed to save daily note.")
        } else {
          onClose()
          onSuccess?.(result.noteId)
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.")
    } finally {
      setIsPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-1">
      {/* Error Banner */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs sm:text-sm text-destructive"
        >
          <AlertCircle className="size-4 shrink-0 mt-0.5" />
          <span className="leading-snug">{error}</span>
        </div>
      )}

      {/* Date Picker */}
      <div className="space-y-1.5">
        <Label htmlFor="noteDate">Date *</Label>
        <DatePicker
          id="noteDate"
          value={date}
          onChange={setDate}
          maxDate={todayStr}
          placeholder="Select date"
          disabled={isPending}
        />
      </div>

      {/* Note Content Textarea */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="noteContent">
            {isPartnerContext ? `Note for ${partnerDisplayName || "Partner"} *` : "Your Note *"}
          </Label>
          <span
            className={`text-[11px] font-medium transition-colors ${
              isOverLimit
                ? "text-destructive font-semibold"
                : charCount > NOTE_MAX_LENGTH * 0.9
                ? "text-amber-500"
                : "text-muted-foreground"
            }`}
            aria-live="polite"
          >
            {charCount.toLocaleString()} / {NOTE_MAX_LENGTH.toLocaleString()}
          </span>
        </div>

        <textarea
          id="noteContent"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={
            isPartnerContext
              ? `Add a note or observation for ${partnerDisplayName || "partner"}...`
              : "How are you feeling today? Any thoughts, physical observations, or reminders..."
          }
          rows={5}
          disabled={isPending}
          className="w-full rounded-xl border border-border/80 bg-card p-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/15 transition-all resize-y min-h-[120px]"
        />
      </div>

      <DialogFooter className="pt-2 gap-2 sm:gap-0">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isPending || isOverLimit}>
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin mr-2" />
              Saving...
            </>
          ) : isEditing ? (
            "Save Changes"
          ) : (
            "Save Note"
          )}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function NoteEditorDialog({
  open,
  onOpenChange,
  noteToEdit,
  defaultDate,
  existingNotes = [],
  isPartnerContext = false,
  partnerDisplayName,
  onSuccess,
}: NoteEditorDialogProps) {
  const isEditing = Boolean(noteToEdit)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-lavender text-primary border border-lavender-border/70 shrink-0">
              <FileText className="size-4.5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold text-foreground">
                {isEditing ? "Edit Daily Note" : "Write Daily Note"}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {isPartnerContext
                  ? `Notes for ${partnerDisplayName || "partner"}'s cycle.`
                  : "Notes follow your sharing settings. Sent versions cannot be changed."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {open && (
          <NoteEditorForm
            key={noteToEdit?.id ?? defaultDate ?? "new-note"}
            noteToEdit={noteToEdit}
            defaultDate={defaultDate}
            existingNotes={existingNotes}
            isPartnerContext={isPartnerContext}
            partnerDisplayName={partnerDisplayName}
            onClose={() => onOpenChange(false)}
            onSuccess={onSuccess}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
