"use client"

import { useState } from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { getCalendarGrid, getMonthName, WEEK_DAYS } from "@/lib/calculations/calendar-calculations"
import { parseDateString, type EstimatedNextPeriod } from "@/lib/calculations/cycle-calculations"
import type { CycleRecord } from "@/app/actions/cycles"
import { cn } from "@/lib/utils"

export function CompactCalendar({ cycles, todayStr, prediction }: { cycles: CycleRecord[]; todayStr: string; prediction: EstimatedNextPeriod | null }) {
  const today = parseDateString(todayStr)
  const [month, setMonth] = useState({ year: today.getFullYear(), month: today.getMonth() })
  const move = (offset: number) => {
    const date = new Date(month.year, month.month + offset, 1)
    setMonth({ year: date.getFullYear(), month: date.getMonth() })
  }
  const cells = getCalendarGrid({ ...month, cycles, todayStr })
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => move(-1)}><ChevronLeft className="size-4" /></Button>
        <h2 className="text-sm font-semibold">{getMonthName(month.month)} {month.year}</h2>
        <Button variant="ghost" size="icon-sm" aria-label="Next month" onClick={() => move(1)}><ChevronRight className="size-4" /></Button>
      </div>
      <div className="grid grid-cols-7 text-center gap-1 text-xs">
        {WEEK_DAYS.map(day => <span key={day} className="text-muted-foreground py-1">{day}</span>)}
        {cells.map(cell => {
          const predicted = prediction && cell.dateStr >= (prediction.windowStartDate ?? prediction.estimatedStartDate) && cell.dateStr <= (prediction.windowEndDate ?? prediction.estimatedStartDate)
          return <Link prefetch={false} key={cell.dateStr} href={`/calendar?date=${cell.dateStr}`} aria-label={`${cell.dateStr}${cell.periodDay ? ", recorded period" : predicted ? ", estimated period" : ""}`} className={cn("min-h-9 flex items-center justify-center rounded-lg", !cell.isCurrentMonth && "text-muted-foreground/50", cell.periodDay && "bg-primary text-primary-foreground", predicted && !cell.periodDay && "border border-dashed border-primary text-primary", cell.isToday && "ring-2 ring-primary/50")}>{cell.dayNumber}</Link>
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">Filled: recorded period · Dashed: estimated period</p>
      <Link href="/calendar" prefetch={true} className="text-sm font-semibold text-primary">Open Calendar</Link>
    </Card>
  )
}
