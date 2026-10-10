"use client"

import * as React from "react"
import { logoutAction } from "@/app/actions/auth"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { LogOut, Loader2, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { useRouter } from "next/navigation"

import { setSessionLocked, clearRememberedUser } from "@/lib/auth/mpin-storage"

interface LogoutButtonProps {
  variant?: "destructive" | "listItem"
  className?: string
}

export function LogoutButton({ variant = "destructive", className }: LogoutButtonProps = {}) {
  const [isLoggingOut, setIsLoggingOut] = React.useState(false)
  const router = useRouter()

  const handleLogout = async () => {
    setIsLoggingOut(true)
    clearRememberedUser()
    setSessionLocked(false)
    try {
      await logoutAction()
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) {
        return
      }
      try {
        const supabase = createClient()
        await supabase.auth.signOut()
      } catch {
        // Continue to the login screen if the session is already gone.
      }
      router.push("/login")
      router.refresh()
    }
  }

  if (variant === "listItem") {
    return (
      <button
        type="button"
        onClick={handleLogout}
        disabled={isLoggingOut}
        className={cn(
          "w-full flex items-center justify-between gap-4 py-4 px-2 text-left transition-colors select-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl hover:bg-destructive/10 active:bg-destructive/20 text-foreground group",
          className
        )}
      >
        <div className="flex items-center gap-4 min-w-0 flex-1">
          {isLoggingOut ? (
            <Loader2 className="size-5.5 text-destructive shrink-0 animate-spin" />
          ) : (
            <LogOut className="size-5.5 text-foreground/80 shrink-0 stroke-[2] group-hover:text-destructive transition-colors" />
          )}
          <span className="text-base font-medium text-foreground tracking-tight group-hover:text-destructive transition-colors">
            {isLoggingOut ? "Logging out..." : "Logout"}
          </span>
        </div>
        <ChevronRight className="size-5 text-primary stroke-[2.5] shrink-0" />
      </button>
    )
  }

  return (
    <Button
      variant="destructive"
      size="sm"
      onClick={handleLogout}
      disabled={isLoggingOut}
      className={cn("gap-2 h-10 px-4", className)}
    >
      {isLoggingOut ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          <span>Signing out...</span>
        </>
      ) : (
        <>
          <LogOut className="size-4" />
          <span>Sign Out</span>
        </>
      )}
    </Button>
  )
}
