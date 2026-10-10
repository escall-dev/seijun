"use server"

import { createClient } from "@/lib/supabase/server"
import { getSiteUrl } from "@/lib/config/site"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { lockMpinAction, getMpinStatusAction } from "@/app/actions/mpin"

export interface AuthActionResult {
  success?: boolean
  error?: string
  message?: string
  requiresEmailConfirmation?: boolean
  user?: {
    id: string
    email?: string
    displayName?: string | null
    onboardingCompleted?: boolean
    hasMpin?: boolean
  }
  redirectUrl?: string
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/**
 * Server Action: Log in with email and password
 */
export async function loginAction(
  _prevState: AuthActionResult | null,
  formData: FormData
): Promise<AuthActionResult> {
  const email = (formData.get("email") as string)?.trim().toLowerCase()
  const password = formData.get("password") as string
  const redirectUrl = (formData.get("redirect") as string) || "/dashboard"
  const rememberMe = formData.get("rememberMe") === "on" || formData.get("rememberMe") === "true"
  const skipRedirect = formData.get("skipRedirect") === "true"

  if (!email || !isValidEmail(email)) {
    return { success: false, error: "Please enter a valid email address." }
  }

  if (!password) {
    return { success: false, error: "Please enter your password." }
  }

  let targetRedirect: string | null = null
  let authenticatedUser: AuthActionResult["user"] = undefined

  try {
    const supabase = await createClient({ rememberMe })
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      if (error.message.toLowerCase().includes("email not confirmed")) {
        return {
          success: false,
          error: "Your email has not been confirmed yet. Please check your inbox.",
        }
      }
      return {
        success: false,
        error: "Invalid email or password.",
      }
    }

    if (data.user) {
      // Set remember-me flag cookie for middleware and subsequent token refreshes
      const cookieStore = await cookies()
      cookieStore.delete("seijun_cycle_context")
      revalidatePath("/", "layout")
      // Clean up any stale first-time MPIN setup cookie upon authentication
      cookieStore.delete("seijun-mpin-setup")

      if (rememberMe) {
        cookieStore.set("sb-remember-me", "true", {
          path: "/",
          sameSite: "lax",
          httpOnly: false,
          maxAge: 30 * 24 * 60 * 60, // 30 days
        })
      } else {
        cookieStore.set("sb-remember-me", "false", {
          path: "/",
          sameSite: "lax",
          httpOnly: false,
          // no maxAge or expires -> Session cookie (discarded when browser exits)
        })
      }

      const displayName = data.user.user_metadata?.display_name || null
      const status = await getMpinStatusAction()
      if (!status) return { success: false, error: "Unable to check MPIN status. Please try again." }

      authenticatedUser = {
        id: data.user.id,
        email: data.user.email,
        displayName: displayName,
        onboardingCompleted: status.onboardingCompleted,
        hasMpin: status.configured,
      }

      if (!status.onboardingCompleted) {
        targetRedirect = "/onboarding"
      } else {
        targetRedirect =
          redirectUrl.startsWith("/") && !redirectUrl.startsWith("//") && redirectUrl !== "/login"
            ? redirectUrl
            : "/dashboard"
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) {
      throw err
    }
    return {
      success: false,
      error: "An unexpected error occurred. Please try again.",
    }
  }

  if (targetRedirect && !skipRedirect) {
    redirect(targetRedirect)
  }

  return {
    success: true,
    user: authenticatedUser,
    redirectUrl: targetRedirect || "/dashboard",
  }
}

/**
 * Server Action: Register new user and link profile
 */
export async function registerAction(
  _prevState: AuthActionResult | null,
  formData: FormData
): Promise<AuthActionResult> {
  const displayName = (formData.get("displayName") as string)?.trim()
  const avatarUrl: string | null = null
  const email = (formData.get("email") as string)?.trim().toLowerCase()
  const password = formData.get("password") as string
  const confirmPassword = formData.get("confirmPassword") as string
  const sex = (formData.get("sex") as string)?.trim()

  if (!displayName || displayName.length < 2) {
    return {
      success: false,
      error: "Please enter your name (at least 2 characters).",
    }
  }

  if (!email || !isValidEmail(email)) {
    return { success: false, error: "Please enter a valid email address." }
  }

  if (!password || password.length < 6) {
    return {
      success: false,
      error: "Password must be at least 6 characters long.",
    }
  }

  if (password !== confirmPassword) {
    return {
      success: false,
      error: "Passwords do not match.",
    }
  }

  if (!sex || !["male", "female", "prefer_not_to_say"].includes(sex)) {
    return {
      success: false,
      error: "Please select an option for sex.",
    }
  }

  let targetRedirect: string | null = null

  try {
    const supabase = await createClient()
    const siteUrl = getSiteUrl()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${siteUrl}/auth/confirm`,
        data: {
          display_name: displayName,
          avatar_url: avatarUrl,
          sex: sex,
        },
      },
    })

    if (error) {
      if (error.message.toLowerCase().includes("already registered")) {
        return {
          success: false,
          error: "An account with this email address already exists.",
        }
      }
      return {
        success: false,
        error: error.message || "Failed to create account. Please try again.",
      }
    }

    if (data.user) {
      // If immediate session is established (email confirmation disabled in Supabase)
      if (data.session) {
        // Create initial profile record securely using authenticated user ID
        const { error: profileError } = await supabase.from("profiles").upsert(
          {
            user_id: data.user.id,
            display_name: displayName,
            avatar_url: avatarUrl,
            sex: sex as "male" | "female" | "prefer_not_to_say",
          },
          { onConflict: "user_id" }
        )

        // If sex column migration is pending in Supabase, fallback gracefully
        if (
          profileError &&
          (profileError.message.toLowerCase().includes("column") ||
            profileError.message.toLowerCase().includes("does not exist"))
        ) {
          await supabase.from("profiles").upsert(
            {
              user_id: data.user.id,
              display_name: displayName,
              avatar_url: avatarUrl,
            },
            { onConflict: "user_id" }
          )
        }
        targetRedirect = "/onboarding"
      } else {
        // Email confirmation is required by Supabase project settings
        return {
          success: true,
          requiresEmailConfirmation: true,
          message:
            "Account created! Please check your email to verify your account before logging in.",
        }
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) {
      throw err
    }
    return {
      success: false,
      error: "An unexpected error occurred during registration.",
    }
  }

  if (targetRedirect) {
    redirect(targetRedirect)
  }

  return { success: true }
}

/**
 * Server Action: Log out user and clear session cookies
 */
export async function logoutAction(): Promise<void> {
  try {
    await lockMpinAction()
    const supabase = await createClient()
    await supabase.auth.signOut()
    const cookieStore = await cookies()
    cookieStore.delete("sb-remember-me")
    cookieStore.delete("seijun_cycle_context")
    revalidatePath("/", "layout")
    cookieStore.delete("seijun-mpin-locked")
    cookieStore.delete("seijun-mpin-setup")
  } catch {
    // Ignore error and proceed with redirect
  }
  redirect("/login")
}

/**
 * Server Action: Update session lock cookie state
 */
export async function setSessionLockAction(locked: boolean): Promise<void> {
  try {
    if (locked && !(await lockMpinAction())) {
      const supabase = await createClient()
      await supabase.auth.signOut()
    }
    const cookieStore = await cookies()
    if (locked) {
      cookieStore.set("seijun-mpin-locked", "true", {
        path: "/",
        sameSite: "lax",
        httpOnly: false,
        maxAge: 30 * 24 * 60 * 60, // 30 days
      })
    } else {
      cookieStore.delete("seijun-mpin-locked")
    }
  } catch {
    // Ignore cookie update errors
  }
}

/**
 * Server Action: Set or clear first-time MPIN setup pending cookie
 */
export async function setMpinSetupPendingAction(pending: boolean): Promise<void> {
  try {
    const cookieStore = await cookies()
    if (pending) {
      cookieStore.set("seijun-mpin-setup", "pending", {
        path: "/",
        sameSite: "lax",
        httpOnly: false,
        maxAge: 3600, // 1 hour
      })
    } else {
      cookieStore.delete("seijun-mpin-setup")
    }
  } catch {
    // Ignore cookie update errors
  }
}

/**
 * Server Action: Forgot MPIN action (signs out and redirects to login with reset flag)
 */
export async function forgotMpinAction(): Promise<void> {
  try {
    await lockMpinAction()
    const supabase = await createClient()
    await supabase.auth.signOut()
    const cookieStore = await cookies()
    cookieStore.delete("sb-remember-me")
    cookieStore.delete("seijun_cycle_context")
    revalidatePath("/", "layout")
    cookieStore.delete("seijun-mpin-locked")
    cookieStore.delete("seijun-mpin-setup")
  } catch {
    // Ignore error
  }
  redirect("/login?reset_mpin=true")
}

/**
 * Server Action: Get authenticated user's MPIN status from profiles table
 */
export async function getUserMpinStatusAction(): Promise<{ hasMpin: boolean }> {
  const status = await getMpinStatusAction()
  return { hasMpin: status?.configured ?? false }
}

/**
 * Server Action: Update authenticated user's MPIN status in profiles table
 */
export async function setUserMpinStatusAction(
  hasMpin: boolean
): Promise<{ success: boolean; error?: string }> {
  void hasMpin
  return { success: false, error: "MPIN status is managed by account enrollment." }
}
