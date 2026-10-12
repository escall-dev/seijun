-- Phase 25A.1: Database Authorization Hardening — 8-Hour MPIN Verification Window
--
-- Objective:
-- Enforce an 8-hour verification window at the PostgreSQL authorization layer.
-- Once verified_until <= now(), public.mpin_access_allowed() immediately denies
-- protected access, preventing stale verification records from authorizing access
-- after logout failures, network partitions, or abandoned sessions.
--
-- Security Invariants Preserved:
-- 1. All functions remain SECURITY DEFINER with search_path = ''.
-- 2. Fresh session (<5 minutes) required for enrollment.
-- 3. Atomic first-write credential enrollment (ON CONFLICT DO NOTHING).
-- 4. Pessimistic row locking (FOR UPDATE) on credentials during verification.
-- 5. Progressive rate-limiting lockout (5 failures -> 15m, 10 failures -> 1h).
-- 6. Trigger bypass (app.mpin_internal = 'yes') for profile flag updates.
-- 7. Cross-device and cross-user isolation keyed strictly by session_id and auth.uid().
-- 8. Existing primary key on session_id preserves O(1) single-row lookup without index bloat.

-- Step 1: Add verified_until column without default first to allow historical backfill
ALTER TABLE private.mpin_verified_sessions
  ADD COLUMN IF NOT EXISTS verified_until timestamptz;

-- Step 2: Backfill existing records using verified_at + interval '8 hours'.
-- Sessions older than 8 hours expire immediately; recent sessions retain only
-- the remainder of their historical window.
UPDATE private.mpin_verified_sessions
  SET verified_until = verified_at + interval '8 hours'
  WHERE verified_until IS NULL;

-- Step 3: Establish default for future writes and enforce NOT NULL constraint
ALTER TABLE private.mpin_verified_sessions
  ALTER COLUMN verified_until SET DEFAULT (now() + interval '8 hours');

ALTER TABLE private.mpin_verified_sessions
  ALTER COLUMN verified_until SET NOT NULL;

-- Step 4: Update public.mpin_access_allowed() with expiry check
CREATE OR REPLACE FUNCTION public.mpin_access_allowed() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM private.mpin_verified_sessions s
      WHERE s.user_id = auth.uid()
        AND s.session_id = NULLIF(auth.jwt()->>'session_id', '')::uuid
        AND s.verified_until > now()
        AND EXISTS (SELECT 1 FROM auth.sessions a WHERE a.id = s.session_id AND a.user_id = s.user_id)
    );
$$;
REVOKE ALL ON FUNCTION public.mpin_access_allowed() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mpin_access_allowed() TO authenticated;

-- Step 5: Update public.mpin_verify(text) to renew verified_until upon successful PIN match
CREATE OR REPLACE FUNCTION public.mpin_verify(p_pin text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  credential private.mpin_credentials%ROWTYPE;
  sid uuid := NULLIF(auth.jwt()->>'session_id', '')::uuid;
  delay_seconds integer;
BEGIN
  IF auth.uid() IS NULL OR sid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  SELECT * INTO credential FROM private.mpin_credentials WHERE user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND OR credential.locked_until > now() THEN
    RETURN jsonb_build_object('success', false, 'locked', COALESCE(credential.locked_until > now(), false));
  END IF;
  IF p_pin ~ '^[0-9]{6}$' AND private.mpin_crypt(p_pin, credential.verifier) = credential.verifier THEN
    UPDATE private.mpin_credentials SET failed_attempts = 0, locked_until = NULL WHERE user_id = auth.uid();
    INSERT INTO private.mpin_verified_sessions(session_id, user_id, verified_at, verified_until)
    VALUES (sid, auth.uid(), now(), now() + interval '8 hours')
    ON CONFLICT (session_id) DO UPDATE SET
      user_id = EXCLUDED.user_id,
      verified_at = now(),
      verified_until = now() + interval '8 hours';
    RETURN jsonb_build_object('success', true, 'locked', false);
  END IF;
  delay_seconds := CASE WHEN credential.failed_attempts + 1 >= 10 THEN 3600
    WHEN credential.failed_attempts + 1 >= 5 THEN 900 ELSE 0 END;
  UPDATE private.mpin_credentials SET failed_attempts = failed_attempts + 1,
    locked_until = CASE WHEN delay_seconds > 0 THEN now() + make_interval(secs => delay_seconds) ELSE NULL END
    WHERE user_id = auth.uid();
  RETURN jsonb_build_object('success', false, 'locked', delay_seconds > 0);
END;
$$;
REVOKE ALL ON FUNCTION public.mpin_verify(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mpin_verify(text) TO authenticated;

-- Step 6: Update public.mpin_enroll(text) to establish initial 8-hour verified_until
CREATE OR REPLACE FUNCTION public.mpin_enroll(p_pin text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  inserted integer;
  sid uuid := NULLIF(auth.jwt()->>'session_id', '')::uuid;
BEGIN
  IF auth.uid() IS NULL OR sid IS NULL OR p_pin !~ '^[0-9]{6}$' THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.sessions s WHERE s.id = sid AND s.user_id = auth.uid()
    AND s.created_at > now() - interval '5 minutes') THEN RETURN false; END IF;
  INSERT INTO private.mpin_credentials(user_id, verifier)
  VALUES (auth.uid(), private.mpin_crypt(p_pin, private.mpin_salt()))
  ON CONFLICT (user_id) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  IF inserted <> 1 THEN RETURN false; END IF;
  INSERT INTO public.profiles(user_id) VALUES (auth.uid()) ON CONFLICT (user_id) DO NOTHING;
  PERFORM pg_catalog.set_config('app.mpin_internal', 'yes', true);
  UPDATE public.profiles SET has_mpin = true WHERE user_id = auth.uid();
  INSERT INTO private.mpin_verified_sessions(session_id, user_id, verified_at, verified_until)
  VALUES (sid, auth.uid(), now(), now() + interval '8 hours')
  ON CONFLICT (session_id) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    verified_at = now(),
    verified_until = now() + interval '8 hours';
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.mpin_enroll(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mpin_enroll(text) TO authenticated;
