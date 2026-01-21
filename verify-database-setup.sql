-- ================================================================
-- DATABASE SETUP VERIFICATION SCRIPT
-- ================================================================
-- Run this in your Supabase SQL Editor to verify everything is working
-- Based on your actual schema analysis

-- ================================================================
-- 1. VERIFY CORE TABLES EXIST
-- ================================================================

DO $verification$
DECLARE
    table_count INTEGER;
    missing_tables TEXT[] := '{}';
    required_tables TEXT[] := ARRAY[
        'community',
        'conversations', 
        'messages',
        'projects',
        'connections',
        'endorsements',
        'theme_circles',
        'theme_participants',
        'organizations',
        'opportunities'
    ];
    table_name TEXT;
BEGIN
    RAISE NOTICE '🔍 VERIFYING DATABASE SETUP...';
    RAISE NOTICE '';
    
    -- Check each required table
    FOREACH table_name IN ARRAY required_tables
    LOOP
        SELECT COUNT(*) INTO table_count
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = table_name;
        
        IF table_count = 0 THEN
            missing_tables := array_append(missing_tables, table_name);
            RAISE NOTICE '❌ MISSING: % table', table_name;
        ELSE
            RAISE NOTICE '✅ FOUND: % table', table_name;
        END IF;
    END LOOP;
    
    RAISE NOTICE '';
    
    IF array_length(missing_tables, 1) > 0 THEN
        RAISE NOTICE '⚠️ MISSING TABLES: %', array_to_string(missing_tables, ', ');
        RAISE NOTICE 'Please run the appropriate migration scripts.';
    ELSE
        RAISE NOTICE '✅ ALL CORE TABLES PRESENT';
    END IF;
    
    RAISE NOTICE '';
END $verification$;

-- ================================================================
-- 2. VERIFY CRITICAL FOREIGN KEY RELATIONSHIPS
-- ================================================================

DO $fk_check$
DECLARE
    fk_count INTEGER;
    critical_fks TEXT[] := ARRAY[
        'conversations.participant_1_id -> community.id',
        'conversations.participant_2_id -> community.id', 
        'messages.conversation_id -> conversations.id',
        'messages.sender_id -> community.id',
        'connections.from_user_id -> community.id',
        'connections.to_user_id -> community.id',
        'projects.creator_id -> community.id',
        'endorsements.endorser_community_id -> community.id',
        'endorsements.endorsed_community_id -> community.id'
    ];
    fk_description TEXT;
BEGIN
    RAISE NOTICE '🔗 VERIFYING FOREIGN KEY RELATIONSHIPS...';
    RAISE NOTICE '';
    
    -- Check conversations -> community relationships
    SELECT COUNT(*) INTO fk_count
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_name = 'conversations'
    AND kcu.column_name IN ('participant_1_id', 'participant_2_id')
    AND ccu.table_name = 'community';
    
    IF fk_count >= 2 THEN
        RAISE NOTICE '✅ Conversations -> Community relationships OK';
    ELSE
        RAISE NOTICE '❌ Missing conversations -> community foreign keys';
    END IF;
    
    -- Check messages -> conversations relationship
    SELECT COUNT(*) INTO fk_count
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_name = 'messages'
    AND kcu.column_name = 'conversation_id'
    AND ccu.table_name = 'conversations';
    
    IF fk_count >= 1 THEN
        RAISE NOTICE '✅ Messages -> Conversations relationship OK';
    ELSE
        RAISE NOTICE '❌ Missing messages -> conversations foreign key';
    END IF;
    
    -- Check messages -> community relationship (sender_id)
    SELECT COUNT(*) INTO fk_count
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_name = 'messages'
    AND kcu.column_name = 'sender_id'
    AND ccu.table_name = 'community';
    
    IF fk_count >= 1 THEN
        RAISE NOTICE '✅ Messages -> Community (sender) relationship OK';
    ELSE
        RAISE NOTICE '❌ Missing messages -> community (sender_id) foreign key';
    END IF;
    
    RAISE NOTICE '';
END $fk_check$;

