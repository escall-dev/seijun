"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export interface MpinInputProps {
  value: string
  onChange: (value: string) => void
  onComplete?: (value: string) => void
  disabled?: boolean
  error?: boolean
  label?: string
  showClear?: boolean
  onClear?: () => void
  autoFocus?: boolean
  className?: string
  maskDigits?: boolean
  autoComplete?: string
  name?: string
  id?: string
}

/**
 * Seijun 6-Digit MPIN Input Component
 *
 * High-performance 6-box numeric MPIN interface optimized for mobile virtual keyboards.
 * Uses a single unified underlying input to eliminate mobile keyboard focus-hopping lag,
 * supporting instant 120fps fast typing, backspace navigation, auto-fill, and paste handling.
 */
export function MpinInput({
  value,
  onChange,
  onComplete,
  disabled = false,
  error = false,
  label = "Enter your MPIN",
  showClear = true,
  onClear,
  autoFocus = true,
  className,
  maskDigits = true,
  autoComplete = "current-password",
  name = "mpin",
  id = "mpin-input",
}: MpinInputProps) {
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  const [isFocused, setIsFocused] = React.useState(false)

  // Keep selection pinned to the end to prevent cursor displacement between slots
  const keepSelectionAtEnd = React.useCallback(() => {
    if (inputRef.current) {
      const len = inputRef.current.value.length
      inputRef.current.setSelectionRange(len, len)
    }
  }, [])

  // Auto-focus on mount if requested
  React.useEffect(() => {
    if (autoFocus && !disabled && inputRef.current) {
      inputRef.current.focus()
      keepSelectionAtEnd()
    }
  }, [autoFocus, disabled, keepSelectionAtEnd])

  const handleClear = React.useCallback(() => {
    onChange("")
    onClear?.()
    if (inputRef.current) {
      inputRef.current.focus()
      inputRef.current.setSelectionRange(0, 0)
    }
  }, [onChange, onClear])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return
    const rawVal = e.target.value
    const cleanNumbers = rawVal.replace(/\D/g, "").slice(0, 6)

    onChange(cleanNumbers)

    if (cleanNumbers.length === 6) {
      onComplete?.(cleanNumbers)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return

    // Prevent arrow navigation from displacing cursor between digits
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault()
      keepSelectionAtEnd()
    }

    if (e.key === "Enter" && value.length === 6) {
      e.preventDefault()
      onComplete?.(value)
    }
  }

  const handleContainerClick = () => {
    if (!disabled && inputRef.current) {
      inputRef.current.focus()
      keepSelectionAtEnd()
    }
  }

  return (
    <div className={cn("w-full space-y-2.5", className)}>
      {/* Label and Clear row matching reference layout */}
      {(label || showClear) && (
        <div className="flex items-center justify-between px-0.5">
          {label && (
            <span className="text-sm font-semibold text-foreground tracking-tight">
              {label}
            </span>
          )}
          {showClear && (
            <button
              type="button"
              onClick={handleClear}
              disabled={disabled || value.length === 0}
              className="text-sm font-semibold text-foreground/90 hover:text-primary transition-colors disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* 6 Digit Input Boxes (Minimal Outline Style with Single High-Speed Input) */}
      <div
        role="group"
        aria-label="6-digit MPIN input"
        onClick={handleContainerClick}
        className="relative flex items-center justify-between gap-2 sm:gap-2.5 cursor-pointer"
      >
        {/* Single native high-performance input */}
        <input
          ref={inputRef}
          id={id}
          name={name}
          type={maskDigits ? "password" : "text"}
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          autoComplete={autoComplete}
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          disabled={disabled}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            setIsFocused(true)
            keepSelectionAtEnd()
          }}
          onBlur={() => setIsFocused(false)}
          onSelect={keepSelectionAtEnd}
          onClick={keepSelectionAtEnd}
          aria-label={label || "Enter 6-digit MPIN"}
          style={{ caretColor: "transparent" }}
          className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer disabled:cursor-not-allowed"
        />

        {/* 6 visual display slots */}
        {Array.from({ length: 6 }).map((_, index) => {
          const digit = value[index] || ""
          const isFilled = Boolean(digit)
          const isActive =
            isFocused &&
            !disabled &&
            (index === value.length || (index === 5 && value.length === 6))
          const showCaret = isFocused && !disabled && index === value.length

          return (
            <div
              key={index}
              className={cn(
                "relative flex-1 h-14 sm:h-16 flex items-center justify-center rounded-[14px] sm:rounded-2xl transition-colors duration-150 select-none",
                "border border-slate-300 dark:border-slate-700 bg-white dark:bg-card text-foreground shadow-2xs",
                isFilled && "border-slate-400 dark:border-slate-500",
                isActive && !error && "border-primary ring-2 ring-primary/25",
                error && "border-destructive text-destructive ring-2 ring-destructive/20",
                disabled && "opacity-50 cursor-not-allowed"
              )}
            >
              {isFilled ? (
                maskDigits ? (
                  <span
                    className="size-3.5 sm:size-4 rounded-full bg-foreground shadow-2xs inline-block"
                    aria-hidden="true"
                  />
                ) : (
                  <span className="text-2xl font-bold font-mono text-foreground">
                    {digit}
                  </span>
                )
              ) : showCaret ? (
                <span
                  className="w-0.5 h-6 sm:h-7 bg-primary rounded-full animate-pulse pointer-events-none"
                  aria-hidden="true"
                />
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
