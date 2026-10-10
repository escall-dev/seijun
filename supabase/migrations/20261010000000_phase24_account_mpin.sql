-- Phase 24. Keep low-entropy PIN verifiers outside the exposed API schema.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS private.mpin_credentials (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  verifier text NOT NULL,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS private.mpin_verified_sessions (
  session_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  verified_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mpin_verified_sessions_user_id_idx ON private.mpin_verified_sessions(user_id);
ALTER TABLE private.mpin_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.mpin_verified_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA private FROM PUBLIC, anon, authenticated;

-- Existing projects may have pgcrypto in public or extensions.
CREATE OR REPLACE FUNCTION private.mpin_crypt(p_value text, p_salt text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE ext_schema text; result text;
BEGIN
  SELECT n.nspname INTO ext_schema FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'pgcrypto';
  IF ext_schema IS NULL THEN RAISE EXCEPTION 'pgcrypto is required'; END IF;
  EXECUTE format('SELECT %I.crypt($1,$2)', ext_schema) INTO result USING p_value, p_salt;
  RETURN result;
END;
$$;
CREATE OR REPLACE FUNCTION private.mpin_salt() RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE ext_schema text; result text;
BEGIN
  SELECT n.nspname INTO ext_schema FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'pgcrypto';
  IF ext_schema IS NULL THEN RAISE EXCEPTION 'pgcrypto is required'; END IF;
  EXECUTE format('SELECT %I.gen_salt(''bf'', 12)', ext_schema) INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION private.mpin_crypt(text,text), private.mpin_salt() FROM PUBLIC, anon, authenticated;

-- JWT session_id is issued by Supabase Auth and cannot be edited by a browser.
CREATE OR REPLACE FUNCTION public.mpin_access_allowed() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM private.mpin_verified_sessions s
      WHERE s.user_id = auth.uid()
        AND s.session_id = NULLIF(auth.jwt()->>'session_id', '')::uuid
        AND EXISTS (SELECT 1 FROM auth.sessions a WHERE a.id = s.session_id AND a.user_id = s.user_id)
    );
$$;
REVOKE ALL ON FUNCTION public.mpin_access_allowed() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mpin_access_allowed() TO authenticated;

-- Configuration is derived from the credential row. has_mpin is legacy metadata only.
CREATE OR REPLACE FUNCTION public.mpin_status() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  configured boolean;
  legacy boolean;
  onboarded boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  SELECT EXISTS(SELECT 1 FROM private.mpin_credentials WHERE user_id = auth.uid()) INTO configured;
  SELECT COALESCE(p.has_mpin, false), COALESCE(p.onboarding_completed, false)
    INTO legacy, onboarded FROM public.profiles p WHERE p.user_id = auth.uid();
  RETURN jsonb_build_object('configured', configured, 'legacy', COALESCE(legacy, false),
    'verified', public.mpin_access_allowed(), 'onboardingCompleted', COALESCE(onboarded, false));
END;
$$;
REVOKE ALL ON FUNCTION public.mpin_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mpin_status() TO authenticated;

-- An insert is atomic: concurrent first-time setups cannot replace the first PIN.
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
  INSERT INTO private.mpin_verified_sessions(session_id, user_id) VALUES (sid, auth.uid())
  ON CONFLICT (session_id) DO UPDATE SET user_id = EXCLUDED.user_id, verified_at = now();
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.mpin_enroll(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mpin_enroll(text) TO authenticated;

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
    INSERT INTO private.mpin_verified_sessions(session_id, user_id) VALUES (sid, auth.uid())
    ON CONFLICT (session_id) DO UPDATE SET user_id = EXCLUDED.user_id, verified_at = now();
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

CREATE OR REPLACE FUNCTION public.mpin_lock() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  DELETE FROM private.mpin_verified_sessions
    WHERE user_id = auth.uid() AND session_id = NULLIF(auth.jwt()->>'session_id', '')::uuid;
END;
$$;
REVOKE ALL ON FUNCTION public.mpin_lock() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mpin_lock() TO authenticated;

CREATE OR REPLACE FUNCTION public.mpin_change(p_old_pin text, p_new_pin text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  credential private.mpin_credentials%ROWTYPE;
  delay_seconds integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.mpin_access_allowed() OR p_new_pin !~ '^[0-9]{6}$' THEN RETURN false; END IF;
  SELECT * INTO credential FROM private.mpin_credentials WHERE user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND OR credential.locked_until > now() THEN RETURN false; END IF;
  IF p_old_pin !~ '^[0-9]{6}$' OR private.mpin_crypt(p_old_pin, credential.verifier) <> credential.verifier THEN
    delay_seconds := CASE WHEN credential.failed_attempts + 1 >= 10 THEN 3600
      WHEN credential.failed_attempts + 1 >= 5 THEN 900 ELSE 0 END;
    UPDATE private.mpin_credentials SET failed_attempts = failed_attempts + 1,
      locked_until = CASE WHEN delay_seconds > 0 THEN now() + make_interval(secs => delay_seconds) ELSE NULL END
      WHERE user_id = auth.uid();
    RETURN false;
  END IF;
  UPDATE private.mpin_credentials SET verifier = private.mpin_crypt(p_new_pin, private.mpin_salt()),
    failed_attempts = 0, locked_until = NULL, changed_at = now() WHERE user_id = auth.uid();
  -- Every device must prove knowledge of the new PIN on its next request.
  DELETE FROM private.mpin_verified_sessions WHERE user_id = auth.uid()
    AND session_id <> NULLIF(auth.jwt()->>'session_id', '')::uuid;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.mpin_change(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mpin_change(text,text) TO authenticated;

-- Recovery requires a newly created Supabase Auth session. The application
-- obtains that session by checking the account password again. Refreshing an
-- existing session retains its original session ID and cannot satisfy this.
CREATE OR REPLACE FUNCTION public.mpin_recover(p_new_pin text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  sid uuid := NULLIF(auth.jwt()->>'session_id', '')::uuid;
BEGIN
  IF auth.uid() IS NULL OR sid IS NULL OR p_new_pin !~ '^[0-9]{6}$' THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.sessions s WHERE s.id = sid AND s.user_id = auth.uid()
    AND s.created_at > now() - interval '2 minutes') THEN RETURN false; END IF;
  INSERT INTO private.mpin_credentials(user_id, verifier, failed_attempts, locked_until, changed_at)
  VALUES (auth.uid(), private.mpin_crypt(p_new_pin, private.mpin_salt()), 0, NULL, now())
  ON CONFLICT (user_id) DO UPDATE SET
    verifier = EXCLUDED.verifier,
    failed_attempts = 0,
    locked_until = NULL,
    changed_at = now();
  INSERT INTO public.profiles(user_id) VALUES (auth.uid()) ON CONFLICT (user_id) DO NOTHING;
  PERFORM pg_catalog.set_config('app.mpin_internal', 'yes', true);
  UPDATE public.profiles SET has_mpin = true WHERE user_id = auth.uid();
  DELETE FROM private.mpin_verified_sessions WHERE user_id = auth.uid();
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.mpin_recover(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mpin_recover(text) TO authenticated;

-- Preserve existing permissive policies, adding an AND gate for authenticated
-- access to every existing public data table. Profile insertion is needed before
-- a new user's first MPIN enrollment; profile reads and updates remain gated.
DO $$
DECLARE t record; op text;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
  LOOP
    FOREACH op IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
      IF NOT (t.relname = 'profiles' AND op = 'INSERT') THEN
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',
          'MPIN verified ' || lower(op), t.relname);
        EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR %s TO authenticated %s',
          'MPIN verified ' || lower(op), t.relname, op,
          CASE WHEN op = 'INSERT' THEN 'WITH CHECK (public.mpin_access_allowed())'
            WHEN op = 'UPDATE' THEN 'USING (public.mpin_access_allowed()) WITH CHECK (public.mpin_access_allowed())'
            ELSE 'USING (public.mpin_access_allowed())' END);
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

-- Ordinary clients must not edit the legacy flag to force a setup path.
CREATE OR REPLACE FUNCTION public.protect_profile_mpin_flag() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.has_mpin := false;
  ELSIF NEW.has_mpin IS DISTINCT FROM OLD.has_mpin
    AND pg_catalog.current_setting('app.mpin_internal', true) IS DISTINCT FROM 'yes' THEN
    RAISE EXCEPTION 'MPIN state is managed by the server';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_profile_mpin_flag() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS protect_profile_mpin_flag ON public.profiles;
CREATE TRIGGER protect_profile_mpin_flag BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_mpin_flag();

-- RLS covers tables (including Realtime). The Data API request gate also
-- covers existing SECURITY DEFINER RPCs that would otherwise bypass RLS.
CREATE OR REPLACE FUNCTION public.mpin_pre_request() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  request_path text := trim(both '/' from pg_catalog.current_setting('request.path', true));
  request_method text := pg_catalog.current_setting('request.method', true);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF public.mpin_access_allowed() THEN RETURN; END IF;
  IF request_path = ANY (ARRAY[
    'rpc/mpin_access_allowed', 'rpc/mpin_status', 'rpc/mpin_enroll',
    'rpc/mpin_verify', 'rpc/mpin_recover', 'rpc/mpin_lock'
  ]) THEN RETURN; END IF;
  -- Registration and email confirmation may create a profile before enrollment.
  IF request_path = 'profiles' AND request_method = 'POST' THEN RETURN; END IF;
  RAISE EXCEPTION 'MPIN verification required' USING ERRCODE = '42501';
END;
$$;
REVOKE ALL ON FUNCTION public.mpin_pre_request() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mpin_pre_request() TO anon, authenticated, authenticator;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles r, unnest(COALESCE(r.rolconfig, ARRAY[]::text[])) c
    WHERE r.rolname = 'authenticator' AND c LIKE 'pgrst.db_pre_request=%'
      AND c <> 'pgrst.db_pre_request='
      AND c <> 'pgrst.db_pre_request=public.mpin_pre_request') THEN
    RAISE EXCEPTION 'Existing PostgREST pre-request hook needs manual integration before Phase 24';
  END IF;
END;
$$;
ALTER ROLE authenticator SET pgrst.db_pre_request = 'public.mpin_pre_request';
NOTIFY pgrst, 'reload config';
