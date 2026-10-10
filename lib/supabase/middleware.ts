import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { getSupabaseEnv } from "./config"
import type { Database } from "./types"

/**
 * Updates user session in Next.js proxy/middleware.
 *
 * Adheres strictly to the canonical @supabase/ssr Next.js App Router contract:
 * 1. Reads incoming cookies from request.
 * 2. Refreshes expired auth tokens via getUser().
 * 3. Propagates refreshed cookies forward to Server Components and down to browser response.
 * 4. Ensures all cookies are preserved across redirects.
 * 5. Avoids redundant, fragile database queries in the Edge proxy layer.
 */
export async function updateSession(request: NextRequest) {
  const { url, key, isConfigured } = getSupabaseEnv()

  // If Supabase credentials are not configured, allow request through
  if (!isConfigured || !url || !key) {
    return NextResponse.next({
      request: {
        headers: request.headers,
      },
    })
  }

  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        const rememberMeCookie = request.cookies.get("sb-remember-me")?.value
        const isPersistent = rememberMeCookie !== "false"

        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        )
        supabaseResponse = NextResponse.next({
          request,
        })
        cookiesToSet.forEach(({ name, value, options }) => {
          const cookieOpts = { ...options }
          if (!isPersistent) {
            delete cookieOpts.maxAge
            delete cookieOpts.expires
          }
          supabaseResponse.cookies.set(name, value, cookieOpts)
        })
      },
    },
  })

  // Validate session and refresh tokens if needed
  // IMPORTANT: Do NOT run code between createServerClient and supabase.auth.getUser()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  // Comprehensive protected routes list
  const protectedRoutes = [
    "/dashboard",
    "/calendar",
    "/cycles",
    "/symptoms",
    "/notes",
    "/settings",
    "/onboarding",
  ]
  const isProtectedRoute = pathname === "/partner" || protectedRoutes.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  )
  const isAuthRoute = pathname === "/login" || pathname === "/register"
  const isRoot = pathname === "/"
  const isServerAction = request.headers.has("next-action")

  // CRITICAL: Never intercept or redirect Server Actions in proxy/middleware.
  // Server Actions handle their own auth checks and return RSC action payloads.
  // Redirecting a Server Action with NextResponse.redirect causes Next.js to throw:
  // "An unexpected response was received from the server" on the client.
  if (isServerAction) {
    return supabaseResponse
  }

  // A browser can edit cookies. Database-backed session state is authoritative.
  let mpinVerified = false
  if (user && (isProtectedRoute || isAuthRoute || isRoot)) {
    const { data, error } = await supabase.rpc("mpin_access_allowed")
    mpinVerified = !error && data === true
  }

  // 1. Unauthenticated user on protected route -> /login
  if (!user && isProtectedRoute) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = "/login"
    if (pathname !== "/dashboard" && pathname !== "/onboarding") {
      redirectUrl.searchParams.set("redirect", pathname + request.nextUrl.search)
    }
    const redirectResponse = NextResponse.redirect(redirectUrl)
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie)
    })
    return redirectResponse
  }

  // 2. Unauthenticated user on root / -> /login
  if (!user && isRoot) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = "/login"
    const redirectResponse = NextResponse.redirect(redirectUrl)
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie)
    })
    return redirectResponse
  }

  // 2b. Authenticated user whose device/session is locked by MPIN -> redirect to /login
  if (user && !mpinVerified && (isProtectedRoute || isRoot)) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = "/login"
    if (pathname !== "/dashboard" && pathname !== "/onboarding" && pathname !== "/") {
      redirectUrl.searchParams.set("redirect", pathname + request.nextUrl.search)
    }
    const redirectResponse = NextResponse.redirect(redirectUrl)
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie)
    })
    return redirectResponse
  }

  // 3. Authenticated user visiting /login or /register
  if (user && isAuthRoute) {
    if (!mpinVerified) {
      return supabaseResponse
    }

    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = "/dashboard"
    redirectUrl.searchParams.delete("redirect")
    const redirectResponse = NextResponse.redirect(redirectUrl)
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie)
    })
    return redirectResponse
  }

  // 4. Authenticated user visiting root / -> /dashboard
  if (user && isRoot) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = "/dashboard"
    const redirectResponse = NextResponse.redirect(redirectUrl)
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie)
    })
    return redirectResponse
  }

  return supabaseResponse
}