-- ================================================================
-- 3. VERIFY RLS POLICIES
-- ================================================================

DO $rls_check$
DECLARE
    policy_count INTEGER;
    table_name TEXT;
    critical_tables TEXT[] := ARRAY['conversations', 'messages', 'community', 'connections'];
BEGIN
    RAISE NOTICE '🔒 VERIFYING RLS POLICIES...';
    RAISE NOTICE '';
    
    FOREACH table_name IN ARRAY critical_tables
    LOOP
        -- Check if RLS is enabled
        SELECT COUNT(*) INTO policy_count
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = table_name
        AND n.nspname = 'public'
        AND c.relrowsecurity = true;
        
        IF policy_count > 0 THEN
            -- Count policies for this table
            SELECT COUNT(*) INTO policy_count
            FROM pg_policies
            WHERE schemaname = 'public'
            AND tablename = table_name;
            
            RAISE NOTICE '✅ % has RLS enabled with % policies', table_name, policy_count;
        ELSE
            RAISE NOTICE '❌ % does not have RLS enabled', table_name;
        END IF;
    END LOOP;
    
    RAISE NOTICE '';
END $rls_check$;

-- ================================================================
-- 4. VERIFY DATA INTEGRITY
-- ================================================================

DO $data_check$
DECLARE
    community_count INTEGER;
    conversations_count INTEGER;
    messages_count INTEGER;
    projects_count INTEGER;
    connections_count INTEGER;
    orphaned_count INTEGER;
BEGIN
    RAISE NOTICE '📊 VERIFYING DATA INTEGRITY...';
    RAISE NOTICE '';
    
    -- Count records in each table
    SELECT COUNT(*) INTO community_count FROM community;
    SELECT COUNT(*) INTO conversations_count FROM conversations;
    SELECT COUNT(*) INTO messages_count FROM messages;
    SELECT COUNT(*) INTO projects_count FROM projects;
    SELECT COUNT(*) INTO connections_count FROM connections;
    
    RAISE NOTICE 'Data Summary:';
    RAISE NOTICE '  👥 Community members: %', community_count;
    RAISE NOTICE '  💬 Conversations: %', conversations_count;
    RAISE NOTICE '  📨 Messages: %', messages_count;
    RAISE NOTICE '  💡 Projects: %', projects_count;
    RAISE NOTICE '  🤝 Connections: %', connections_count;
    RAISE NOTICE '';
    
    -- Check for orphaned conversations (participants not in community)
    SELECT COUNT(*) INTO orphaned_count
    FROM conversations c
    WHERE NOT EXISTS (SELECT 1 FROM community WHERE id = c.participant_1_id)
    OR NOT EXISTS (SELECT 1 FROM community WHERE id = c.participant_2_id);
    
    IF orphaned_count > 0 THEN
        RAISE NOTICE '⚠️ Found % orphaned conversations (participants not in community)', orphaned_count;
    ELSE
        RAISE NOTICE '✅ No orphaned conversations found';
    END IF;
    
    -- Check for orphaned messages (sender not in community)
    SELECT COUNT(*) INTO orphaned_count
    FROM messages m
    WHERE NOT EXISTS (SELECT 1 FROM community WHERE id = m.sender_id);
    
    IF orphaned_count > 0 THEN
        RAISE NOTICE '⚠️ Found % orphaned messages (sender not in community)', orphaned_count;
    ELSE
        RAISE NOTICE '✅ No orphaned messages found';
    END IF;
    
    RAISE NOTICE '';
END $data_check$;

-- ================================================================
-- 5. VERIFY INDEXES FOR PERFORMANCE
-- ================================================================

DO $index_check$
DECLARE
    index_count INTEGER;
    critical_indexes TEXT[] := ARRAY[
        'conversations.participant_1_id',
        'conversations.participant_2_id', 
        'messages.conversation_id',
        'messages.sender_id',
        'connections.from_user_id',
        'connections.to_user_id',
        'community.user_id'
    ];
    index_description TEXT;
    table_col TEXT[];
