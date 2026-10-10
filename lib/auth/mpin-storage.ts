/**
 * Seijun MPIN Local Storage & Session State Manager
 *
 * Enforces secure local persistence of MPIN verifiers without storing plaintext PINs.
 * Manages lockout rates, failed attempts, Remember Device, and Auto-Unlock states.
 */

import { enrollMpinAction, getMpinStatusAction, verifyMpinAction } from "@/app/actions/mpin"

export interface MpinRecord {
  salt: string
  verifier: string
  createdAt: string
  lastChangedAt: string
}

export interface AttemptState {
  count: number
  lockedUntil: number | null // epoch ms
}

export interface VerifyMpinResult {
  success: boolean
  error?: string
  remainingAttempts?: number
  isLockedOut?: boolean
  lockedSecondsRemaining?: number
}

const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_DURATION_MS = 60 * 1000 // 60 seconds lockout after 5 consecutive failures

const PREFIX = "seijun_mpin_"

function getKey(suffix: string, userId?: string): string {
  if (userId) {
    return `${PREFIX}${suffix}_${userId}`
  }
  return `${PREFIX}${suffix}`
}

/**
 * Checks if document cookie contains seijun-mpin-locked=true
 */
export function isSessionLocked(): boolean {
  if (typeof window === "undefined") return false
  const match = document.cookie.match(/(?:^|;\s*)seijun-mpin-locked=([^;]*)/)
  return match ? match[1] === "true" : false
}

/**
 * Updates both client-side cookie and session storage for lock status
 */
