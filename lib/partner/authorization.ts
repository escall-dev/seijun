import { cache } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import type { PartnerSharingPreferences, AffinityDisplayFormat } from "./types"

/**
 * Seijun Phase 19 Batch 3 — Step 11
 * Centralized Partner Authorization Layer
 *
 * All partner data access flows through this module.
 *
 * Authorization chain:
 *   1. Authenticated user (from Supabase session — never client-supplied)
 *   2. Active partner relationship lookup
 *   3. Role determination (owner / supporter)
 *   4. Sharing category verification
 *
 * SECURITY INVARIANTS:
 * - Never trust client-supplied owner/supporter/relationship IDs.
 * - Always derive the current user from auth.uid() / supabase.auth.getUser().
 * - Disabled sharing categories must never be queried or returned.
 * - Supporters are strictly read-only.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type PartnerRole = "owner" | "supporter"

export type SharingCategory =
  | "cycle_estimates"
  | "period_status"
  | "cycle_preferences"
  | "daily_notes"

export const ALL_SHARING_CATEGORIES: readonly SharingCategory[] = [
  "cycle_estimates",
  "period_status",
  "cycle_preferences",
  "daily_notes",
] as const

export type CoManagementPermission =
  | "manage_cycle_preferences"
  | "manage_period_status"
  | "manage_daily_notes"

export const ALL_CO_MANAGEMENT_PERMISSIONS: readonly CoManagementPermission[] = [
  "manage_cycle_preferences",
  "manage_period_status",
  "manage_daily_notes",
] as const

export interface AuthorizedPartnerContext {
  /** The authenticated user's ID */
  authenticatedUserId: string
  /** The role of the authenticated user in this relationship */
  role: PartnerRole
  /** The owner's user ID (cycle tracker) */
  ownerUserId: string
  /** The supporter's user ID */
  supporterUserId: string
  /** The relationship ID */
  relationshipId: string
  /** The relationship start date (if set) */
  relationshipStartDate?: string | null
  /** Current sharing preferences (for authorization checks) */
  sharingPreferences: PartnerSharingPreferences
}

export type AuthorizationDenialReason =
  | "UNAUTHENTICATED"
  | "NO_ACTIVE_RELATIONSHIP"
  | "SHARING_DISABLED"
  | "MANAGEMENT_DISABLED"
  | "NOT_SUPPORTER"
  | "AUTHORIZATION_ERROR"

export interface AuthorizationSuccess {
  authorized: true
  context: AuthorizedPartnerContext
}

export interface AuthorizationFailure {
  authorized: false
  reason: AuthorizationDenialReason
  message: string
}

export type AuthorizationResult = AuthorizationSuccess | AuthorizationFailure

// ─── Core Authorization ──────────────────────────────────────────────────────

/**
 * Resolves the authenticated user's active partner relationship context.
 *
 * This is the foundation of all partner authorization.
 * It NEVER accepts a client-supplied user ID — always derives from auth session.
 *
 * Returns null if:
 *  - User is not authenticated
 *  - No active partner relationship exists
 *  - Database error occurs
 */
export const resolvePartnerContext = cache(async function resolvePartnerContext(
  supabase: SupabaseClient<Database>
): Promise<AuthorizationResult> {
  try {
    // 1. Derive authenticated user from session (NEVER trust client-supplied ID)
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return {
        authorized: false,
        reason: "UNAUTHENTICATED",
        message: "Authentication required.",
      }
    }

    const authenticatedUserId = user.id

    // 2. Find active relationship where the authenticated user is either owner or supporter
    const { data: relationship, error: relError } = await supabase
      .from("partner_relationships")
      .select("id, owner_user_id, supporter_user_id, status, relationship_start_date")
      .or(`owner_user_id.eq.${authenticatedUserId},supporter_user_id.eq.${authenticatedUserId}`)
      .eq("status", "active")
      .maybeSingle()

    if (relError || !relationship) {
      return {
        authorized: false,
        reason: "NO_ACTIVE_RELATIONSHIP",
        message: "No active partner relationship found.",
      }
    }

    // 3. Determine role from the relationship data (NOT from client input)
    const role: PartnerRole =
      relationship.owner_user_id === authenticatedUserId ? "owner" : "supporter"

    const ownerUserId = relationship.owner_user_id
    const supporterUserId = relationship.supporter_user_id

    if (!supporterUserId) {
      return {
        authorized: false,
        reason: "NO_ACTIVE_RELATIONSHIP",
        message: "Partner relationship is not fully established.",
      }
    }

    // 4. Fetch sharing preferences for the relationship
    const { data: prefs, error: prefsError } = await supabase
      .from("partner_sharing_preferences")
      .select("*")
      .eq("relationship_id", relationship.id)
      .maybeSingle()

    if (prefsError) {
      return {
        authorized: false,
        reason: "AUTHORIZATION_ERROR",
        message: "Failed to load sharing preferences.",
      }
    }

    // Default conservative preferences if row doesn't exist yet
    const sharingPreferences: PartnerSharingPreferences = prefs
      ? (prefs as PartnerSharingPreferences)
      : {
          id: "",
          relationship_id: relationship.id,
          owner_user_id: ownerUserId,
          cycle_estimates: false,
          period_status: false,
          cycle_preferences: false,
          daily_notes: false,
          manage_cycle_preferences: false,
          manage_period_status: false,
          manage_daily_notes: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }

    return {
      authorized: true,
      context: {
        authenticatedUserId,
        role,
        ownerUserId,
        supporterUserId,
        relationshipId: relationship.id,
        relationshipStartDate: relationship.relationship_start_date || null,
        sharingPreferences,
      },
    }
  } catch {
    return {
      authorized: false,
      reason: "AUTHORIZATION_ERROR",
      message: "Unexpected authorization error.",
    }
  }
})

