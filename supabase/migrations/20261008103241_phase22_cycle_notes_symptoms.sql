-- Phase 22: additive storage; never rewrite cycle dates or delete legacy records.
ALTER TABLE public.symptoms ADD COLUMN IF NOT EXISTS symptoms text[];
UPDATE public.symptoms SET symptoms = ARRAY[symptom] WHERE symptoms IS NULL;
CREATE OR REPLACE FUNCTION public.normalize_symptom_values() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.symptom IS DISTINCT FROM OLD.symptom AND NEW.symptoms IS NOT DISTINCT FROM OLD.symptoms THEN
    NEW.symptoms := ARRAY[NEW.symptom];
  END IF;
  NEW.symptoms := ARRAY(SELECT DISTINCT value FROM unnest(COALESCE(NEW.symptoms, ARRAY[NEW.symptom])) value ORDER BY value);
  IF cardinality(NEW.symptoms) < 1 OR cardinality(NEW.symptoms) > 10 OR
     NOT NEW.symptoms <@ ARRAY['Cramps','Headache','Back pain','Fatigue','Mood changes','Bloating','Acne','Breast tenderness','Nausea','Appetite changes']::text[] THEN
    RAISE EXCEPTION 'Invalid symptoms' USING ERRCODE = '23514';
  END IF;
  NEW.symptom := NEW.symptoms[1];
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.normalize_symptom_values() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER normalize_symptom_values BEFORE INSERT OR UPDATE ON public.symptoms
FOR EACH ROW EXECUTE FUNCTION public.normalize_symptom_values();

ALTER TABLE public.daily_notes ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS request_id uuid;
CREATE UNIQUE INDEX daily_notes_author_request ON public.daily_notes(author_id, request_id) WHERE request_id IS NOT NULL;
-- Legacy partner contributions are already sent. Preserve authorship/timestamps.
UPDATE public.daily_notes SET sent_at = created_at WHERE author_id IS DISTINCT FROM user_id AND author_id IS NOT NULL;
UPDATE public.daily_notes n SET sent_at = n.created_at WHERE n.sent_at IS NULL AND EXISTS (
  SELECT 1 FROM public.partner_relationships r JOIN public.partner_sharing_preferences p ON p.relationship_id = r.id
  WHERE r.owner_user_id = n.user_id AND r.status = 'active' AND r.supporter_user_id IS NOT NULL AND p.daily_notes
);

CREATE OR REPLACE FUNCTION public.protect_note_version() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NULL OR NEW.author_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Invalid note author' USING ERRCODE = '42501';
    END IF;
    NEW.sent_at := NULL;
    NEW.created_at := now();
    NEW.updated_at := now();
    IF NEW.author_id <> NEW.user_id OR EXISTS (
      SELECT 1 FROM public.partner_relationships r JOIN public.partner_sharing_preferences p ON p.relationship_id = r.id
      WHERE r.owner_user_id = NEW.user_id AND r.status = 'active' AND r.supporter_user_id IS NOT NULL AND p.daily_notes
    ) THEN NEW.sent_at := now(); END IF;
    RETURN NEW;
  END IF;
  -- Only the nested sharing trigger may mark an unchanged private version as sent.
  IF TG_OP = 'UPDATE' AND pg_trigger_depth() > 1 AND OLD.sent_at IS NULL AND NEW.sent_at IS NOT NULL
    AND NEW.id = OLD.id AND NEW.content = OLD.content AND NEW.date = OLD.date
    AND NEW.user_id = OLD.user_id AND NEW.author_id IS NOT DISTINCT FROM OLD.author_id
    AND NEW.created_at = OLD.created_at AND NEW.request_id IS NOT DISTINCT FROM OLD.request_id THEN RETURN NEW; END IF;
  IF OLD.sent_at IS NOT NULL OR OLD.author_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Sent partner notes are immutable. Create a new note.' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.author_id IS DISTINCT FROM OLD.author_id OR
     NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.sent_at IS DISTINCT FROM OLD.sent_at OR
     NEW.request_id IS DISTINCT FROM OLD.request_id THEN
    RAISE EXCEPTION 'Note identity is immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.protect_note_version() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER protect_note_version BEFORE INSERT OR UPDATE OR DELETE ON public.daily_notes
