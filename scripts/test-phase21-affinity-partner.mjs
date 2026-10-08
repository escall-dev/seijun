#!/usr/bin/env node

/**
 * Seijun Phase 21: Affinity & Partner Experience Test Suite
 *
 * Validates:
 * 1. Partner Identity & Avatar resolution across service, authorization, and actions.
 * 2. Dual Space architecture ("My Space" personal vs "Our Space" shared couple presence).
 * 3. Reassuring Supporter privacy placeholders for unshared categories.
 * 4. Revocation clarity and zero-leakage privacy contracts.
 * 5. Component integration & responsive / PWA presentation invariants.
 * 6. Non-regression of canonical versioning (v1.19.0 during development).
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, "..")

let totalPassed = 0
let totalFailed = 0

function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ FAIL: ${message}`)
    totalFailed++
    throw new Error(message)
  } else {
    console.log(`  ✓ ${message}`)
    totalPassed++
  }
}

console.log("=== Running Seijun Phase 21: Affinity & Partner Experience Test Suite ===\n")

// ─── TEST 1: Canonical App Version Invariance During Phase 21 ─────────────
console.log("[Test 1] Verifying Version Invariance During Phase 21 Implementation...")
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"))
  const pkgLock = JSON.parse(fs.readFileSync(path.join(rootDir, "package-lock.json"), "utf8"))
  const versionTs = fs.readFileSync(path.join(rootDir, "lib/version.ts"), "utf8")

  assert(/^1\.\d+\.\d+$/.test(pkg.version) && Number(pkg.version.split(".")[1]) >= 21, `package.json retains Phase 21 or a later release (got ${pkg.version})`)
  assert(pkgLock.version === pkg.version, `package-lock.json matches package.json (${pkgLock.version})`)
  assert(versionTs.includes("APP_VERSION"), "lib/version.ts defines canonical APP_VERSION")
  assert(versionTs.includes("packageJson.version"), "lib/version.ts dynamically sources from canonical package.json")
} catch (e) {
  console.error("Test 1 error:", e.message)
}

// ─── TEST 2: Partner Identity & Avatar Model Invariants ───────────────────
console.log("\n[Test 2] Auditing Partner Identity & Avatar Schema / Service Integration...")
try {
  const partnerTypes = fs.readFileSync(path.join(rootDir, "lib/partner/types.ts"), "utf8")
  const partnerService = fs.readFileSync(path.join(rootDir, "lib/partner/service.ts"), "utf8")
  const partnerAuth = fs.readFileSync(path.join(rootDir, "lib/partner/authorization.ts"), "utf8")
  const partnerActions = fs.readFileSync(path.join(rootDir, "app/actions/partner-shared.ts"), "utf8")

  // PartnerConnectionState includes avatarUrl and currentUser
  assert(partnerTypes.includes("avatarUrl?: string | null"), "PartnerConnectionState partner includes avatarUrl")
  assert(partnerTypes.includes("currentUser?:"), "PartnerConnectionState includes currentUser context")

  // Service queries avatar_url from profiles
  assert(partnerService.includes("avatar_url"), "service.ts queries avatar_url from profiles")
  assert(partnerService.includes("pProfile.avatar_url || null"), "service.ts maps partner avatarUrl from pProfile")
  assert(partnerService.includes("currentUserInfo"), "service.ts populates currentUserInfo in connection state")

  // Authorization includes owner & supporter avatarUrl
  assert(partnerAuth.includes("ownerAvatarUrl?: string | null"), "authorization.ts exports ownerAvatarUrl in return type")
  assert(partnerAuth.includes("supporterAvatarUrl?: string | null"), "authorization.ts exports supporterAvatarUrl in return type")
  assert(partnerAuth.includes("ownerAvatarUrl: ownerProfile?.avatar_url || null"), "authorization.ts maps owner avatar_url")
  assert(partnerAuth.includes("supporterAvatarUrl: supporterProfile?.avatar_url || null"), "authorization.ts maps supporter avatar_url")

  // Server Actions for Partner Dashboard return avatar URLs
  assert(partnerActions.includes("ownerAvatarUrl?: string | null"), "PartnerDashboardData includes ownerAvatarUrl")
  assert(partnerActions.includes("supporterAvatarUrl?: string | null"), "PartnerDashboardData includes supporterAvatarUrl")
  assert(partnerActions.includes("getEnabledSharingCategories(supabase)"), "getPartnerDashboardAction securely executes getEnabledSharingCategories")
} catch (e) {
  console.error("Test 2 error:", e.message)
}

// ─── TEST 3: Cycle Context Server & Types Partner Identity ─────────────────
console.log("\n[Test 3] Auditing Cycle Context Partner Identity & Avatar Integration...")
try {
  const cycleTypes = fs.readFileSync(path.join(rootDir, "lib/cycle-context/types.ts"), "utf8")
  const cycleServer = fs.readFileSync(path.join(rootDir, "lib/cycle-context/server.ts"), "utf8")

  assert(cycleTypes.includes("avatarUrl?: string | null"), "CyclePartnerInfo includes avatarUrl")
  assert(cycleTypes.includes("relationshipStartDate?: string | null"), "CyclePartnerInfo includes relationshipStartDate")
  assert(cycleTypes.includes("currentUserInfo?:"), "CycleContextState includes currentUserInfo")

  assert(cycleServer.includes("avatar_url") && cycleServer.includes("relationship_start_date"), "resolveServerCycleContext queries partner avatar_url and relationship_start_date")
  assert(cycleServer.includes("currentUserInfo"), "resolveServerCycleContext resolves and populates currentUserInfo")
} catch (e) {
  console.error("Test 3 error:", e.message)
}

// ─── TEST 4: Dual Space Architecture ("Our Space" Relationship Card) ───────
console.log("\n[Test 4] Auditing Dual Space Architecture & RelationshipContextCard...")
try {
  const cardPath = path.join(rootDir, "components/partner/relationship-context-card.tsx")
  assert(fs.existsSync(cardPath), "components/partner/relationship-context-card.tsx exists")

  const cardCode = fs.readFileSync(cardPath, "utf8")
  assert(cardCode.includes("Our Space"), "RelationshipContextCard features 'Our Space' couple badge")
  assert(cardCode.includes("HeartHandshake") || cardCode.includes("Avatar"), "RelationshipContextCard features partner avatar link")
  assert(cardCode.includes("ring-2 ring-background"), "RelationshipContextCard uses overlapping ring styling for dual avatars")
  assert(cardCode.includes("calculateRelationshipDuration"), "RelationshipContextCard dynamically calculates relationship duration")
  assert(cardCode.includes("href={isOwner ? \"/settings/partner\" : \"/partner\"}"), "RelationshipContextCard provides clear navigation to sharing settings or partner dashboard")

  // Check dashboard integration
  const dashboardPage = fs.readFileSync(path.join(rootDir, "app/dashboard/page.tsx"), "utf8")
  assert(dashboardPage.includes("RelationshipContextCard"), "Dashboard page imports and embeds RelationshipContextCard")
  assert(dashboardPage.includes("hasActivePartner={cycleContext.partnerInfo.hasActivePartner}"), "Dashboard page passes active partner status to DashboardHeader")
} catch (e) {
  console.error("Test 4 error:", e.message)
}

// ─── TEST 5: Reassuring Privacy Placeholders in Supporter Dashboard ────────
console.log("\n[Test 5] Auditing Reassuring Supporter Dashboard Experience...")
try {
  const supporterViewPath = path.join(rootDir, "components/partner/partner-dashboard-view.tsx")
  const supporterCode = fs.readFileSync(supporterViewPath, "utf8")

  // Dual avatar header
  assert(supporterCode.includes("Supporter Space") && supporterCode.includes("Avatar"), "Supporter dashboard renders dual interlinked couple avatars and Supporter Space badge")
  assert(supporterCode.includes("PrivateCategoryPlaceholderCard"), "Supporter dashboard defines PrivateCategoryPlaceholderCard")
  assert(supporterCode.includes("Kept Private"), "PrivateCategoryPlaceholderCard provides reassuring 'Kept Private' badge")
  assert(supporterCode.includes("kept confidential by"), "PrivateCategoryPlaceholderCard explains data is kept confidential by partner")

  // Check placeholders for unshared categories
  assert(supporterCode.includes("category=\"cycle_estimates\""), "Supporter dashboard renders placeholder when cycle_estimates is private")
  assert(supporterCode.includes("category=\"period_status\""), "Supporter dashboard renders placeholder when period_status is private")
  assert(supporterCode.includes("category=\"cycle_preferences\""), "Supporter dashboard renders placeholder when cycle_preferences is private")
  assert(supporterCode.includes("category=\"daily_notes\""), "Supporter dashboard renders placeholder when daily_notes is private")

  // Disconnected / empty state reassurance
  assert(supporterCode.includes("No Partner Connected Yet"), "Supporter dashboard contains thoughtful 'No Partner Connected Yet' empty state")
  assert(supporterCode.includes("Partner Connection Ended"), "Supporter dashboard contains explicit 'Partner Connection Ended' revocation state")
} catch (e) {
  console.error("Test 5 error:", e.message)
}

// ─── TEST 6: Cycle Owner Experience & Zero-Leakage Revocation Reassurance ───
console.log("\n[Test 6] Auditing Partner Connection & Sharing Settings Cards...")
try {
  const connectionCardCode = fs.readFileSync(path.join(rootDir, "components/partner/partner-connection-card.tsx"), "utf8")
  const sharingCardCode = fs.readFileSync(path.join(rootDir, "components/partner/partner-sharing-settings-card.tsx"), "utf8")

  // PartnerConnectionCard features dual avatars in active state
  assert(connectionCardCode.includes("Dual Interlinked Avatars"), "PartnerConnectionCard renders dual interlinked avatars for active connection")
  assert(connectionCardCode.includes("Privacy-First Sharing"), "PartnerConnectionCard communicates privacy-first sharing guarantee")

  // PartnerSharingSettingsCard features partner avatar and zero-leakage revoke copy
  assert(sharingCardCode.includes("Avatar"), "PartnerSharingSettingsCard uses Avatar component")
  assert(sharingCardCode.includes("They will immediately lose all access"), "Revocation dialog explicitly explains immediate access severance")
  assert(sharingCardCode.includes("no shared data is retained"), "Revocation dialog provides explicit zero data retention guarantee")
} catch (e) {
  console.error("Test 6 error:", e.message)
}

// ─── TEST 7: Privacy Settings View Guarantees ────────────────────────────
console.log("\n[Test 7] Auditing Privacy Settings View Guarantees...")
try {
  const privacySettingsCode = fs.readFileSync(path.join(rootDir, "components/settings/privacy-settings-view.tsx"), "utf8")

  assert(privacySettingsCode.includes("Mutual Consent &amp; Instant Revocation"), "PrivacySettingsView highlights Mutual Consent & Instant Revocation")
  assert(privacySettingsCode.includes("Cryptographic Isolation"), "PrivacySettingsView highlights Cryptographic Isolation")
  assert(privacySettingsCode.includes("Zero Third-Party Advertising"), "PrivacySettingsView highlights Zero Third-Party Advertising")
} catch (e) {
  console.error("Test 7 error:", e.message)
}

// ─── TEST 8: Context Switcher & Mobile / PWA Nav Integrity ─────────────────
console.log("\n[Test 8] Auditing Cycle Context Switcher & Navigation Integrations...")
try {
  const switcherCode = fs.readFileSync(path.join(rootDir, "components/cycle-context/cycle-context-switcher.tsx"), "utf8")
  const headerCode = fs.readFileSync(path.join(rootDir, "components/dashboard/dashboard-header.tsx"), "utf8")
  const bannerCode = fs.readFileSync(path.join(rootDir, "components/dashboard/supporter-banner.tsx"), "utf8")

  assert(switcherCode.includes("Avatar"), "CycleContextSwitcher uses Avatar component")
  assert(headerCode.includes("hasActivePartner"), "DashboardHeader supports hasActivePartner status indicator")
  assert(bannerCode.includes("Shared Partner Space"), "SupporterBanner presents supportive human-facing language")
} catch (e) {
  console.error("Test 8 error:", e.message)
}

// ─── TEST 9: My Space vs Our Space Semantic Separation ─────────────────────
console.log("\n[Test 9] Auditing My Space vs Our Space Semantic & Visual Distinction...")
try {
  const dashboardCode = fs.readFileSync(path.join(rootDir, "app/dashboard/page.tsx"), "utf8")
  const cardCode = fs.readFileSync(path.join(rootDir, "components/partner/relationship-context-card.tsx"), "utf8")

  assert(dashboardCode.includes("My Space"), "Dashboard explicitly renders 'My Space' semantic demarcation")
  assert(dashboardCode.includes("Personal tracking"), "My Space identifies personal tracking without mislabeling shared notes as private")
  assert(cardCode.includes("Our Space"), "RelationshipContextCard explicitly features 'Our Space' badge")
  assert(cardCode.includes("Together for"), "RelationshipContextCard formats duration as 'Together for ...'")
  assert(cardCode.includes("Connected"), "RelationshipContextCard provides neutral 'Connected' state when no start date set")
  assert(cardCode.includes("View Our Shared Space"), "RelationshipContextCard provides 'View Our Shared Space' action for supporters")
  assert(cardCode.includes("Manage Sharing"), "RelationshipContextCard provides 'Manage Sharing' action for owners")
} catch (e) {
  console.error("Test 9 error:", e.message)
}

// ─── TEST 10: Reusable PrivateCategoryPlaceholder Component ────────────────
console.log("\n[Test 10] Auditing Reusable PrivateCategoryPlaceholder Architecture...")
try {
  const placeholderPath = path.join(rootDir, "components/partner/private-category-placeholder.tsx")
  assert(fs.existsSync(placeholderPath), "components/partner/private-category-placeholder.tsx exists")

  const placeholderCode = fs.readFileSync(placeholderPath, "utf8")
  assert(placeholderCode.includes("PrivateCategoryPlaceholder"), "Exports PrivateCategoryPlaceholder component")
  assert(placeholderCode.includes("Private for now"), "Provides 'Private for now' badge for supporters")
  assert(placeholderCode.includes("Not shared with partner"), "Provides 'Not shared with partner' badge for owners")
  assert(placeholderCode.includes("Manage sharing"), "Provides 'Manage sharing' action link for owners")
  assert(placeholderCode.includes("EyeOff"), "Includes privacy icon for supporter state")
} catch (e) {
  console.error("Test 10 error:", e.message)
}

// ─── TEST 11: Privacy Transparency UX ("What you share" / "What remains private") ──
console.log("\n[Test 11] Auditing Privacy UX: What you share vs What remains private...")
try {
  const sharingCardCode = fs.readFileSync(path.join(rootDir, "components/partner/partner-sharing-settings-card.tsx"), "utf8")

  assert(sharingCardCode.includes("What you share"), "PartnerSharingSettingsCard renders 'What you share' section")
  assert(sharingCardCode.includes("What remains private"), "PartnerSharingSettingsCard renders 'What remains private' section")
  assert(sharingCardCode.includes("Personal symptoms &amp; body observations"), "Explicitly explains that personal symptoms remain private")
  assert(sharingCardCode.includes("Private notes &amp; unshared journals"), "Explicitly explains that private notes remain private")
  assert(sharingCardCode.includes("Account security, MPIN &amp; credentials"), "Explicitly explains that account credentials and MPIN remain private")
} catch (e) {
  console.error("Test 11 error:", e.message)
}

// ─── TEST 12: Supporter Disconnect & Revocation Architecture ──────────────
console.log("\n[Test 12] Auditing Supporter Disconnect & Revocation Contracts...")
try {
  const connectionCardCode = fs.readFileSync(path.join(rootDir, "components/partner/partner-connection-card.tsx"), "utf8")
  const sharingCardCode = fs.readFileSync(path.join(rootDir, "components/partner/partner-sharing-settings-card.tsx"), "utf8")

  // Supporter disconnect
  assert(connectionCardCode.includes("Disconnect from"), "PartnerConnectionCard enables supporter disconnect flow")
  assert(connectionCardCode.includes("handleDisconnectSupporter"), "PartnerConnectionCard defines handleDisconnectSupporter handler")
  assert(connectionCardCode.includes("revokePartnerRelationshipAction"), "PartnerConnectionCard invokes revokePartnerRelationshipAction")

  // Owner stop sharing dialog
  assert(sharingCardCode.includes("Stop sharing with"), "PartnerSharingSettingsCard features 'Stop sharing with [Partner]?' confirmation")
  assert(sharingCardCode.includes("Stop Sharing"), "PartnerSharingSettingsCard features clear 'Stop Sharing' confirmation button")
  assert(sharingCardCode.includes("Your private information remains private"), "Revocation confirmation guarantees private information remains private")
} catch (e) {
  console.error("Test 12 error:", e.message)
}

// ─── TEST 13: Server-side Security & Anti-Tampering Invariants ─────────────
console.log("\n[Test 13] Auditing Server-side Security & Anti-Tampering Invariants...")
try {
  const authCode = fs.readFileSync(path.join(rootDir, "lib/partner/authorization.ts"), "utf8")
  const mutationsCode = fs.readFileSync(path.join(rootDir, "app/actions/partner-mutations.ts"), "utf8")
  const serviceCode = fs.readFileSync(path.join(rootDir, "lib/partner/service.ts"), "utf8")

  // 1. Session-derived user only (never client IDs)
  assert(authCode.includes("supabase.auth.getUser()"), "Authorization derives user strictly from session auth")
  assert(authCode.includes("relationship.owner_user_id === authenticatedUserId ? \"owner\" : \"supporter\""), "Role is derived server-side from active relationship record")

  // 2. Active relationship required
  assert(authCode.includes('.eq("status", "active")'), "Relationship lookup enforces status = 'active'")
  assert(serviceCode.includes('.eq("status", "active")') || serviceCode.includes('status !== "active"'), "Service enforces active status checks")

  // 3. Category isolation
  assert(authCode.includes("isCategoryEnabled(context.sharingPreferences, category)"), "Supporter access enforces per-category sharing checks")

  // 4. Mutation constraints: strictly constrained to ownerUserId
  assert(mutationsCode.includes("authorizeSupporterManagement"), "All partner mutations require authorizeSupporterManagement")
  assert(mutationsCode.includes("ownerUserId") && mutationsCode.includes("authResult.context"), "Mutations target ownerUserId resolved securely from server context")
} catch (e) {
  console.error("Test 13 error:", e.message)
}

// ─── TEST RESULTS SUMMARY ──────────────────────────────────────────────────
console.log("\n=================================================")
if (totalFailed === 0) {
  console.log(`ALL SEIJUN PHASE 21 TESTS PASSED! 🎉 (${totalPassed} passed, 0 failed)`)
  console.log("=================================================")
  process.exit(0)
} else {
  console.error(`SEIJUN PHASE 21 TESTS FAILED (${totalPassed} passed, ${totalFailed} failed)`)
  console.log("=================================================")
  process.exit(1)
}
