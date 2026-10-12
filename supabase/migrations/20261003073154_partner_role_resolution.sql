-- Migration: 20261003000001_partner_role_resolution.sql
-- Seijun Phase 19: Partner Role Resolution On Acceptance
-- Resolves the cycle owner (owner_user_id) vs supporter (supporter_user_id)
-- based on accounts' usage_roles when an invitation is accepted.
-- Ensures that if a supporter invites a cycle tracker, the relationship and
-- sharing preferences are assigned correctly with the cycle tracker as owner
-- and the supporter as supporter.

-- ==============================================================================
-- 1. ATOMIC ACCEPTANCE RPC (TOKEN-BASED)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.accept_partner_invitation(
  p_token_hash TEXT,
  p_accepting_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invitation RECORD;
  v_now TIMESTAMPTZ := now();
  v_existing_active UUID;
  v_inviter_role TEXT;
  v_acceptor_role TEXT;
  v_actual_owner_id UUID;
  v_actual_supporter_id UUID;
BEGIN
  -- 1. Fetch invitation with row-level lock for atomic update
  SELECT id, relationship_id, inviter_user_id, invitee_user_id, expires_at, status
  INTO v_invitation
  FROM public.partner_invitations
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invitation not found or invalid token.');
  END IF;

  -- 2. Validate invitation status
  IF v_invitation.status != 'pending' THEN
    IF v_invitation.status = 'accepted' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'This invitation has already been accepted and cannot be reused.');
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'This invitation is ' || v_invitation.status || ' and cannot be accepted.');
  END IF;

  -- 3. Validate expiration (7 days)
  IF v_invitation.expires_at <= v_now THEN
    UPDATE public.partner_invitations SET status = 'expired', updated_at = v_now WHERE id = v_invitation.id;
    UPDATE public.partner_relationships SET status = 'expired', updated_at = v_now WHERE id = v_invitation.relationship_id AND status = 'pending';
    RETURN jsonb_build_object('ok', false, 'error', 'This invitation has expired.');
  END IF;

  -- 4. Prevent self-acceptance
  IF v_invitation.inviter_user_id = p_accepting_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You cannot accept your own invitation.');
  END IF;

  -- 5. Recipient binding: if an intended invitee was specified, only they can accept
  IF v_invitation.invitee_user_id IS NOT NULL AND v_invitation.invitee_user_id != p_accepting_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This invitation was addressed to a different account.');
  END IF;

  -- 6. Enforce 1:1 rule: check if accepting user already has an active relationship
  SELECT id INTO v_existing_active
  FROM public.partner_relationships
  WHERE (owner_user_id = p_accepting_user_id OR supporter_user_id = p_accepting_user_id)
    AND status = 'active'
  LIMIT 1;

  IF v_existing_active IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You already have an active partner connection. 1:1 model allows only one active connection.');
  END IF;

  -- 7. Enforce 1:1 rule: check if inviter already has an active relationship
  SELECT id INTO v_existing_active
  FROM public.partner_relationships
  WHERE (owner_user_id = v_invitation.inviter_user_id OR supporter_user_id = v_invitation.inviter_user_id)
    AND status = 'active'
  LIMIT 1;

  IF v_existing_active IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'The invitation sender already has an active partner connection.');
  END IF;

  -- 8. Resolve cycle owner vs supporter based on usage roles
  SELECT usage_role INTO v_inviter_role FROM public.profiles WHERE user_id = v_invitation.inviter_user_id;
  SELECT usage_role INTO v_acceptor_role FROM public.profiles WHERE user_id = p_accepting_user_id;

  IF (v_inviter_role = 'supporter' AND (v_acceptor_role = 'cycle_tracker' OR v_acceptor_role = 'both' OR v_acceptor_role IS NULL)) THEN
    v_actual_owner_id := p_accepting_user_id;
    v_actual_supporter_id := v_invitation.inviter_user_id;
  ELSE
    v_actual_owner_id := v_invitation.inviter_user_id;
    v_actual_supporter_id := p_accepting_user_id;
  END IF;

  -- 9. Atomically update relationship and invitation in the same transaction
  UPDATE public.partner_relationships
  SET owner_user_id = v_actual_owner_id,
      supporter_user_id = v_actual_supporter_id,
      status = 'active',
      accepted_at = v_now,
      updated_at = v_now
  WHERE id = v_invitation.relationship_id
    AND status = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Associated relationship is no longer pending.');
  END IF;

  -- Update partner_sharing_preferences owner_user_id to match the cycle owner
  UPDATE public.partner_sharing_preferences
  SET owner_user_id = v_actual_owner_id,
      updated_at = v_now
  WHERE relationship_id = v_invitation.relationship_id;

  UPDATE public.partner_invitations
  SET status = 'accepted',
      accepted_at = v_now,
      updated_at = v_now
  WHERE id = v_invitation.id
    AND status = 'pending';

  RETURN jsonb_build_object(
    'ok', true,
    'relationship_id', v_invitation.relationship_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_partner_invitation(TEXT, UUID) TO authenticated;

-- ==============================================================================
-- 2. ATOMIC ACCEPTANCE RPC BY INVITATION ID
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.accept_partner_invitation_by_id(
  p_invitation_id UUID,
  p_accepting_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invitation RECORD;
  v_now TIMESTAMPTZ := now();
  v_existing_active UUID;
  v_inviter_role TEXT;
  v_acceptor_role TEXT;
  v_actual_owner_id UUID;
  v_actual_supporter_id UUID;
BEGIN
  -- 1. Fetch invitation with row-level lock for atomic update
  SELECT id, relationship_id, inviter_user_id, invitee_user_id, expires_at, status
  INTO v_invitation
  FROM public.partner_invitations
  WHERE id = p_invitation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invitation not found.');
  END IF;

  -- 2. Validate invitation status
  IF v_invitation.status != 'pending' THEN
    IF v_invitation.status = 'accepted' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'This invitation has already been accepted and cannot be reused.');
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'This invitation is ' || v_invitation.status || ' and cannot be accepted.');
  END IF;

  -- 3. Validate expiration (7 days)
  IF v_invitation.expires_at <= v_now THEN
    UPDATE public.partner_invitations SET status = 'expired', updated_at = v_now WHERE id = v_invitation.id;
    UPDATE public.partner_relationships SET status = 'expired', updated_at = v_now WHERE id = v_invitation.relationship_id AND status = 'pending';
    RETURN jsonb_build_object('ok', false, 'error', 'This invitation has expired.');
  END IF;

  -- 4. Prevent self-acceptance
  IF v_invitation.inviter_user_id = p_accepting_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You cannot accept your own invitation.');
  END IF;

  -- 5. Recipient binding: if an intended invitee was specified, only they can accept
  IF v_invitation.invitee_user_id IS NOT NULL AND v_invitation.invitee_user_id != p_accepting_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This invitation was addressed to a different account.');
  END IF;

  -- 6. Enforce 1:1 rule: check if accepting user already has an active relationship
  SELECT id INTO v_existing_active
  FROM public.partner_relationships
  WHERE (owner_user_id = p_accepting_user_id OR supporter_user_id = p_accepting_user_id)
    AND status = 'active'
  LIMIT 1;

  IF v_existing_active IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You already have an active partner connection. 1:1 model allows only one active connection.');
  END IF;

  -- 7. Enforce 1:1 rule: check if inviter already has an active relationship
  SELECT id INTO v_existing_active
  FROM public.partner_relationships
  WHERE (owner_user_id = v_invitation.inviter_user_id OR supporter_user_id = v_invitation.inviter_user_id)
    AND status = 'active'
  LIMIT 1;

  IF v_existing_active IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'The invitation sender already has an active partner connection.');
  END IF;

  -- 8. Resolve cycle owner vs supporter based on usage roles
  SELECT usage_role INTO v_inviter_role FROM public.profiles WHERE user_id = v_invitation.inviter_user_id;
  SELECT usage_role INTO v_acceptor_role FROM public.profiles WHERE user_id = p_accepting_user_id;

  IF (v_inviter_role = 'supporter' AND (v_acceptor_role = 'cycle_tracker' OR v_acceptor_role = 'both' OR v_acceptor_role IS NULL)) THEN
    v_actual_owner_id := p_accepting_user_id;
    v_actual_supporter_id := v_invitation.inviter_user_id;
  ELSE
    v_actual_owner_id := v_invitation.inviter_user_id;
    v_actual_supporter_id := p_accepting_user_id;
  END IF;

  -- 9. Atomically update relationship and invitation in the same transaction
  UPDATE public.partner_relationships
  SET owner_user_id = v_actual_owner_id,
      supporter_user_id = v_actual_supporter_id,
      status = 'active',
      accepted_at = v_now,
      updated_at = v_now
  WHERE id = v_invitation.relationship_id
    AND status = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Associated relationship is no longer pending.');
  END IF;

  -- Update partner_sharing_preferences owner_user_id to match the cycle owner
  UPDATE public.partner_sharing_preferences
  SET owner_user_id = v_actual_owner_id,
      updated_at = v_now
  WHERE relationship_id = v_invitation.relationship_id;

  UPDATE public.partner_invitations
  SET status = 'accepted',
      accepted_at = v_now,
      updated_at = v_now
  WHERE id = v_invitation.id
    AND status = 'pending';

  RETURN jsonb_build_object(
    'ok', true,
    'relationship_id', v_invitation.relationship_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_partner_invitation_by_id(UUID, UUID) TO authenticated;

-- ==============================================================================
-- 3. RECONCILE ANY EXISTING INVERTED RELATIONSHIPS
-- ==============================================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT rel.id, rel.owner_user_id, rel.supporter_user_id
    FROM public.partner_relationships rel
    JOIN public.profiles p_owner ON p_owner.user_id = rel.owner_user_id
    JOIN public.profiles p_supp ON p_supp.user_id = rel.supporter_user_id
    WHERE rel.status = 'active'
      AND p_owner.usage_role = 'supporter'
      AND p_supp.usage_role IN ('cycle_tracker', 'both')
  LOOP
    UPDATE public.partner_relationships
    SET owner_user_id = r.supporter_user_id,
        supporter_user_id = r.owner_user_id,
        updated_at = now()
    WHERE id = r.id;

    UPDATE public.partner_sharing_preferences
    SET owner_user_id = r.supporter_user_id,
        updated_at = now()
    WHERE relationship_id = r.id;
  END LOOP;
END $$;