// ─── Category-Level Authorization ────────────────────────────────────────────

/**
 * Authorizes a supporter to access a specific sharing category.
 *
 * Authorization requirements (ALL must be true):
 *   1. Active relationship exists
 *   2. Authenticated user IS the supporter
 *   3. The specific sharing category is enabled by the owner
 *
 * Returns AuthorizationResult with full context on success,
 * or a specific denial reason on failure.
 */
export async function authorizeSupporterAccess(
  supabase: SupabaseClient<Database>,
  category: SharingCategory
): Promise<AuthorizationResult> {
  const partnerResult = await resolvePartnerContext(supabase)

  if (!partnerResult.authorized) {
    return partnerResult
  }

  const { context } = partnerResult

  // Only supporters can use shared data access
  if (context.role !== "supporter") {
    return {
      authorized: false,
      reason: "NOT_SUPPORTER",
      message: "Only supporters can access shared partner data.",
    }
  }

  // Check if the specific sharing category is enabled by the owner
  if (!isCategoryEnabled(context.sharingPreferences, category)) {
    return {
      authorized: false,
      reason: "SHARING_DISABLED",
      message: `Sharing for ${formatCategoryName(category)} is not enabled.`,
    }
  }

  return partnerResult
}

// ─── Co-Management Authorization ─────────────────────────────────────────────

/**
 * Authorizes a supporter to execute a co-management mutation.
 *
 * Authorization chain (ALL must be satisfied):
 *   1. Authenticated user (session-derived, never trusted from client)
 *   2. Active partner relationship
 *   3. Supporter role
 *   4. Base view category is enabled
 *   5. Specific co-management permission is explicitly enabled by the owner
 *
 * Rejection guarantees:
 *   - Unauthenticated -> UNAUTHENTICATED
 *   - Inactive / revoked -> NO_ACTIVE_RELATIONSHIP
 *   - Owner role -> NOT_SUPPORTER
 *   - Base category disabled -> SHARING_DISABLED
 *   - Management disabled -> MANAGEMENT_DISABLED
 */
export async function authorizeSupporterManagement(
  supabase: SupabaseClient<Database>,
  permission: CoManagementPermission
): Promise<AuthorizationResult> {
  const partnerResult = await resolvePartnerContext(supabase)

  if (!partnerResult.authorized) {
    return partnerResult
  }

  const { context } = partnerResult

  // Strictly supporter only
  if (context.role !== "supporter") {
    return {
      authorized: false,
      reason: "NOT_SUPPORTER",
      message: "Only supporters can perform partner co-management mutations.",
    }
  }

  // Verify the prerequisite view category is enabled
  const requiredCategory = getRequiredCategoryForManagement(permission)
  if (!isCategoryEnabled(context.sharingPreferences, requiredCategory)) {
    return {
      authorized: false,
      reason: "SHARING_DISABLED",
      message: `Sharing for ${formatCategoryName(requiredCategory)} is disabled. Management access requires view access.`,
    }
  }

  // Verify the specific management capability is explicitly granted
  if (!isManagementEnabled(context.sharingPreferences, permission)) {
    return {
      authorized: false,
      reason: "MANAGEMENT_DISABLED",
      message: `Co-management permission for ${formatManagementName(permission)} is not enabled.`,
    }
  }

  return partnerResult
}

/**
 * Returns all currently enabled sharing categories and management permissions for the supporter.
 * Used by the Partner Dashboard to know which sections and mutation controls to render.
 */
