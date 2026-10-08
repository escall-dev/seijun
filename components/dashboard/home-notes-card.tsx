"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { NoteEditorDialog } from "@/components/notes/note-editor-dialog"
import { BookOpen, Plus, ArrowRight } from "lucide-react"

interface HomeNotesCardProps {
  todayStr: string
  hasActivePartner?: boolean
  partnerDisplayName?: string | null
}

export function HomeNotesCard({
  todayStr,
  hasActivePartner = false,
  partnerDisplayName,
}: HomeNotesCardProps) {
  const router = useRouter()
  const [editorOpen, setEditorOpen] = React.useState(false)

  const handleSuccess = () => {
    router.refresh()
  }

  return (
    <>
      <Card className="border-border/80 dark:border-border/60 bg-card overflow-hidden shadow-redi-card">
        <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-lavender text-primary border border-lavender-border/60 shadow-xs">
              <BookOpen className="size-5" />
            </div>

            <div className="space-y-0.5 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-semibold text-foreground tracking-tight">
                  Daily Notes
                </h3>
                <Badge
                  variant="outline"
                  className="text-[10px] font-normal border-border/70 text-muted-foreground px-2 py-0"
                >
                  {hasActivePartner ? "Shared & Private" : "Private Journal"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {hasActivePartner
                  ? `Daily reflections and messages with ${partnerDisplayName || "your partner"}.`
                  : "Private personal daily reflections and cycle journal."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-border/40">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditorOpen(true)}
              className="gap-1.5 text-xs font-medium rounded-full shadow-2xs h-8 px-3"
            >
              <Plus className="size-3.5" />
              <span>Add Note</span>
            </Button>

            <Link
              href="/notes"
              prefetch={true}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary-hover shadow-xs transition-all group shrink-0"
            >
              <span>View Notes</span>
              <ArrowRight className="size-3.5 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>
        </CardContent>
      </Card>

      <NoteEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        defaultDate={todayStr}
        isPartnerContext={false}
        partnerDisplayName={partnerDisplayName || undefined}
        onSuccess={handleSuccess}
      />
    </>
  )
}
