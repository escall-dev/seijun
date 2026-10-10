import assert from "node:assert/strict"
import fs from "node:fs"
import { PGlite } from "@electric-sql/pglite"
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto"

const db = new PGlite({ extensions: { pgcrypto } })
const userA = "00000000-0000-4000-8000-000000000001"
const userB = "00000000-0000-4000-8000-000000000002"
const sessionA = "10000000-0000-4000-8000-000000000001"
const sessionA2 = "10000000-0000-4000-8000-000000000002"
const sessionB = "10000000-0000-4000-8000-000000000003"

await db.exec(`
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE authenticator;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users(id uuid PRIMARY KEY);
  CREATE TABLE auth.sessions(id uuid PRIMARY KEY, user_id uuid NOT NULL, created_at timestamptz DEFAULT now());
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('request.jwt', true), '')::jsonb $$;
  GRANT USAGE ON SCHEMA auth TO authenticated;
  GRANT EXECUTE ON FUNCTION auth.uid(), auth.jwt() TO authenticated;
  CREATE EXTENSION pgcrypto;
  CREATE TABLE public.profiles(user_id uuid PRIMARY KEY REFERENCES auth.users(id),
    has_mpin boolean NOT NULL DEFAULT false, onboarding_completed boolean NOT NULL DEFAULT true);
  CREATE TABLE public.cycles(id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id));
  ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.cycles ENABLE ROW LEVEL SECURITY;
  CREATE POLICY own_profile ON public.profiles FOR ALL TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  CREATE POLICY own_cycles ON public.cycles FOR ALL TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  GRANT USAGE ON SCHEMA public TO authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles, public.cycles TO authenticated;
  INSERT INTO auth.users(id) VALUES ('${userA}'), ('${userB}');
  INSERT INTO auth.sessions(id,user_id) VALUES ('${sessionA}','${userA}'),
    ('${sessionA2}','${userA}'), ('${sessionB}','${userB}');
  INSERT INTO public.profiles(user_id,has_mpin) VALUES ('${userA}',true), ('${userB}',false);
  INSERT INTO public.cycles(user_id) VALUES ('${userA}'), ('${userB}');
`)
await db.exec(fs.readFileSync("supabase/migrations/20261010000000_phase24_account_mpin.sql", "utf8"))

async function asUser(user, session) {
  await db.exec("RESET ROLE")
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [user])
  await db.query("SELECT set_config('request.jwt', $1, false)",
    [JSON.stringify({ sub: user, session_id: session, role: "authenticated" })])
  await db.exec("SET ROLE authenticated")
}
async function one(sql, params = []) { return (await db.query(sql, params)).rows[0] }

await asUser(userA, sessionA)
assert.equal((await one("SELECT (public.mpin_status()->>'configured')::boolean AS value")).value, false)
assert.equal((await one("SELECT (public.mpin_status()->>'legacy')::boolean AS value")).value, true)
assert.equal((await one("SELECT count(*)::int AS value FROM public.cycles")).value, 0)
assert.equal((await one("SELECT public.mpin_enroll($1) AS value", ["123456"])).value, true)
assert.equal((await one("SELECT public.mpin_enroll($1) AS value", ["654321"])).value, false)
assert.equal((await one("SELECT count(*)::int AS value FROM public.cycles")).value, 1)

await asUser(userA, sessionA2)
assert.equal((await one("SELECT public.mpin_access_allowed() AS value")).value, false)
assert.equal((await one("SELECT count(*)::int AS value FROM public.cycles")).value, 0)
assert.equal((await one("SELECT public.mpin_enroll($1) AS value", ["654321"])).value, false)
assert.equal((await one("SELECT public.mpin_verify($1) AS value", ["000000"])).value.success, false)
assert.equal((await one("SELECT public.mpin_verify($1) AS value", ["123456"])).value.success, true)
assert.equal((await one("SELECT count(*)::int AS value FROM public.cycles")).value, 1)
await assert.rejects(() => one("UPDATE public.profiles SET has_mpin = false WHERE user_id = auth.uid()"))

await asUser(userB, sessionB)
assert.equal((await one("SELECT public.mpin_access_allowed() AS value")).value, false)
assert.equal((await one("SELECT public.mpin_verify($1) AS value", ["123456"])).value.success, false)
assert.equal((await one("SELECT count(*)::int AS value FROM public.cycles")).value, 0)
await assert.rejects(() => one("SELECT * FROM private.mpin_credentials"))
await db.query("SELECT set_config('request.path', $1, false)", ["rpc/search_partner_by_username"])
await db.query("SELECT set_config('request.method', $1, false)", ["POST"])
await assert.rejects(() => one("SELECT public.mpin_pre_request()"), /MPIN verification required/)
await db.query("SELECT set_config('request.path', $1, false)", ["rpc/mpin_verify"])
await one("SELECT public.mpin_pre_request()")

await asUser(userA, sessionA2)
await db.exec("SELECT public.mpin_lock()")
assert.equal((await one("SELECT public.mpin_access_allowed() AS value")).value, false)
for (let n = 0; n < 5; n++) await one("SELECT public.mpin_verify($1) AS value", ["000000"])
assert.equal((await one("SELECT public.mpin_verify($1) AS value", ["123456"])).value.locked, true)
assert.equal((await one("SELECT count(*)::int AS value FROM public.cycles")).value, 0)
assert.equal((await one("SELECT public.mpin_recover($1) AS value", ["222222"])).value, true)
assert.equal((await one("SELECT public.mpin_access_allowed() AS value")).value, false)
assert.equal((await one("SELECT public.mpin_verify($1) AS value", ["222222"])).value.success, true)
await asUser(userA, sessionA)
assert.equal((await one("SELECT public.mpin_access_allowed() AS value")).value, false)
assert.equal((await one("SELECT public.mpin_verify($1) AS value", ["123456"])).value.success, false)
assert.equal((await one("SELECT public.mpin_verify($1) AS value", ["222222"])).value.success, true)

await db.exec("RESET ROLE")
await db.query("SELECT set_config('request.jwt.claim.sub', '', false)")
await db.query("SELECT set_config('request.jwt', '{}', false)")
await db.exec("SET ROLE anon")
await assert.rejects(() => one("SELECT public.mpin_verify($1)", ["123456"]))

await db.exec("RESET ROLE")
assert.equal((await one("SELECT count(*)::int AS value FROM private.mpin_credentials")).value, 1)
assert.equal((await one("SELECT verifier ~ '^[0-9]{6}$' AS value FROM private.mpin_credentials")).value, false)
console.log("Phase 24 MPIN database tests passed")
await db.close()
