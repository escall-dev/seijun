"use client"

import { getSymptomValues } from "@/lib/symptoms/constants"

import * as React from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { CycleRecord, FlowLevel } from "@/app/actions/cycles"
import type { SymptomRecord } from "@/app/actions/symptoms"
import type { DailyNoteRecord } from "@/app/actions/notes"
import {
  getCalendarGrid,
  getSelectedDateContext,
  getMonthName,
  formatShortDate,
  WEEK_DAYS,
  type CalendarDayCell,
} from "@/lib/calculations/calendar-calculations"
import { canEditNote } from "@/lib/notes/timeline"
import { useUserProfile } from "@/lib/hooks/use-user-profile"
import { getTodayDateString } from "@/lib/calculations/cycle-calculations"
import { getSeverityLabel } from "@/lib/symptoms/constants"
import { SymptomLogDialog } from "@/components/symptoms/symptom-log-dialog"
import { NoteEditorDialog } from "@/components/notes/note-editor-dialog"
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Droplet,
  ArrowRight,
  Sparkles,
  Info,
  CalendarCheck,
  Activity,
  Plus,
  FileText,
  Pencil,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface CalendarViewProps {
  cycles: CycleRecord[]
  initialDate?: string // YYYY-MM-DD
  symptoms?: SymptomRecord[]
  notes?: DailyNoteRecord[]
  isPartnerView?: boolean
  partnerDisplayName?: string
}

