-- Migration: Add has_mpin to profiles table for user-scoped MPIN configuration
-- Ensures database is the source of truth for whether an account has an MPIN configured.

-- 1. Add has_mpin column if not exists
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS has_mpin BOOLEAN NOT NULL DEFAULT false;

-- 2. Comment explaining purpose
COMMENT ON COLUMN public.profiles.has_mpin IS 'Indicates whether the user has configured a 6-digit MPIN for this account.';
