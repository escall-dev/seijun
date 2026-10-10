"use server"

import { createClient } from "@/lib/supabase/server"

export type MpinStatus = {
  configured: boolean
  legacy: boolean
  verified: boolean
  onboardingCompleted: boolean
}

export async function getMpinStatusAction(): Promise<MpinStatus | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase.rpc("mpin_status")
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return null
  return {
    configured: data.configured === true,
    legacy: data.legacy === true,
    verified: data.verified === true,
    onboardingCompleted: data.onboardingCompleted === true,
  }
}

export async function verifyMpinAction(pin: string): Promise<{ success: boolean; locked?: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !/^\d{6}$/.test(pin)) return { success: false }
  const { data, error } = await supabase.rpc("mpin_verify", { p_pin: pin })
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return { success: false }
  return { success: data.success === true, locked: data.locked === true }
}

export async function enrollMpinAction(pin: string): Promise<{ success: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !/^\d{6}$/.test(pin)) return { success: false }
  const { data, error } = await supabase.rpc("mpin_enroll", { p_pin: pin })
  return { success: !error && data === true }
}

export async function changeMpinAction(oldPin: string, newPin: string): Promise<{ success: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !/^\d{6}$/.test(oldPin) || !/^\d{6}$/.test(newPin)) return { success: false }
  const { data, error } = await supabase.rpc("mpin_change", { p_old_pin: oldPin, p_new_pin: newPin })
  return { success: !error && data === true }
}

export async function lockMpinAction(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { error } = await supabase.rpc("mpin_lock")
  return !error
}

export async function recoverMpinAction(password: string, newPin: string): Promise<{ success: boolean }> {
  if (!password || !/^\d{6}$/.test(newPin)) return { success: false }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return { success: false }
  const { error: authError } = await supabase.auth.signInWithPassword({ email: user.email, password })
  if (authError) return { success: false }
  const { data, error } = await supabase.rpc("mpin_recover", { p_new_pin: newPin })
  if (error || data !== true) return { success: false }
  const { data: verified, error: verifyError } = await supabase.rpc("mpin_verify", { p_pin: newPin })
  return { success: !verifyError && !!verified && typeof verified === "object"
    && !Array.isArray(verified) && verified.success === true }
}
