-- ============================================================================
-- MANUAL SUPABASE SCRIPT
-- ============================================================================
-- Applied via Supabase Dashboard or CLI
-- Not executed by application code
-- ============================================================================


-- Fix for conversations table missing columns
-- Run this if you get "column updated_at does not exist" error

-- Add missing columns to conversations table
ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS context_type TEXT,
ADD COLUMN IF NOT EXISTS context_id UUID,
ADD COLUMN IF NOT EXISTS context_title TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Set updated_at for existing rows
UPDATE public.conversations
SET updated_at = created_at
WHERE updated_at IS NULL;
