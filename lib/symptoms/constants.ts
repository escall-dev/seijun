/**
 * Centralized symptom vocabulary for Redi Phase 10.
 * All allowed symptom strings and severity values live here.
 * Extend SYMPTOM_OPTIONS to add new symptoms without touching UI or server code elsewhere.
 */

// ---------------------------------------------------------------------------
// Allowed symptom options
// ---------------------------------------------------------------------------

export const SYMPTOM_OPTIONS = [
  "Cramps",
  "Headache",
  "Back pain",
  "Fatigue",
  "Mood changes",
  "Bloating",
  "Acne",
  "Breast tenderness",
  "Nausea",
  "Appetite changes",
] as const

export type SymptomName = (typeof SYMPTOM_OPTIONS)[number]

// ---------------------------------------------------------------------------
// Severity options
// ---------------------------------------------------------------------------

export type SeverityValue = "mild" | "moderate" | "severe"

export interface SeverityOption {
  value: SeverityValue
  label: string
  description: string
}

export const SEVERITY_OPTIONS: SeverityOption[] = [
  {
    value: "mild",
    label: "Mild",
    description: "Noticeable but manageable",
  },
  {
    value: "moderate",
    label: "Moderate",
    description: "Affects daily activities",
  },
  {
    value: "severe",
    label: "Severe",
    description: "Significantly disruptive",
  },
]

export const SEVERITY_VALUES = SEVERITY_OPTIONS.map((s) => s.value)

// ---------------------------------------------------------------------------
// Domain record type (mirrors Supabase symptoms table)
// ---------------------------------------------------------------------------

export interface SymptomRecord {
  id: string
  user_id: string
  date: string // YYYY-MM-DD
  symptoms?: string[] | null
  symptom: string
  severity: SeverityValue
  notes: string | null
  created_at: string
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

export function isValidSymptom(value: string): boolean {
  return (SYMPTOM_OPTIONS as readonly string[]).includes(value)
}

export function isValidSeverity(value: string): value is SeverityValue {
  return (SEVERITY_VALUES as string[]).includes(value)
}

/** Returns a user-readable severity label (or the raw value as fallback). */
export function getSeverityLabel(value: string): string {
  return SEVERITY_OPTIONS.find((s) => s.value === value)?.label ?? value
}

export function getSymptomValues(record: Pick<SymptomRecord, "symptom" | "symptoms">): string[] {
  return [...new Set(record.symptoms?.length ? record.symptoms : [record.symptom])]
}