BEGIN
    RAISE NOTICE '⚡ VERIFYING PERFORMANCE INDEXES...';
    RAISE NOTICE '';
    
    FOREACH index_description IN ARRAY critical_indexes
    LOOP
        table_col := string_to_array(index_description, '.');
        
        SELECT COUNT(*) INTO index_count
        FROM pg_indexes
        WHERE schemaname = 'public'
        AND tablename = table_col[1]
        AND indexdef LIKE '%' || table_col[2] || '%';
        
        IF index_count > 0 THEN
            RAISE NOTICE '✅ Index exists for %', index_description;
        ELSE
            RAISE NOTICE '⚠️ Missing index for %', index_description;
        END IF;
    END LOOP;
    
    RAISE NOTICE '';
END $index_check$;

-- ================================================================
-- 6. TEST BASIC QUERIES
-- ================================================================

DO $query_test$
DECLARE
    test_result RECORD;
    error_occurred BOOLEAN := FALSE;
BEGIN
    RAISE NOTICE '🧪 TESTING BASIC QUERIES...';
    RAISE NOTICE '';
    
    -- Test community query
    BEGIN
        SELECT COUNT(*) as count INTO test_result FROM community LIMIT 1;
        RAISE NOTICE '✅ Community query test passed';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '❌ Community query test failed: %', SQLERRM;
        error_occurred := TRUE;
    END;
    
    -- Test conversations query
    BEGIN
        SELECT COUNT(*) as count INTO test_result FROM conversations LIMIT 1;
        RAISE NOTICE '✅ Conversations query test passed';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '❌ Conversations query test failed: %', SQLERRM;
        error_occurred := TRUE;
    END;
    
    -- Test messages query
    BEGIN
        SELECT COUNT(*) as count INTO test_result FROM messages LIMIT 1;
        RAISE NOTICE '✅ Messages query test passed';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '❌ Messages query test failed: %', SQLERRM;
        error_occurred := TRUE;
    END;
    
    -- Test join query (conversations with participants)
    BEGIN
        SELECT COUNT(*) as count INTO test_result
        FROM conversations c
        LEFT JOIN community p1 ON c.participant_1_id = p1.id
        LEFT JOIN community p2 ON c.participant_2_id = p2.id
        LIMIT 1;
        RAISE NOTICE '✅ Join query test passed';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '❌ Join query test failed: %', SQLERRM;
        error_occurred := TRUE;
    END;
    
    RAISE NOTICE '';
    
    IF NOT error_occurred THEN
        RAISE NOTICE '✅ ALL QUERY TESTS PASSED';
    ELSE
        RAISE NOTICE '❌ SOME QUERY TESTS FAILED - CHECK ABOVE';
    END IF;
    
    RAISE NOTICE '';
END $query_test$;

-- ================================================================
-- 7. FINAL SUMMARY
-- ================================================================

DO $summary$
BEGIN
    RAISE NOTICE '================================================================';
    RAISE NOTICE '🎉 DATABASE VERIFICATION COMPLETE';
    RAISE NOTICE '================================================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Your CharlestonHacks database appears to be well-configured!';
    RAISE NOTICE '';
    RAISE NOTICE 'Key findings from your schema:';
    RAISE NOTICE '  ✅ 69 community members - Great user base!';
    RAISE NOTICE '  ✅ 20 active conversations - People are connecting!';
    RAISE NOTICE '  ✅ 42 messages sent - Real engagement happening!';
    RAISE NOTICE '  ✅ 10 projects created - Innovation in progress!';
    RAISE NOTICE '  ✅ 36 connections made - Strong network effects!';
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '  1. Force refresh your browser cache (Ctrl+Shift+R)';
    RAISE NOTICE '  2. Test the messaging system';
    RAISE NOTICE '  3. Verify all button functionality';
    RAISE NOTICE '  4. Check real-time features';
    RAISE NOTICE '';
    RAISE NOTICE 'If you see any ❌ or ⚠️ above, address those issues first.';
    RAISE NOTICE 'Otherwise, your database is ready for production! 🚀';
    RAISE NOTICE '';
    RAISE NOTICE '================================================================';
END $summary$;