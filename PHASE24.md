# Phase 24: account MPIN

The account verifier lives in `private.mpin_credentials`. It is a unique salted
pgcrypto bcrypt hash (cost 12), never a browser record or `profiles.has_mpin`.
`public.mpin_verify` checks it under a row lock, counts failed attempts across
devices, and locks the account's MPIN for 15 minutes after five failures and
one hour after ten. Success marks the current Supabase Auth `session_id` in a
private table. Sign out and inactivity lock revoke that session's mark.

The migration adds restrictive RLS policies to existing public data tables and
a PostgREST pre-request check for direct table and RPC calls. A browser cookie
cannot grant access. The pre-request check is deliberately fail closed if an
existing hook is configured, so that hook must be reviewed and combined first.
The migration must be applied before deploying this application code. Do not
apply it to a different Supabase project. Recheck policies and functions created
after this migration: they need the same MPIN gate.

`profiles.has_mpin` is legacy metadata. A local one-way verifier cannot be
transferred to the account. Users with only a local MPIN sign in with their
account password, then explicitly enroll their preferred six digits once.
They can choose the same PIN as before. New devices then verify that account
PIN. A concurrent second enrollment cannot overwrite the first. After account
enrollment, local verifier and recoverable autofill values are deleted. A user
who forgot an established account PIN can re-enter the account password to
recover it; this creates a fresh Auth session and replaces the PIN across
devices. Recovery invalidates other MPIN-verified sessions.

Six digits have limited entropy even with bcrypt. The server limits online
guesses, but a database and verifier compromise still permits an offline search
of one million PINs. Password-based recovery means the account password is a
recovery factor; users should use a strong password and Supabase Auth MFA where
available. Existing Auth access tokens may remain valid until expiry after a
sign-out, although `mpin_access_allowed` also checks that their Auth session
still exists. Public avatar assets are outside the database MPIN gate.

## Validation and deployment

Run `npm run test:phase24`, `npm test`, `npx tsc --noEmit`, and a production
build. The PGlite test exercises the migration and RLS with simulated users and
sessions. It does not prove the hosted PostgREST hook, real Auth sessions, or
physical devices. On the intended Supabase project, first inspect the active
`authenticator` pre-request setting, applied migrations, RPC grants, and RLS
policies. Apply the migration there, then deploy the app. Test with two real
devices before calling the phase complete.

1. Sign in on device A with email and password. If prompted for legacy
   re-enrollment, enter the existing six digits. Sign out and sign in again;
   verify the returning MPIN screen and unlock with those digits.
2. On a clean browser on device B, sign in to the same account. Verify that
   it asks for the same MPIN, never setup, and rejects a wrong MPIN.
3. Switch device B to a different account. Verify that its own MPIN or initial
   setup appears. Return to the first account and verify the original MPIN.
4. While device B is still locked, call a protected Supabase table and RPC
   directly with its Auth token. Both must be denied. Repeated wrong PINs
   should trigger a lockout that also applies on device A.
