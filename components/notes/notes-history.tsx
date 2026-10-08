"use client"

import * as React from "react"
import { getOlderNotesAction } from "@/app/actions/notes"
import { groupNotesByDate, canEditNote, getNoteAuthorLabel } from "@/lib/notes/timeline"
import { getTodayDateString } from "@/lib/calculations/cycle-calculations"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { NoteEditorDialog } from "@/components/notes/note-editor-dialog"
import { NoteDeleteDialog } from "@/components/notes/note-delete-dialog"
import type { DailyNoteRecord } from "@/app/actions/notes"
import {
  BookOpen,
  Plus,
  Pencil,
  Trash2,
  Calendar,
  Clock,
  ChevronDown,
  ChevronUp,
  User,
  Users,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface NotesHistoryProps {
  initialTab?: "own" | "partner"
  ownCursor?: string | null
  partnerCursor?: string | null
  snapshot?: string
  notes: DailyNoteRecord[]
  partnerNotes?: DailyNoteRecord[]
  isPartnerContext?: boolean
  hasActivePartner?: boolean
  partnerDisplayName?: string
  partnerUserId?: string | null
  canManage?: boolean
  currentUserId?: string
}

function formatDateHeader(dateStr: string): { formatted: string; relative: string | null } {
  try {
    const todayStr = getTodayDateString()
    const yesterday = new Date(todayStr + "T12:00:00")
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`

    const [y, m, d] = dateStr.split("-").map(Number)
    const dateObj = new Date(y, m - 1, d)
    const formatted = dateObj.toLocaleDateString("en-US", {
      weekday: "short",
      month: "long",
      day: "numeric",
      year: "numeric",
    })

    let relative: string | null = null
    if (dateStr === todayStr) relative = "Today"
    else if (dateStr === yesterdayStr) relative = "Yesterday"

    return { formatted, relative }
  } catch {
    return { formatted: dateStr, relative: null }
  }
}

function formatPostingTime(isoString?: string): string {
  if (!isoString) return ""
  try {
    const d = new Date(isoString)
    return d.toLocaleString("en-US", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", timeZoneName: "short" })
  } catch {
    return ""
  }
}

const TRUNCATE_LENGTH = 300

interface DateGroup {
  date: string
  entries: DailyNoteRecord[]
}

function NoteEntryItem({
  note,
  canManage,
  showAuthor,
  partnerDisplayName,
  partnerUserId,
  currentUserId,
  onEdit,
  onDelete,
}: {
  note: DailyNoteRecord
  canManage: boolean
  showAuthor?: boolean
  partnerDisplayName?: string
  partnerUserId?: string | null
  currentUserId?: string
  onEdit: (note: DailyNoteRecord) => void
  onDelete: (note: DailyNoteRecord) => void
}) {
  const [isExpanded, setIsExpanded] = React.useState(false)
  const isLong = note.content.length > TRUNCATE_LENGTH
  const displayContent = isLong && !isExpanded
    ? `${note.content.slice(0, TRUNCATE_LENGTH)}...`
    : note.content

  const postingTime = formatPostingTime(note.created_at)
  const authorLabel = getNoteAuthorLabel(note, currentUserId, partnerUserId, partnerDisplayName)
  const isSelf = authorLabel === "You"

  return (
    <div className="p-3.5 sm:p-4 rounded-xl bg-secondary/30 border border-border/40 space-y-2.5 transition-all hover:border-primary/30">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {postingTime && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground bg-background/80 px-2 py-0.5 rounded-md border border-border/40 font-mono">
              <Clock className="size-3 text-primary shrink-0" />
              {postingTime}
            </span>
          )}

          {showAuthor && (
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] px-1.5 py-0 font-normal",
                isSelf
                  ? "border-primary/30 text-primary bg-primary/5"
                  : "border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/5"
              )}
            >
              {authorLabel}
            </Badge>
          )}
        </div>

        {canManage && canEditNote(note, currentUserId) && (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`Edit note from ${postingTime || note.date}`}
              onClick={() => onEdit(note)}
              className="size-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/70"
            >
              <Pencil className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`Delete note from ${postingTime || note.date}`}
              onClick={() => onDelete(note)}
              className="size-7 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        )}
      </div>

      {note.sent_at && <p className="text-[11px] text-muted-foreground">Sent · To revise, add a new note.</p>}
      <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed break-words">
        {displayContent}
      </p>

      {isLong && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="h-6 px-2 text-xs font-medium text-primary hover:text-primary/80 hover:bg-lavender/50 gap-1"
        >
          {isExpanded ? (
            <>
              <span>Show less</span>
              <ChevronUp className="size-3" />
            </>
          ) : (
            <>
              <span>Read more</span>
              <ChevronDown className="size-3" />
            </>
          )}
        </Button>
      )}
    </div>
  )
}

function DateGroupCard({
  group,
  canManage,
  showAuthor,
  partnerDisplayName,
  partnerUserId,
  currentUserId,
  onEdit,
  onDelete,
}: {
  group: DateGroup
  canManage: boolean
  showAuthor?: boolean
  partnerDisplayName?: string
  partnerUserId?: string | null
  currentUserId?: string
  onEdit: (note: DailyNoteRecord) => void
  onDelete: (note: DailyNoteRecord) => void
}) {
  const { formatted, relative } = formatDateHeader(group.date)

  return (
    <Card className="overflow-hidden hover:border-primary/40 transition-all shadow-xs">
      <CardHeader className="pb-2.5 pt-4 px-4 sm:px-5 border-b border-border/40 bg-secondary/15">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-foreground font-semibold text-sm sm:text-base">
            <Calendar className="size-4 text-primary shrink-0" />
            <span>{formatted}</span>
            {relative && (
              <Badge variant="lavender" className="text-[10px] font-medium py-0 px-2">
                {relative}
              </Badge>
            )}
          </div>
          <span className="text-xs text-muted-foreground font-medium">
            {group.entries.length === 1
              ? "1 entry"
              : `${group.entries.length} entries`}
          </span>
        </div>
      </CardHeader>

      <CardContent className="p-3 sm:p-4 space-y-3">
        {group.entries.map((note) => (
          <NoteEntryItem
            key={note.id}
            note={note}
            canManage={canManage}
            showAuthor={showAuthor}
            partnerDisplayName={partnerDisplayName}
            partnerUserId={partnerUserId}
            currentUserId={currentUserId}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </CardContent>
    </Card>
  )
}

export function NotesHistory({
  initialTab = "own",
  ownCursor = null, partnerCursor = null, snapshot = new Date().toISOString(),
  notes,
  partnerNotes = [],
  isPartnerContext = false,
  hasActivePartner = false,
  partnerDisplayName = "Partner",
  partnerUserId,
  canManage = true,
  currentUserId,
}: NotesHistoryProps) {
  const [older, setOlder] = React.useState<{ own: DailyNoteRecord[]; partner: DailyNoteRecord[] }>({ own: [], partner: [] })
  const [cursors, setCursors] = React.useState({ own: ownCursor, partner: partnerCursor })
  const [loadingOlder, setLoadingOlder] = React.useState(false)
  const [pageError, setPageError] = React.useState<string | null>(null)

  // Tab state for Cycle Owner when partner notes exist or partner is active
  const showTabs = !isPartnerContext && (hasActivePartner || partnerNotes.length > 0)
  const [activeTab, setActiveTab] = React.useState<"own" | "partner">(initialTab)

  const [editorOpen, setEditorOpen] = React.useState(false)
  const [editTarget, setEditTarget] = React.useState<DailyNoteRecord | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<DailyNoteRecord | null>(null)

  const activeNotes = React.useMemo(() => isPartnerContext
    ? [...notes, ...older.own]
    : activeTab === "partner"
    ? [...partnerNotes, ...older.partner]
    : [...notes, ...older.own], [isPartnerContext, activeTab, notes, partnerNotes, older])

  const groupedNotes = React.useMemo(() => {
    return groupNotesByDate(activeNotes)
  }, [activeNotes])

  const handleOpenCreate = () => {
    setEditTarget(null)
    setEditorOpen(true)
  }

  const handleEdit = (note: DailyNoteRecord) => {
    setEditTarget(note)
    setEditorOpen(true)
  }

  const handleDelete = (note: DailyNoteRecord) => {
    setDeleteTarget(note)
  }

  const handleSuccess = () => { setOlder({ own: [], partner: [] }) }

  const loadOlder = async () => {
    const tab = isPartnerContext ? "own" : activeTab
    const cursor = cursors[tab]
    if (!cursor || loadingOlder) return
    setLoadingOlder(true)
    setPageError(null)
    try {
      const page = await getOlderNotesAction({ cursor, snapshot, author: isPartnerContext ? "all" : tab, partnerView: isPartnerContext })
      setOlder(previous => ({ ...previous, [tab]: [...new Map([...previous[tab], ...page.notes].map(note => [note.id, note])).values()] }))
      setCursors(previous => ({ ...previous, [tab]: page.nextCursor }))
    } catch { setPageError("Could not load older notes. Please try again.") }
    finally { setLoadingOlder(false) }
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Bidirectional Tabs for Cycle Owner */}
      {showTabs && (
        <div className="flex border-b border-border/60 gap-4 text-sm font-medium">
          <button
            type="button"
            onClick={() => setActiveTab("own")}
            className={cn(
              "pb-2.5 px-1 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5",
              activeTab === "own"
                ? "border-primary text-foreground font-semibold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <User className="size-3.5" />
            <span>My Notes</span>
            <span className="ml-1 text-[11px] px-1.5 py-0.2 rounded-full bg-secondary text-muted-foreground">
              {notes.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("partner")}
            className={cn(
              "pb-2.5 px-1 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5",
              activeTab === "partner"
                ? "border-primary text-foreground font-semibold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Users className="size-3.5" />
            <span>Partner Notes</span>
            <span className="ml-1 text-[11px] px-1.5 py-0.2 rounded-full bg-secondary text-muted-foreground">
              {partnerNotes.length}
            </span>
          </button>
        </div>
      )}

      {/* Header action row */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            {isPartnerContext
              ? `${partnerDisplayName}'s Journal Entries`
              : activeTab === "partner"
              ? `Notes from ${partnerDisplayName}`
              : "Journal Entries"}
          </h2>
          <p className="text-xs text-muted-foreground">
            {activeNotes.length === 1
              ? "1 note recorded"
              : `${activeNotes.length} notes recorded`}
          </p>
        </div>

        {canManage && (
          <Button
            type="button"
            onClick={handleOpenCreate}
            size="sm"
            className="gap-1.5 rounded-xl shadow-redi-sm cursor-pointer"
          >
            <Plus className="size-4" />
            <span>Add Note</span>
          </Button>
        )}
      </div>

      {/* Notes List or Empty State */}
      {activeNotes.length === 0 ? (
        <Card className="rounded-2xl border-dashed border-border/80 p-8 sm:p-12 text-center bg-card/50">
          <div className="flex flex-col items-center justify-center space-y-3 max-w-xs mx-auto">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-lavender text-primary border border-lavender-border/70">
              {activeTab === "partner" || isPartnerContext ? (
                <Users className="size-7" />
              ) : (
                <BookOpen className="size-7" />
              )}
            </div>
            <div className="space-y-1">
              <p className="text-base font-semibold text-foreground">
                {activeTab === "partner" || isPartnerContext
                  ? "No partner notes yet."
                  : "Nothing written yet."}
              </p>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                {activeTab === "partner"
                  ? `Notes created by ${partnerDisplayName} will appear here.`
                  : isPartnerContext
                  ? `No daily notes recorded for ${partnerDisplayName}'s cycle yet.`
                  : "Add a note whenever you'd like to remember how your day went."}
              </p>
            </div>
            {canManage && (
              <Button
                type="button"
                onClick={handleOpenCreate}
                className="gap-1.5 rounded-xl shadow-redi-sm pt-1 cursor-pointer"
              >
                <Plus className="size-4" />
                <span>Write Your First Note</span>
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {groupedNotes.map((group) => (
            <DateGroupCard
              key={group.date}
              group={group}
              canManage={canManage}
              showAuthor={true}
              partnerDisplayName={partnerDisplayName}
              partnerUserId={partnerUserId}
              currentUserId={currentUserId}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {pageError && <p role="alert" className="text-sm text-destructive">{pageError}</p>}
      {cursors[isPartnerContext ? "own" : activeTab] && <Button variant="outline" disabled={loadingOlder} onClick={loadOlder}>{loadingOlder ? "Loading older dates…" : "Load older dates"}</Button>}
      {/* Note Editor Modal */}
      <NoteEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        noteToEdit={editTarget}
        existingNotes={activeNotes}
        isPartnerContext={isPartnerContext}
        partnerDisplayName={partnerDisplayName}
        onSuccess={handleSuccess}
      />

      {/* Note Delete Confirmation Modal */}
      <NoteDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        note={deleteTarget}
        isPartnerContext={isPartnerContext}
        onSuccess={handleSuccess}
      />
    </div>
  )
}