export function setSessionLocked(locked: boolean): void {
  if (typeof window === "undefined") return
  const maxAge = locked ? 30 * 24 * 60 * 60 : 0 // 30 days if locked, delete if unlocked
  const expires = locked
    ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString()
    : "Thu, 01 Jan 1970 00:00:00 GMT"

  document.cookie = `seijun-mpin-locked=${locked ? "true" : "false"}; path=/; SameSite=Lax; max-age=${maxAge}; expires=${expires}`

  try {
    if (locked) {
      sessionStorage.setItem("seijun_session_locked", "true")
    } else {
      sessionStorage.removeItem("seijun_session_locked")
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Check if an MPIN record exists on this device for the given user ID.
 */
export function hasMpin(userId: string): boolean {
  if (typeof window === "undefined" || !userId) return false
  try {
    const raw = localStorage.getItem(getKey("verifier", userId))
    return Boolean(raw)
  } catch {
    return false
  }
}

/**
 * Explicit alias to check device-local enrollment vs account-level profile state.
 */
export function hasDeviceMpin(userId: string): boolean {
  return hasMpin(userId)
}

/**
 * Get the stored MPIN record for a user.
 */
export function getMpinRecord(userId: string): MpinRecord | null {
  if (typeof window === "undefined" || !userId) return null
  try {
    const raw = localStorage.getItem(getKey("verifier", userId))
    if (!raw) return null
    return JSON.parse(raw) as MpinRecord
  } catch {
    return null
  }
}

/**
 * Save / Set a new 6-digit MPIN for a user.
 */
export async function saveMpin(
  userId: string,
  mpin: string,
  rememberDevice: boolean = true,
  userProfile?: { email?: string; displayName?: string | null }
): Promise<void> {
  if (typeof window === "undefined" || !userId) throw new Error("Authentication required")
  const result = await enrollMpinAction(mpin)
  if (!result.success) throw new Error("MPIN setup failed. Sign in again to retry, or enter the PIN already set on another device.")
  clearLegacySecrets(userId)
  localStorage.setItem(getKey("remember", userId), rememberDevice ? "true" : "false")
  if (rememberDevice) {
    // Device preference never stores the PIN itself.
  }
  if (userProfile) {
    setRememberedUser({
      id: userId,
      email: userProfile.email,
      displayName: userProfile.displayName,
    })
  }
  resetFailedAttempts(userId)
  setAccountMpinConfigured(userId, true)
}

/**
 * Get current failed-attempts state.
 */
export function getAttemptState(userId: string): AttemptState {
  if (typeof window === "undefined" || !userId) {
    return { count: 0, lockedUntil: null }
  }
  try {
    const raw = localStorage.getItem(getKey("attempts", userId))
    if (!raw) return { count: 0, lockedUntil: null }
    const state = JSON.parse(raw) as AttemptState

    // If lock duration has expired, reset count
    if (state.lockedUntil && Date.now() > state.lockedUntil) {
      resetFailedAttempts(userId)
      return { count: 0, lockedUntil: null }
    }
    return state
  } catch {
    return { count: 0, lockedUntil: null }
  }
}

/**
 * Record a failed attempt and initiate temporary lockout if limit reached.
 */
export function recordFailedAttempt(userId: string): AttemptState {
  const current = getAttemptState(userId)
  const newCount = current.count + 1
  let lockedUntil: number | null = null

  if (newCount >= MAX_FAILED_ATTEMPTS) {
    lockedUntil = Date.now() + LOCKOUT_DURATION_MS
  }

  const newState: AttemptState = {
    count: newCount,
    lockedUntil,
  }

  try {
    localStorage.setItem(getKey("attempts", userId), JSON.stringify(newState))
  } catch {
    // Ignore storage errors
  }

  return newState
}

/**
 * Reset failed attempts counter.
 */
export function resetFailedAttempts(userId: string): void {
  if (typeof window === "undefined" || !userId) return
  try {
    localStorage.removeItem(getKey("attempts", userId))
  } catch {
    // Ignore storage errors
  }
}

/**
 * Verifies entered 6-digit MPIN against stored cryptographic verifier.
 */
export async function verifyMpin(
  userId: string,
  enteredMpin: string
): Promise<VerifyMpinResult> {
  if (!userId) return { success: false, error: "Authentication required." }
  const result = await verifyMpinAction(enteredMpin)
  return result.success
    ? { success: true }
    : { success: false, isLockedOut: result.locked, lockedSecondsRemaining: result.locked ? 900 : undefined,
        error: result.locked ? "Too many attempts. Try again later." : "Unable to verify MPIN." }
}

/**
 * Remember Device preference
 */
export function isRememberDeviceEnabled(userId: string): boolean {
  if (typeof window === "undefined" || !userId) return true
  try {
    const val = localStorage.getItem(getKey("remember", userId))
    return val !== "false"
  } catch {
    return true
  }
}

export function setRememberDeviceEnabled(userId: string, enabled: boolean): void {
  if (typeof window === "undefined" || !userId) return
  try {
    localStorage.setItem(getKey("remember", userId), enabled ? "true" : "false")
  } catch {
    // Ignore storage errors
  }
}

/**
 * Automatic Unlock preference
 */
export function isAutoUnlockEnabled(userId: string): boolean {
  void userId
  return false
}

export function setAutoUnlockEnabled(userId: string, enabled: boolean): void {
  void userId
  void enabled
}

export interface RememberedUser {
  id: string
  email?: string
  displayName?: string | null
}

const REMEMBERED_USER_KEY = "seijun_remembered_user"

export function getRememberedUser(): RememberedUser | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(REMEMBERED_USER_KEY)
    if (!raw) return null
    return JSON.parse(raw) as RememberedUser
  } catch {
    return null
  }
}

export function setRememberedUser(user: RememberedUser): void {
  if (typeof window === "undefined" || !user?.id) return
  try {
    localStorage.setItem(REMEMBERED_USER_KEY, JSON.stringify(user))
  } catch {
    // Ignore storage errors
  }
}

export function clearRememberedUser(): void {
  if (typeof window === "undefined") return
  try {
    localStorage.removeItem(REMEMBERED_USER_KEY)
  } catch {
    // Ignore storage errors
  }
}

/**
 * Cache local representation of DB MPIN configuration for this user
 */
export function setAccountMpinConfigured(userId: string, configured: boolean): void {
  if (typeof window === "undefined" || !userId) return
  try {
    localStorage.setItem(getKey("configured", userId), configured ? "true" : "false")
  } catch {
    // Ignore storage errors
  }
}

export function getAccountMpinConfigured(userId: string): boolean | null {
  if (typeof window === "undefined" || !userId) return null
  try {
    const val = localStorage.getItem(getKey("configured", userId))
    if (val === "true") return true
    if (val === "false") return false
    return null
  } catch {
    return null
  }
}

/**
 * Fetches MPIN configuration for a specific user ID.
 * Queries Supabase `profiles` table as source of truth.
 * Also checks local device verifier storage.
 */
export async function fetchUserMpinConfiguration(userId: string): Promise<boolean> {
  if (!userId) throw new Error("Authentication required")
  const status = await getMpinStatusAction()
  if (!status) throw new Error("Unable to check MPIN status")
  setAccountMpinConfigured(userId, status.configured)
  return status.configured
}

/**
 * Remember MPIN Autofill preference and storage
 * Strictly scoped to the authenticated user ID.
 */
export function isMpinRememberMeEnabled(userId?: string): boolean {
  if (typeof window === "undefined" || !userId) return false
  try {
    const hasAutofill = Boolean(localStorage.getItem(getKey("autofill", userId)))
    if (hasAutofill) return true

    const val = localStorage.getItem(getKey("remember_mpin", userId))
    return val !== "false"
  } catch {
    return true
  }
}

export function setMpinRememberMeEnabled(userId: string, enabled: boolean): void {
  if (typeof window === "undefined" || !userId) return
  try {
    localStorage.setItem(getKey("remember_mpin", userId), enabled ? "true" : "false")
    if (!enabled) {
      clearAutofillMpin(userId)
    }
  } catch {
    // Ignore storage errors
  }
}

export function saveAutofillMpin(userId: string, mpin: string): void {
  void mpin
  clearAutofillMpin(userId)
}

export function getAutofillMpin(userId?: string): string | null {
  if (userId && typeof window !== "undefined") clearAutofillMpin(userId)
  return null
}

export function clearAutofillMpin(userId: string): void {
  if (typeof window === "undefined" || !userId) return
  try {
    localStorage.removeItem(getKey("autofill", userId))
    localStorage.setItem(getKey("remember_mpin", userId), "false")
  } catch {
    // Ignore storage errors
  }
}

/**
 * Clears MPIN verifier and lock state for a specific user (e.g. Forgot MPIN)
 */
export function clearMpin(userId: string): void {
  if (typeof window === "undefined" || !userId) return
  try {
    localStorage.removeItem(getKey("verifier", userId))
    localStorage.removeItem(getKey("remember", userId))
    localStorage.removeItem(getKey("remember_mpin", userId))
    localStorage.removeItem(getKey("autofill", userId))
    localStorage.removeItem(getKey("autounlock", userId))
    localStorage.removeItem(getKey("attempts", userId))
    localStorage.removeItem(getKey("configured", userId))
    clearRememberedUser()
    setSessionLocked(false)

  } catch {
    // Ignore storage errors
  }
}

function clearLegacySecrets(userId: string): void {
  if (typeof window === "undefined") return
  for (const suffix of ["verifier", "autofill", "autounlock", "attempts"]) {
    localStorage.removeItem(getKey(suffix, userId))
  }
}

export function retireLegacyMpin(userId: string): void {
  clearLegacySecrets(userId)
}

/**
 * Clears account-specific MPIN state without wiping other stored users
 */
export function clearAccountMpinState(userId: string): void {
  clearMpin(userId)
}

/**
 * Clears all MPIN data and unlock cookies across all users (e.g. on full hard reset)
 */
export function clearAllMpinState(): void {
  if (typeof window === "undefined") return
  try {
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && (key.startsWith(PREFIX) || key === REMEMBERED_USER_KEY)) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k))
    setSessionLocked(false)
  } catch {
    // Ignore storage errors
  }
}