export async function getEnabledSharingCategories(
  supabase: SupabaseClient<Database>
): Promise<{
  authorized: boolean
  role?: PartnerRole
  categories?: SharingCategory[]
  enabledCategories?: SharingCategory[]
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
}> {
  const partnerResult = await resolvePartnerContext(supabase)

  if (!partnerResult.authorized) {
    return {
      authorized: false,
      reason: partnerResult.reason,
      message: partnerResult.message,
    }
  }

  const { context } = partnerResult

  if (context.role !== "supporter") {
    return {
      authorized: false,
      reason: "NOT_SUPPORTER",
      message: "Only supporters can view the partner dashboard.",
    }
  }

  const enabledCategories: SharingCategory[] = []
  for (const cat of ALL_SHARING_CATEGORIES) {
    if (isCategoryEnabled(context.sharingPreferences, cat)) {
      enabledCategories.push(cat)
    }
  }

  const enabledManagement: CoManagementPermission[] = []
  for (const perm of ALL_CO_MANAGEMENT_PERMISSIONS) {
    if (isManagementEnabled(context.sharingPreferences, perm)) {
      enabledManagement.push(perm)
    }
  }

  // Fetch minimal owner profile info (display_name, username, avatar_url)
  const { data: ownerProfile } = await supabase
    .from("profiles")
    .select("display_name, username, avatar_url")
    .eq("user_id", context.ownerUserId)
    .maybeSingle()

  // Fetch supporter profile info (affinity format, display_name, username, avatar_url)
  const { data: supporterProfile } = await supabase
    .from("profiles")
    .select("affinity_display_format, display_name, username, avatar_url")
    .eq("user_id", context.authenticatedUserId)
    .maybeSingle()

  return {
    authorized: true,
    role: context.role,
    categories: enabledCategories,
    enabledCategories,
    managementPermissions: enabledManagement,
    ownerDisplayName: ownerProfile?.display_name || "Partner",
    ownerUsername: ownerProfile?.username || undefined,
    ownerAvatarUrl: ownerProfile?.avatar_url || null,
    supporterDisplayName: supporterProfile?.display_name || undefined,
    supporterUsername: supporterProfile?.username || undefined,
    supporterAvatarUrl: supporterProfile?.avatar_url || null,
    relationshipStartDate: context.relationshipStartDate || null,
    affinityDisplayFormat: supporterProfile?.affinity_display_format || "detailed",
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Checks whether a specific sharing category is enabled in the preferences.
 */
export function isCategoryEnabled(
  prefs: PartnerSharingPreferences,
  category: SharingCategory
): boolean {
  switch (category) {
    case "cycle_estimates":
      return prefs.cycle_estimates === true
    case "period_status":
      return prefs.period_status === true
    case "cycle_preferences":
      return prefs.cycle_preferences === true
    case "daily_notes":
      return prefs.daily_notes === true
    default:
      return false
  }
}

/**
 * Checks whether a specific co-management permission is enabled in the preferences.
 * Enforces architectural prerequisite: view permission must ALSO be enabled.
 */
export function isManagementEnabled(
  prefs: PartnerSharingPreferences,
  permission: CoManagementPermission
): boolean {
  switch (permission) {
    case "manage_cycle_preferences":
      return prefs.cycle_preferences === true && prefs.manage_cycle_preferences === true
    case "manage_period_status":
      return prefs.period_status === true && prefs.manage_period_status === true
    case "manage_daily_notes":
      return prefs.daily_notes === true && prefs.manage_daily_notes === true
    default:
      return false
  }
}

/**
 * Maps each management permission to its required view category.
 */
export function getRequiredCategoryForManagement(permission: CoManagementPermission): SharingCategory {
  switch (permission) {
    case "manage_cycle_preferences":
      return "cycle_preferences"
    case "manage_period_status":
      return "period_status"
    case "manage_daily_notes":
      return "daily_notes"
  }
}

/**
 * Formats a sharing category key into a human-readable label.
 */
export function formatCategoryName(category: SharingCategory): string {
  switch (category) {
    case "cycle_estimates":
      return "Cycle Estimates"
    case "period_status":
      return "Period Status"
    case "cycle_preferences":
      return "Cycle Preferences"
    case "daily_notes":
      return "Daily Notes"
    default:
      return category
  }
}

/**
 * Formats a management permission key into a human-readable label.
 */
export function formatManagementName(permission: CoManagementPermission): string {
  switch (permission) {
    case "manage_cycle_preferences":
      return "Cycle Preferences"
    case "manage_period_status":
      return "Period Status"
    case "manage_daily_notes":
      return "Daily Notes"
    default:
      return permission
  }
}