export function CalendarView({
  cycles,
  initialDate,
  symptoms = [],
  notes = [],
  isPartnerView = false,
  partnerDisplayName,
}: CalendarViewProps) {
  const { userId } = useUserProfile()
  const todayStr = React.useMemo(() => getTodayDateString(), [])
  const [selectedDateStr, setSelectedDateStr] = React.useState<string>(
    initialDate || todayStr
  )

  // Calendar month/year navigation state
  const [viewDate, setViewDate] = React.useState<Date>(() => {
    const base = initialDate ? new Date(initialDate + "T00:00:00") : new Date()
    return new Date(base.getFullYear(), base.getMonth(), 1)
  })

  const viewYear = viewDate.getFullYear()
  const viewMonth = viewDate.getMonth()

  const handlePrevMonth = () => {
    setViewDate(new Date(viewYear, viewMonth - 1, 1))
  }

  const handleNextMonth = () => {
    setViewDate(new Date(viewYear, viewMonth + 1, 1))
  }

  const handleGoToToday = () => {
    const today = new Date()
    setViewDate(new Date(today.getFullYear(), today.getMonth(), 1))
    setSelectedDateStr(todayStr)
  }

  // Handle cell click (if user clicks an adjacent-month date, also navigate to that month)
  const handleSelectCell = (cell: CalendarDayCell) => {
    setSelectedDateStr(cell.dateStr)
    if (!cell.isCurrentMonth) {
      const [cellY, cellM] = cell.dateStr.split("-").map(Number)
      setViewDate(new Date(cellY, cellM - 1, 1))
    }
  }

  // Compute calendar grid for the current view
  const gridCells = React.useMemo(() => {
    return getCalendarGrid({
      year: viewYear,
      month: viewMonth,
      cycles,
      todayStr,
    })
  }, [viewYear, viewMonth, cycles, todayStr])

  // Compute selected date context
  const selectedContext = React.useMemo(() => {
    return getSelectedDateContext({
      selectedDateStr,
      cycles,
      todayStr,
    })
  }, [selectedDateStr, cycles, todayStr])

  // Build set of dates that have symptom records for the symptom dot indicator
  const symptomDateSet = React.useMemo(() => {
    return new Set(symptoms.map((s) => s.date))
  }, [symptoms])

  // Symptoms for the currently selected date
  const selectedDateSymptoms = React.useMemo(() => {
    return symptoms.filter((s) => s.date === selectedDateStr)
  }, [symptoms, selectedDateStr])

  // Symptom log dialog for calendar "Add Symptom" action
  const [symptomLogOpen, setSymptomLogOpen] = React.useState(false)

  // Build set of dates that have daily note records for the note dot indicator
  const noteDateSet = React.useMemo(() => {
    return new Set(notes.map((n) => n.date))
  }, [notes])

  // Daily notes for the currently selected date, newest first
  const selectedDateNotes = React.useMemo(() => {
    return notes
      .filter((n) => n.date === selectedDateStr)
      .sort((a, b) => {
        const timeA = a.created_at ? new Date(a.created_at).getTime() : 0
        const timeB = b.created_at ? new Date(b.created_at).getTime() : 0
        return timeB - timeA
      })
  }, [notes, selectedDateStr])

  // Note editor dialog state
  const [noteEditorOpen, setNoteEditorOpen] = React.useState(false)
  const [editingNote, setEditingNote] = React.useState<DailyNoteRecord | null>(null)

  const monthTitle = `${getMonthName(viewMonth)} ${viewYear}`

  // Flow dots renderer
  const renderFlowIndicator = (flow: FlowLevel | null, isSelected: boolean) => {
    if (!flow) {
      return (
        <span
          className={cn(
            "size-1.5 rounded-full",
            isSelected ? "bg-primary-foreground" : "bg-primary"
          )}
        />
      )
    }

    if (flow === "light") {
      return (
        <span className="flex items-center justify-center gap-0.5">
          <span
            className={cn(
              "size-1.5 rounded-full",
              isSelected ? "bg-primary-foreground" : "bg-pink-accent-foreground"
            )}
          />
        </span>
      )
    }

    if (flow === "medium") {
      return (
        <span className="flex items-center justify-center gap-0.5">
          <span
            className={cn(
              "size-1.5 rounded-full",
              isSelected ? "bg-primary-foreground" : "bg-primary"
            )}
          />
          <span
            className={cn(
              "size-1.5 rounded-full",
              isSelected ? "bg-primary-foreground" : "bg-primary"
            )}
          />
        </span>
      )
    }

    // Heavy flow
    return (
      <span className="flex items-center justify-center gap-0.5">
        <span
          className={cn(
            "size-1.5 rounded-full",
            isSelected ? "bg-primary-foreground" : "bg-primary"
          )}
        />
        <span
          className={cn(
            "size-1.5 rounded-full",
            isSelected ? "bg-primary-foreground" : "bg-primary"
          )}
        />
        <span
          className={cn(
            "size-1.5 rounded-full",
            isSelected ? "bg-primary-foreground" : "bg-primary"
          )}
        />
      </span>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* 1. Main Calendar Card */}
      <Card className="overflow-hidden">
        {/* Navigation & Header Controls */}
        <CardHeader className="pb-3 border-b border-border/50">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="flex size-9 items-center justify-center rounded-xl bg-lavender text-primary border border-lavender-border/70 shrink-0">
                <CalendarIcon className="size-4.5" />
              </div>
              <div>
                <CardTitle className="text-lg sm:text-xl font-semibold tracking-tight text-foreground">
                  {monthTitle}
                </CardTitle>
                <CardDescription className="text-xs">
                  Menstrual cycle timeline
                </CardDescription>
              </div>
            </div>

            {/* Navigation Buttons */}
            <div className="flex items-center gap-1 sm:gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleGoToToday}
                className="h-8 px-2.5 text-xs font-medium rounded-lg text-foreground hover:text-primary hover:bg-lavender/50 border-border/70"
              >
                Today
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={handlePrevMonth}
                aria-label="Previous month"
                className="size-8 rounded-lg text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={handleNextMonth}
                aria-label="Next month"
                className="size-8 rounded-lg text-muted-foreground hover:text-foreground"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-3 sm:p-5 space-y-4">
          {/* Weekday Header Row */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {WEEK_DAYS.map((wd) => (
              <span
                key={wd}
                className="text-[11px] sm:text-xs font-medium text-muted-foreground py-1 select-none tracking-wide"
              >
                {wd}
              </span>
            ))}
          </div>

          {/* Monthly Day Grid */}
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
            {gridCells.map((cell) => {
              const isSelected = selectedDateStr === cell.dateStr
              const isToday = cell.isToday
              const isPeriod = Boolean(cell.periodDay)
              const isCurrentMonth = cell.isCurrentMonth
              const flow = cell.periodDay?.flow ?? null

              return (
                <button
                  key={cell.dateStr}
                  type="button"
                  onClick={() => handleSelectCell(cell)}
                  aria-label={`${cell.dateStr}${isPeriod ? ` - Period Day (${flow || "recorded"})` : ""}${isToday ? " - Today" : ""}`}
                  aria-pressed={isSelected}
                  data-selected={isSelected}
                  className={cn(
                    "group relative flex flex-col items-center justify-between min-h-[46px] sm:min-h-[52px] p-1 sm:p-1.5 rounded-xl transition-all duration-150 select-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                    // Base background & text colors
                    isCurrentMonth
                      ? "text-foreground"
                      : "text-muted-foreground/45 hover:text-foreground/75",

                    // Period Day styling
                    isPeriod && !isSelected && "bg-lavender/70 border border-lavender-border/80 text-primary font-medium hover:bg-lavender",

                    // Non-period, normal styling
                    !isPeriod && !isSelected && (
                      isCurrentMonth
                        ? "hover:bg-secondary/70 border border-transparent"
                        : "hover:bg-secondary/40 border border-transparent"
                    ),

                    // Today styling (strong, elegant border / badge accent)
                    isToday && !isSelected && "ring-1.5 ring-primary/60 font-semibold text-primary",

                    // Selected styling (clear priority, distinguishable from today)
                    isSelected && isPeriod && "bg-primary text-primary-foreground font-semibold shadow-redi-sm ring-2 ring-primary ring-offset-1 ring-offset-card",
                    isSelected && !isPeriod && "bg-secondary text-foreground font-semibold ring-2 ring-primary shadow-xs"
                  )}
                >
                  {/* Top Day Number */}
                  <div className="w-full flex items-center justify-between">
                    <span
                      className={cn(
                        "text-xs sm:text-sm leading-none pl-0.5",
                        isSelected && isPeriod ? "text-primary-foreground font-semibold" : "",
                        isToday && !isSelected ? "text-primary font-bold" : "",
                        !isCurrentMonth && !isSelected ? "opacity-60" : ""
                      )}
                    >
                      {cell.dayNumber}
                    </span>

                    {/* Today indicator dot on top-right */}
                    {isToday && (
                      <span
                        className={cn(
                          "size-1.5 rounded-full shrink-0",
                          isSelected ? "bg-primary-foreground" : "bg-primary"
                        )}
                        title="Today"
                      />
                    )}
                  </div>

                  {/* Bottom Indicator: Flow dots for period days, symptom dot & note dot for non-period days */}
                  <div className="w-full min-h-[14px] flex items-center justify-center pt-1 gap-1">
                    {isPeriod ? (
                      renderFlowIndicator(flow, isSelected)
                    ) : (
                      <>
                        {symptomDateSet.has(cell.dateStr) && isCurrentMonth && (
                          <span
                            className={cn(
                              "size-1.5 rounded-full",
                              isSelected ? "bg-primary-foreground/80" : "bg-pink-accent-foreground/70"
                            )}
                            title="Symptoms logged"
                          />
                        )}
                        {noteDateSet.has(cell.dateStr) && isCurrentMonth && (
                          <span
                            className={cn(
                              "size-1.5 rounded-sm",
                              isSelected ? "bg-primary-foreground/80" : "bg-primary/70"
                            )}
                            title="Daily note logged"
                          />
                        )}
                      </>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Flow & Legend Footer */}
          <div className="pt-2 border-t border-border/40 flex items-center justify-between flex-wrap gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-primary" />
                <span className="text-[11px] sm:text-xs">Period day</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="flex items-center gap-0.5">
                  <span className="size-1.5 rounded-full bg-pink-accent-foreground" />
                </span>
                <span className="text-[11px] sm:text-xs">Light</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="flex items-center gap-0.5">
                  <span className="size-1.5 rounded-full bg-primary" />
                  <span className="size-1.5 rounded-full bg-primary" />
                </span>
                <span className="text-[11px] sm:text-xs">Medium</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="flex items-center gap-0.5">
                  <span className="size-1.5 rounded-full bg-primary" />
                  <span className="size-1.5 rounded-full bg-primary" />
                  <span className="size-1.5 rounded-full bg-primary" />
                </span>
                <span className="text-[11px] sm:text-xs">Heavy</span>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm ring-1.5 ring-primary/60" />
                <span className="text-[11px] sm:text-xs">Today</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-secondary ring-1.5 ring-primary" />
                <span className="text-[11px] sm:text-xs">Selected</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-pink-accent-foreground/70" />
                <span className="text-[11px] sm:text-xs">Symptoms</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-sm bg-primary/70" />
                <span className="text-[11px] sm:text-xs">Note</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. Selected Date Context Information Card */}
      <Card>
        <CardContent className="p-4 sm:p-5 space-y-4">
          {/* Header Row: Date & Status Badges */}
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-semibold text-foreground">
                  {selectedContext.formattedDate}
                </h2>
                {selectedContext.isToday && (
                  <Badge variant="lavender" className="text-[11px] font-medium px-2 py-0.5">
                    Today
                  </Badge>
                )}
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1.5">
                <CalendarCheck className="size-3.5 shrink-0 text-primary" />
                <span>{selectedContext.statusMessage}</span>
              </p>
            </div>

            {/* Badges for status */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {selectedContext.isPeriodDay && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-lavender text-primary font-medium text-xs border border-lavender-border/60">
                  <Droplet className="size-3" />
                  {selectedContext.flow ? `${selectedContext.flow} flow` : "Period day"}
                </span>
              )}

              {selectedContext.cycleDay !== null && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-secondary text-foreground/80 font-medium text-xs border border-border/50">
                  Cycle Day {selectedContext.cycleDay}
                </span>
              )}

              {selectedContext.isFuture && (
                <Badge variant="secondary" className="text-xs">
                  Future Date
                </Badge>
              )}
            </div>
          </div>

          {/* Body Information Panels */}
          {selectedContext.isPeriodDay && (
            <div className="rounded-xl bg-lavender/35 p-3.5 border border-lavender-border/50 space-y-2 text-xs sm:text-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Period status:</span>
                <span className="font-semibold text-primary capitalize">
                  {selectedContext.flow ? `${selectedContext.flow} flow` : "Logged"}
                </span>
              </div>
              {selectedContext.periodDayIndex !== null && (
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Period progression:</span>
                  <span className="font-medium text-foreground">
                    Day {selectedContext.periodDayIndex}
                    {selectedContext.periodDaysCount ? ` of ${selectedContext.periodDaysCount}` : ""}
                  </span>
                </div>
              )}
              {selectedContext.cycle && (
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Cycle start:</span>
                  <span className="font-medium text-foreground">
                    {formatShortDate(selectedContext.cycle.start_date)}
                  </span>
                </div>
              )}
            </div>
          )}

          {!selectedContext.isPeriodDay && selectedContext.cycle && (
            <div className="rounded-xl bg-secondary/50 p-3.5 border border-border/50 space-y-2 text-xs sm:text-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Cycle context:</span>
                <span className="font-medium text-foreground">
                  Cycle Day {selectedContext.cycleDay}
                </span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Cycle started on:</span>
                <span className="font-medium text-foreground">
                  {formatShortDate(selectedContext.cycle.start_date)}
                </span>
              </div>
              {selectedContext.isTrackingStartDay && selectedContext.cycle.period_days?.length === 0 && (
                <div className="flex items-center gap-1.5 text-primary text-xs pt-1">
                  <Sparkles className="size-3.5 shrink-0" />
                  <span>Your tracking begins with this cycle.</span>
                </div>
              )}
            </div>
          )}

          {selectedContext.isFuture && (
            <div className="rounded-xl bg-secondary/40 p-3.5 border border-border/40 text-xs sm:text-sm text-muted-foreground flex items-center gap-2">
              <Info className="size-4 shrink-0 text-muted-foreground" />
              <span>This date is in the future. Seijun only displays verified tracked history.</span>
            </div>
          )}

          {selectedContext.isBeforeHistory && (
            <div className="rounded-xl bg-secondary/40 p-3.5 border border-border/40 text-xs sm:text-sm text-muted-foreground flex items-center gap-2">
              <Info className="size-4 shrink-0 text-muted-foreground" />
              <span>This date precedes your tracked cycle history in Seijun.</span>
            </div>
          )}

          {/* Symptoms for selected date (personal cycle only) */}
          {!selectedContext.isFuture && !isPartnerView && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Activity className="size-3.5" />
                  Symptoms
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSymptomLogOpen(true)}
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-primary gap-1"
                >
                  <Plus className="size-3" />
                  Add Symptom
                </Button>
              </div>

              {selectedDateSymptoms.length === 0 ? (
                <p className="text-xs text-muted-foreground py-1">
                  No symptoms logged for this day.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {selectedDateSymptoms.map((s) => (
                    <span
                      key={s.id}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-secondary/80 text-foreground/90 font-medium text-xs border border-border/50"
                      aria-label={`${getSymptomValues(s).join(", ")}: ${getSeverityLabel(s.severity)}`}
                    >
                      {getSymptomValues(s).join(", ")}
                      <span className="text-muted-foreground">·</span>
                      <span className="capitalize text-muted-foreground">{getSeverityLabel(s.severity)}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Daily Note for selected date */}
          {!selectedContext.isFuture && (
            <div className="space-y-2 pt-1 border-t border-border/40">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <FileText className="size-3.5" />
                  {isPartnerView ? "Partner Note" : "Daily Note"}
                  {selectedDateNotes.length > 0 && (
                    <span className="text-[10px] text-muted-foreground font-normal">
                      ({selectedDateNotes.length})
                    </span>
                  )}
                </span>
                {!isPartnerView && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditingNote(null)
                      setNoteEditorOpen(true)
                    }}
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-primary gap-1 cursor-pointer"
                  >
                    <Plus className="size-3" />
                    <span>Add Note</span>
                  </Button>
                )}
              </div>

              {selectedDateNotes.length > 0 ? (
                <div className="space-y-2">
                  {selectedDateNotes.map((note) => (
                    <div
                      key={note.id}
                      className="rounded-xl bg-secondary/40 p-3 border border-border/50 space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        {note.created_at && (
                          <span className="font-mono">
                            {new Date(note.created_at).toLocaleTimeString([], {
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </span>
                        )}
                        {!isPartnerView && canEditNote(note, userId ?? undefined) && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => {
                              setEditingNote(note)
                              setNoteEditorOpen(true)
                            }}
                            className="size-6 text-muted-foreground hover:text-primary cursor-pointer"
                            aria-label="Edit note"
                          >
                            <Pencil className="size-3" />
                          </Button>
                        )}
                      </div>
                      <p className="text-xs sm:text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                        &ldquo;{note.content}&rdquo;
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground py-0.5">
                  No note for this day.
                </p>
              )}
            </div>
          )}

          {/* Action: Link to View Associated Cycle (Personal only) */}
          {selectedContext.cycle && !isPartnerView && (
            <div className="pt-2 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-xs font-medium rounded-xl hover:bg-lavender/60 hover:text-primary border-border/80"
                render={
                  <Link href={`/cycles/${selectedContext.cycle.id}`}>
                    <span>View Cycle</span>
                    <ArrowRight className="size-3.5" />
                  </Link>
                }
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Symptom Log Dialog (opened from calendar selected date) */}
      <SymptomLogDialog
        open={symptomLogOpen}
        onOpenChange={setSymptomLogOpen}
        defaultDate={selectedDateStr}
        onSuccess={() => { /* router.refresh() handled via revalidatePath server-side */ }}
      />

      {/* Daily Note Editor Dialog (opened from calendar selected date) */}
      <NoteEditorDialog
        open={noteEditorOpen}
        onOpenChange={setNoteEditorOpen}
        noteToEdit={editingNote}
        defaultDate={selectedDateStr}
        existingNotes={notes}
        onSuccess={() => { /* router.refresh() handled via revalidatePath server-side */ }}
      />
    </div>
  )
}
