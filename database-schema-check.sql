-- ================================================================
-- DATABASE SCHEMA ANALYSIS
-- Run this in your Supabase SQL Editor to understand the current setup
-- ================================================================

-- 1. Check if tables exist
SELECT 'TABLE EXISTS CHECK' as check_type;
SELECT table_name, table_type 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('community', 'conversations', 'messages')
ORDER BY table_name;

-- 2. Check community table structure
SELECT 'COMMUNITY TABLE STRUCTURE' as check_type;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'community'
ORDER BY ordinal_position;

-- 3. Check conversations table structure (if exists)
SELECT 'CONVERSATIONS TABLE STRUCTURE' as check_type;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'conversations'
ORDER BY ordinal_position;

-- 4. Check messages table structure (if exists)
SELECT 'MESSAGES TABLE STRUCTURE' as check_type;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'messages'
ORDER BY ordinal_position;

-- 5. Check foreign key constraints
SELECT 'FOREIGN KEY CONSTRAINTS' as check_type;
SELECT 
    tc.table_name,
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
    AND tc.table_name IN ('conversations', 'messages')
ORDER BY tc.table_name, tc.constraint_name;

-- 6. Check indexes
SELECT 'INDEXES' as check_type;
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
    AND tablename IN ('community', 'conversations', 'messages')
ORDER BY tablename, indexname;

-- 7. Check RLS policies
SELECT 'RLS POLICIES' as check_type;
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies
WHERE schemaname = 'public'
    AND tablename IN ('conversations', 'messages')
ORDER BY tablename, policyname;

-- 8. Sample data check
SELECT 'SAMPLE DATA CHECK' as check_type;
SELECT 'community' as table_name, COUNT(*) as row_count FROM community
UNION ALL
SELECT 'conversations' as table_name, COUNT(*) as row_count FROM conversations
UNION ALL  
SELECT 'messages' as table_name, COUNT(*) as row_count FROM messages;

-- 9. Check if conversations table has the expected columns
SELECT 'CONVERSATIONS COLUMN CHECK' as check_type;
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'participant_1_id') 
        THEN 'participant_1_id EXISTS' 
        ELSE 'participant_1_id MISSING' 
    END as participant_1_check,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'participant_2_id') 
        THEN 'participant_2_id EXISTS' 
        ELSE 'participant_2_id MISSING' 
    END as participant_2_check,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'participant1_id') 
        THEN 'participant1_id EXISTS (old naming)' 
        ELSE 'participant1_id NOT FOUND' 
    END as participant1_check,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'participant2_id') 
        THEN 'participant2_id EXISTS (old naming)' 
        ELSE 'participant2_id NOT FOUND' 
    END as participant2_check;

-- 10. Check messages sender_id reference
SELECT 'MESSAGES SENDER_ID CHECK' as check_type;
SELECT 
    tc.constraint_name,
    kcu.column_name,
    ccu.table_name AS references_table,
    ccu.column_name AS references_column
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_name = 'messages' 
    AND kcu.column_name = 'sender_id'
    AND tc.constraint_type = 'FOREIGN KEY';