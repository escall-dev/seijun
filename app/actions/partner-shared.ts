"use server"

import { createClient } from "@/lib/supabase/server"
import { getEnabledSharingCategories } from "@/lib/partner/authorization"
import type {
  SharingCategory,
  CoManagementPermission,
  PartnerRole,
  AuthorizationDenialReason,
} from "@/lib/partner/authorization"
import type { AffinityDisplayFormat } from "@/lib/partner/types"
import {
  getSharedCycleEstimates,
  getSharedPeriodStatus,
  getSharedCyclePreferences,
  getSharedDailyNotes,
  type SharedCycleEstimate,
  type SharedPeriodStatus,
  type SharedCyclePreferences,
  type SharedDailyNote,
} from "@/lib/partner/shared-data"

/**
 * Seijun Phase 19 Batch 3 & 4 — Server Actions for Partner Shared Data & Co-Management Status
 *
 * All actions derive the authenticated user from the Supabase session.
 * No client-supplied user IDs are trusted.
 * Each action independently authorizes access to its specific category.
 */

// ─── Dashboard Summary ──────────────────────────────────────────────────────

export interface PartnerDashboardData {
  authorized: boolean
  role?: PartnerRole
  enabledCategories?: SharingCategory[]
  categories?: SharingCategory[]
  managementPermissions?: CoManagementPermission[]
  ownerDisplayName?: string
  ownerUsername?: string
  ownerAvatarUrl?: string | null
  supporterDisplayName?: string
  supporterUsername?: string
  supporterAvatarUrl?: string | null
  relationshipStartDate?: string | null
  affinityDisplayFormat?: AffinityDisplayFormat
  reason?: AuthorizationDenialReason
  message?: string
}

/**
 * Server Action: Get partner dashboard metadata.
 * Returns enabled sharing categories and minimal partner identity.
 * Does NOT return shared data — each category is fetched independently.
 */
export async function getPartnerDashboardAction(): Promise<PartnerDashboardData> {
  const supabase = await createClient()
  return getEnabledSharingCategories(supabase)
}

// ─── Cycle Estimates ─────────────────────────────────────────────────────────

export interface SharedCycleEstimateResult {
  ok: boolean
  data?: SharedCycleEstimate
  reason?: AuthorizationDenialReason
  message?: string
}

/**
 * Server Action: Get shared cycle estimates for supporter.
 * Independently authorized — requires cycle_estimates=true.
 */
export async function getSharedCycleEstimatesAction(): Promise<SharedCycleEstimateResult> {
  const supabase = await createClient()
  return getSharedCycleEstimates(supabase)
}

// ─── Period Status ───────────────────────────────────────────────────────────

export interface SharedPeriodStatusResult {
  ok: boolean
  data?: SharedPeriodStatus
  reason?: AuthorizationDenialReason
  message?: string
}

/**
 * Server Action: Get shared period status for supporter.
 * Independently authorized — requires period_status=true.
 * Does NOT require cycle_estimates to be enabled.
 */
export async function getSharedPeriodStatusAction(): Promise<SharedPeriodStatusResult> {
  const supabase = await createClient()
  return getSharedPeriodStatus(supabase)
}

// ─── Cycle Preferences ──────────────────────────────────────────────────────

export interface SharedCyclePreferencesResult {
  ok: boolean
  data?: SharedCyclePreferences
  reason?: AuthorizationDenialReason
  message?: string
}

/**
 * Server Action: Get shared cycle preferences for supporter.
 * Independently authorized — requires cycle_preferences=true.
 * Supporter is READ-ONLY.
 */
export async function getSharedCyclePreferencesAction(): Promise<SharedCyclePreferencesResult> {
  const supabase = await createClient()
  return getSharedCyclePreferences(supabase)
}

// ─── Daily Notes ─────────────────────────────────────────────────────────────

export interface SharedDailyNotesResult {
  ok: boolean
  data?: SharedDailyNote[]
  reason?: AuthorizationDenialReason
  message?: string
}

/**
 * Server Action: Get shared daily notes for supporter.
 * Independently authorized — requires daily_notes=true.
 * Supporter can VIEW but CANNOT create, edit, or delete.
 */
export async function getSharedDailyNotesAction(): Promise<SharedDailyNotesResult> {
  const supabase = await createClient()
  return getSharedDailyNotes(supabase)
}

// ─── Full Dashboard Batch ────────────────────────────────────────────────────

export interface FullPartnerDashboardResult {
  dashboardData: PartnerDashboardData
  cycleEstimates: SharedCycleEstimateResult | null
  periodStatus: SharedPeriodStatusResult | null
  cyclePreferences: SharedCyclePreferencesResult | null
  dailyNotes: SharedDailyNotesResult | null
}

/**
 * Server Action: Combined partner dashboard loader.
 * Authenticates and checks partner relationship ONCE, then concurrently fetches
 * all authorized enabled categories via Promise.all.
 * Reduces 5 separate HTTP roundtrips down to a single network call.
 */
export async function getPartnerDashboardFullAction(): Promise<FullPartnerDashboardResult> {
  const supabase = await createClient()
  const dashboardData = await getEnabledSharingCategories(supabase)

  if (!dashboardData.authorized) {
    return {
      dashboardData,
      cycleEstimates: null,
      periodStatus: null,
      cyclePreferences: null,
      dailyNotes: null,
    }
  }

  const categories = dashboardData.enabledCategories || dashboardData.categories || []

  const [cycleEstimates, periodStatus, cyclePreferences, dailyNotes] = await Promise.all([
    categories.includes("cycle_estimates") ? getSharedCycleEstimates(supabase) : Promise.resolve(null),
    categories.includes("period_status") ? getSharedPeriodStatus(supabase) : Promise.resolve(null),
    categories.includes("cycle_preferences") ? getSharedCyclePreferences(supabase) : Promise.resolve(null),
    Promise.resolve(null) // Notes load only on their dedicated route,
  ])

  return {
    dashboardData,
    cycleEstimates,
    periodStatus,
    cyclePreferences,
    dailyNotes,
  }
}

