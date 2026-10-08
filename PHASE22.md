# Seijun Phase 22 — v1.22.0

## Database rollout

Apply `supabase/migrations/20261008103241_phase22_cycle_notes_symptoms.sql` using the project's existing Supabase migration workflow before enabling writes in the updated application. No live database migration was applied during implementation.

The migration adds a symptom array while preserving the legacy single-value column, note request IDs, and immutable sent-version timestamps. Existing partner contributions and currently shared notes are marked as sent without changing their authors or creation timestamps. Sharing an existing private note freezes its version. Private, unsent notes remain editable by their owner. Sent versions cannot be edited or deleted by either partner.

Notes pagination selects eight complete date groups per page with a date cursor and creation-time snapshot. The RPC returns a JSON array so a large date group cannot be truncated by PostgREST's row cap. During an application-before-database rollout, a missing RPC falls back to RLS-protected table reads and a read-only Notes view. Permission errors never activate the fallback.

## Note notifications

Configure `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY` in the server environment, alongside the existing Supabase URL and VAPID configuration. Never use a `NEXT_PUBLIC_` variable for this secret. Environment files were not changed. The configured local environment lacked this server credential at verification time.

The database creates one privacy-preserving notification event per saved shared note. Delivery runs after the response, or through the existing authenticated cron endpoint. An atomic, service-only claim prevents concurrent dispatch and retry duplication. The title is **New note from your partner** and the body is **Your partner sent you a new note.** No message content appears in the payload. Owner-to-supporter notifications open `/notes?view=partner`; replies open `/notes?tab=partner` with the received-notes tab selected. Authentication redirects retain the destination query string, and the Notes page rechecks current partner permissions.

Push uses at-most-once dispatch: once a delivery is claimed, uncertain or failed transport is not retried automatically. This avoids duplicate notifications but cannot guarantee delivery after a process crash or transport failure. The note remains saved. Missing server credentials leave events queued for a later configured run. A database event-insertion failure is logged without rolling back the note.

## Cycle and navigation behavior

Cycle Day counts calendar dates in Asia/Manila. Period `end_date` remains a period end; actual cycle completion and historical lengths derive from the next recorded cycle start. The current cycle continues after its predicted date. Historical estimates use a median of recent valid completed intervals with outlier filtering; limited or absent history falls back to the profile estimate. Three or more accepted intervals support a prediction window. Dates are estimates, never deadlines.

Home streams noncritical daily symptoms, replaces the note card with a compact navigable calendar, and links to Notes. The shell receives request-scoped session/context data instead of repeating initial client reads. Account identity changes clear profile state, discard superseded responses, hide mismatched account content, and refresh the router. Context providers remount when account, relationship, mode, or permissions change. Navigation feedback no longer blocks the whole screen.

## Validation

- `npm run test:phase22`: calendar boundaries, limited/irregular histories, extended cycles, legacy/multiple symptoms, actual PostgreSQL triggers and RLS, sent-version restrictions, author spoofing, request idempotency, notification routing/preferences/claims, mocked transport and enqueue failures, complete date-group pagination, and missing-RPC compatibility with a 1,205-note date group.
- All 22 existing `scripts/test-*.mjs` suites passed after updating obsolete Phase 21/version and inline-note-editor assertions.
- TypeScript and production builds passed. Full lint remains blocked by pre-existing errors in untouched files; changed application files pass targeted lint.
- Focused SQL tests passed in direct sequential runs. Some repeated npm/build runs encountered host memory allocation failures; the test command limits parallel WebAssembly compilation to reduce peak memory.
- A read-only request to the configured database confirmed `PGRST202`: the pagination RPC was not installed. The live migration and real-device push delivery remain unverified.
- Browser automation failed before opening a session. Authenticated navigation, account switching, and responsive visual behavior are not claimed as browser-verified.
- HTTP smoke checks confirmed protected-page login redirects and preservation of `/notes?view=partner` through authentication.

No commits, deployment, production data changes, or secret changes were made.