FOR EACH ROW EXECUTE FUNCTION public.protect_note_version();

CREATE OR REPLACE FUNCTION public.freeze_shared_note_versions() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.daily_notes THEN
    UPDATE public.daily_notes n SET sent_at = now() FROM public.partner_relationships r
    WHERE r.id = NEW.relationship_id AND r.status = 'active' AND r.supporter_user_id IS NOT NULL
      AND n.user_id = r.owner_user_id AND n.sent_at IS NULL;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.freeze_shared_note_versions() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER freeze_shared_note_versions AFTER INSERT OR UPDATE OF daily_notes ON public.partner_sharing_preferences
FOR EACH ROW EXECUTE FUNCTION public.freeze_shared_note_versions();

DROP POLICY IF EXISTS "Supporters can update partner daily notes when authorized" ON public.daily_notes;
DROP POLICY IF EXISTS "Supporters can delete partner daily notes when authorized" ON public.daily_notes;
CREATE POLICY "Only authors can modify unsent notes" ON public.daily_notes AS RESTRICTIVE FOR UPDATE TO authenticated
USING (user_id = auth.uid() AND author_id = auth.uid() AND sent_at IS NULL)
WITH CHECK (user_id = auth.uid() AND author_id = auth.uid() AND sent_at IS NULL);
CREATE POLICY "Only authors can delete unsent notes" ON public.daily_notes AS RESTRICTIVE FOR DELETE TO authenticated
USING (user_id = auth.uid() AND author_id = auth.uid() AND sent_at IS NULL);

-- A note has its own event identity; generic per-day dedup would suppress subsequent notes.
DROP INDEX public.idx_notification_events_dedup;
CREATE UNIQUE INDEX idx_notification_events_dedup ON public.notification_events
(user_id, type, scheduled_for, COALESCE(cycle_id, '00000000-0000-0000-0000-000000000000'::uuid))
WHERE status != 'cancelled' AND type != 'partner_daily_notes';
CREATE UNIQUE INDEX notification_events_note_dedup ON public.notification_events(user_id, (metadata->>'noteId'))
WHERE type = 'partner_daily_notes' AND metadata ? 'noteId';

CREATE OR REPLACE FUNCTION public.enqueue_partner_note() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE recipient uuid; relationship uuid; destination text;
BEGIN
  IF NEW.sent_at IS NULL THEN RETURN NEW; END IF;
  SELECT r.id, CASE WHEN NEW.author_id = r.owner_user_id THEN r.supporter_user_id ELSE r.owner_user_id END,
    CASE WHEN NEW.author_id = r.owner_user_id THEN '/notes?view=partner' ELSE '/notes?tab=partner' END
  INTO relationship, recipient, destination
  FROM public.partner_relationships r JOIN public.partner_sharing_preferences p ON p.relationship_id = r.id
  WHERE r.owner_user_id = NEW.user_id AND r.status = 'active' AND p.daily_notes AND r.supporter_user_id IS NOT NULL
    AND NEW.author_id IN (r.owner_user_id, r.supporter_user_id) LIMIT 1;
  IF recipient IS NOT NULL AND COALESCE((SELECT partner_daily_notes FROM public.notification_preferences WHERE user_id = recipient), true) THEN
    INSERT INTO public.notification_events(user_id, type, scheduled_for, title, body, url, status, metadata)
    VALUES(recipient, 'partner_daily_notes', (now() AT TIME ZONE 'Asia/Manila')::date,
      'New note from your partner', 'Your partner sent you a new note.', destination, 'sent',
      jsonb_build_object('noteId', NEW.id, 'relationshipId', relationship)) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Delivery infrastructure failure must never roll back a successfully saved note.
  RAISE WARNING 'Note notification enqueue failed';
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_partner_note() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER enqueue_partner_note AFTER INSERT ON public.daily_notes FOR EACH ROW EXECUTE FUNCTION public.enqueue_partner_note();

