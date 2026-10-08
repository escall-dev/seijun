/**
 * Seijun Phase 18: Scheduled Reminders Route Handler
 *
 * Provides a secure cron endpoint for processing scheduled cycle reminders.
 * Can be triggered periodically via Vercel Cron or external scheduler.
 *
 * SECURITY:
 * Requires CRON_SECRET for execution. Constant-time comparison is used to
 * verify the Bearer token in the Authorization header.
 * If CRON_SECRET is not configured, returns a 500 server error and halts processing.
 */

import { NextResponse } from "next/server"
import crypto from "crypto"
import { deliverNoteNotifications } from "@/lib/server/note-notifications"
import { processPendingNotificationEvents } from "@/lib/reminders/processor"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

interface AuthResult {
  authorized: boolean
  status?: 401 | 500
  error?: string
}

function safeCompare(a: string, b: string): boolean {
  const hashA = crypto.createHash("sha256").update(a).digest()
  const hashB = crypto.createHash("sha256").update(b).digest()
  return crypto.timingSafeEqual(hashA, hashB)
}

function verifyCronAuthorization(request: Request): AuthResult {
  const secret = process.env.CRON_SECRET

  // 1. If CRON_SECRET does not exist, reject unauthenticated production execution
  if (!secret) {
    return {
      authorized: false,
      status: 500,
      error: "Cron authentication is not configured",
    }
  }

  // 2. If CRON_SECRET exists, require valid Bearer token credentials
  const authHeader = request.headers.get("authorization")
  if (!authHeader) {
    return {
      authorized: false,
      status: 401,
      error: "Unauthorized",
    }
  }

  const expectedAuth = `Bearer ${secret}`
  if (!safeCompare(authHeader, expectedAuth)) {
    return {
      authorized: false,
      status: 401,
      error: "Unauthorized",
    }
  }

  return { authorized: true }
}

async function handleCronRequest(request: Request) {
  const auth = verifyCronAuthorization(request)
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  await deliverNoteNotifications()
  const summary = await processPendingNotificationEvents()
  return NextResponse.json({ ok: true, timestamp: new Date().toISOString(), summary })
}

export async function GET(request: Request) {
  return handleCronRequest(request)
}

export async function POST(request: Request) {
  return handleCronRequest(request)
}
