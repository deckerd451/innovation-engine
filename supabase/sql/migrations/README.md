# Database Migration Files

This directory contains all SQL migration files for the CharlestonHacks platform.

## Migration Order

Run these files **in order** in your Supabase SQL Editor:

### Step-by-Step Migration

1. **STEP_1_test_user_id.sql** - Verifies user_id column exists in community table
2. **STEP_2_create_messaging_tables.sql** - Creates conversations and messages tables
3. **STEP_3_add_engagement_columns.sql** - Adds endorsement tracking columns
4. **STEP_4_create_activity_log.sql** - Adds indexes to existing activity_log table
5. **STEP_5_create_achievements.sql** - Creates achievements and user_achievements tables
6. **STEP_6_create_leaderboards.sql** - Creates XP, streak, and connection leaderboard views
7. **STEP_7_fix_conversations.sql** - Fixes participant IDs in existing conversations
8. **STEP_8_create_rls_policies.sql** - Creates Row-Level Security policies for all tables

### Helper Functions (Run After Steps 1-8)

9. **HELPERS_functions_and_triggers.sql** - Creates helper functions and triggers:
   - `get_or_create_conversation()` - Find or create conversation between users
   - `get_unread_count()` - Get unread message count for current user
   - `award_xp()` - Award XP and update user level
   - Auto-update conversation timestamps when messages sent
   - Auto-award XP for endorsements

### Fixes (Run Only If Needed)

- **FIX_conversations_add_missing_columns.sql** - Adds missing columns if conversations table already existed

## Important Notes

### Schema Differences

The migration accounts for existing schema differences:

- **activity_log table** uses `auth_user_id` and `community_user_id` (not `user_id` and `community_id`)
- All RLS policies and functions have been adjusted accordingly

### ID Schema

Two different ID types are used:

- **auth.users(id)** - Supabase authentication user ID (used for messages.sender_id)
- **community.id** - Application profile ID (used for conversations.participant_*_id)
- **community.user_id** - Foreign key linking community to auth.users

### Testing After Migration

1. **Messaging**: Send a message to verify conversations and messages work
2. **Engagement**: Check that XP displays show in dashboard header
3. **Achievements**: Verify achievement badges are tracked
4. **Leaderboards**: Confirm leaderboard views return data

## Troubleshooting

### Error: "column user_id does not exist"

This means you're using the wrong column name for activity_log. The table uses `auth_user_id` instead of `user_id`.

### Error: "column updated_at does not exist"

Run `FIX_conversations_add_missing_columns.sql` to add missing columns to existing conversations table.

### Error: 406 on conversations query

This usually means duplicate conversations exist. Step 7 should clean these up.

## Rollback

If you need to rollback:

```sql
-- Drop tables in reverse order
DROP TABLE IF EXISTS public.user_achievements CASCADE;
DROP TABLE IF EXISTS public.achievements CASCADE;
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.conversations CASCADE;

-- Drop views
DROP VIEW IF EXISTS public.xp_leaderboard;
DROP VIEW IF EXISTS public.streak_leaderboard;
DROP VIEW IF EXISTS public.connection_leaderboard;

-- Drop functions
DROP FUNCTION IF EXISTS public.get_or_create_conversation;
DROP FUNCTION IF EXISTS public.get_unread_count;
DROP FUNCTION IF EXISTS public.award_xp;
DROP FUNCTION IF EXISTS public.update_conversation_last_message;
DROP FUNCTION IF EXISTS public.award_xp_for_endorsement;
```