-- Service-only claim. Never expose another user's subscription credentials through an RPC.
CREATE OR REPLACE FUNCTION public.claim_note_notification(p_event_id uuid) RETURNS text
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE destination text;
BEGIN
  UPDATE public.notification_events e SET sent_at = now()
  WHERE e.id = p_event_id AND e.type = 'partner_daily_notes' AND e.sent_at IS NULL AND e.status = 'sent'
    AND EXISTS (SELECT 1 FROM public.partner_relationships r JOIN public.partner_sharing_preferences p ON p.relationship_id = r.id
      WHERE r.id::text = e.metadata->>'relationshipId' AND r.status = 'active' AND p.daily_notes
      AND e.user_id IN (r.owner_user_id, r.supporter_user_id))
    AND COALESCE((SELECT partner_daily_notes FROM public.notification_preferences WHERE user_id = e.user_id), true)
  RETURNING e.url INTO destination;
  RETURN destination;
END $$;
REVOKE ALL ON FUNCTION public.claim_note_notification(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_note_notification(uuid) TO service_role;

-- Recipients may mark events as read, but cannot reset claims or forge note events.
CREATE POLICY "Note events originate in the database" ON public.notification_events AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (type <> 'partner_daily_notes');
CREATE OR REPLACE FUNCTION public.protect_note_event() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.type = 'partner_daily_notes' AND current_user IN ('authenticated','anon') AND
    (NEW.id IS DISTINCT FROM OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.type IS DISTINCT FROM OLD.type
      OR NEW.title IS DISTINCT FROM OLD.title OR NEW.body IS DISTINCT FROM OLD.body OR NEW.url IS DISTINCT FROM OLD.url
      OR NEW.metadata IS DISTINCT FROM OLD.metadata OR NEW.sent_at IS DISTINCT FROM OLD.sent_at
      OR NEW.status IS DISTINCT FROM OLD.status OR NEW.scheduled_for IS DISTINCT FROM OLD.scheduled_for) THEN
    RAISE EXCEPTION 'Note notification identity is immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.protect_note_event() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER protect_note_event BEFORE UPDATE ON public.notification_events FOR EACH ROW EXECUTE FUNCTION public.protect_note_event();

-- Keyset pagination by complete date groups under existing SELECT RLS.
CREATE OR REPLACE FUNCTION public.get_notes_date_page(p_user_id uuid, p_author text,
  p_snapshot timestamptz, p_before date DEFAULT NULL, p_limit integer DEFAULT 9)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  WITH eligible AS (
    SELECT n.* FROM public.daily_notes n WHERE n.user_id = p_user_id AND n.created_at <= p_snapshot
      AND (p_before IS NULL OR n.date < p_before)
      AND (p_author = 'all' OR (p_author = 'own' AND COALESCE(n.author_id, n.user_id) = p_user_id)
        OR (p_author = 'partner' AND n.author_id <> p_user_id))
  ), dates AS (SELECT date FROM eligible GROUP BY date ORDER BY date DESC LIMIT LEAST(GREATEST(p_limit,1),9))
  -- A scalar JSON array avoids PostgREST's row cap splitting a large date group.
  SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.date DESC, e.created_at DESC, e.id DESC), '[]'::jsonb)
  FROM eligible e JOIN dates d USING(date);
$$;
REVOKE ALL ON FUNCTION public.get_notes_date_page(uuid,text,timestamptz,date,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_notes_date_page(uuid,text,timestamptz,date,integer) TO authenticated;
