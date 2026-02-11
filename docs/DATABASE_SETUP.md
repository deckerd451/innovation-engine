# Database Setup Guide

This guide walks you through setting up the complete database schema for CharlestonHacks Innovation Engine.

---

## Prerequisites

- Supabase project created
- Access to Supabase SQL Editor
- Basic understanding of PostgreSQL

---

## Migration Order

**CRITICAL:** Run migrations in this exact order. Each migration depends on previous ones.

### Step 1: Verify Base Tables

First, ensure your `community` table exists with the correct structure:

```sql
-- Check if community table exists
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'community';
```

If it doesn't exist, create it:

```sql
CREATE TABLE IF NOT EXISTS community (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE REFERENCES auth.users(id),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  bio TEXT,
  skills TEXT,
  interests TEXT[],
  availability TEXT,
  image_url TEXT,
  profile_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE community ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Public profiles are viewable by everyone"
  ON community FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON community FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile"
  ON community FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

---

## Core Migrations

### Migration 1: Test User ID Column

**File:** `migrations/STEP_1_test_user_id.sql`

Verifies that the `user_id` column exists in the community table.

```bash
# Run in Supabase SQL Editor
```

**Expected Output:** Confirmation that user_id column exists

---

### Migration 2: Create Messaging Tables

**File:** `migrations/STEP_2_create_messaging_tables.sql`

Creates:
- `conversations` table
- `messages` table
- Indexes for performance

**Tables Created:**
```sql
conversations (
  id UUID PRIMARY KEY,
  participant_1_id UUID REFERENCES community(id),
  participant_2_id UUID REFERENCES community(id),
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

messages (
  id UUID PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id),
  sender_id UUID REFERENCES auth.users(id),
  content TEXT,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ
)
```

---

### Migration 3: Add Engagement Columns

**File:** `migrations/STEP_3_add_engagement_columns.sql`

Adds endorsement tracking to community table:
- `endorsement_count` INTEGER
- `last_endorsement_at` TIMESTAMPTZ

---

### Migration 4: Create Activity Log

**File:** `migrations/STEP_4_create_activity_log.sql`

Creates activity tracking system:

```sql
activity_log (
  id UUID PRIMARY KEY,
  community_id UUID REFERENCES community(id),
  action_type TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ
)
```

**Indexes:**
- `idx_activity_log_community` on community_id
- `idx_activity_log_created` on created_at

---

### Migration 5: Create Achievements

**File:** `migrations/STEP_5_create_achievements.sql`

Creates achievement system:

```sql
achievements (
  id UUID PRIMARY KEY,
  name TEXT UNIQUE,
  description TEXT,
  icon TEXT,
  criteria JSONB
)

user_achievements (
  id UUID PRIMARY KEY,
  community_id UUID REFERENCES community(id),
  achievement_id UUID REFERENCES achievements(id),
  earned_at TIMESTAMPTZ
)
```

---

### Migration 6: Create Leaderboards

**File:** `migrations/STEP_6_create_leaderboards.sql`

Creates leaderboard views:
- `xp_leaderboard` - XP rankings
- `streak_leaderboard` - Streak rankings
- `connection_leaderboard` - Connection rankings

---

### Migration 7: Fix Conversations

**File:** `migrations/STEP_7_fix_conversations.sql`

Fixes participant ID references and adds missing columns.

---

### Migration 8: Create RLS Policies

**File:** `migrations/STEP_8_create_rls_policies.sql`

Applies Row Level Security policies to all tables:
- Users can read their own data
- Users can update their own data
- Public data is viewable by authenticated users

---

### Migration 9: Helper Functions

**File:** `migrations/HELPERS_functions_and_triggers.sql`

Creates utility functions and triggers:
- Auto-update timestamps
- Activity logging triggers
- Engagement calculation functions

---

## Theme Circles Feature

### Migration 10: Theme Circles Schema

**File:** `THEME_CIRCLES_SCHEMA.sql`

Creates the Theme Circles feature:

```sql
theme_circles (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  status TEXT,
  created_by UUID REFERENCES community(id),
  origin_type TEXT,
  activity_score INTEGER,
  last_activity_at TIMESTAMPTZ
)

theme_participants (
  id UUID PRIMARY KEY,
  theme_id UUID REFERENCES theme_circles(id),
  community_id UUID REFERENCES community(id),
  engagement_level TEXT,
  signals TEXT[],
  joined_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ
)

theme_actions (
  id UUID PRIMARY KEY,
  theme_id UUID REFERENCES theme_circles(id),
  created_by UUID REFERENCES community(id),
  action_type TEXT,
  title TEXT,
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ
)
```

**Functions:**
- `decay_theme_circles()` - Auto-expire old themes
- `update_theme_activity()` - Track engagement

**Views:**
- `active_themes_summary` - Active themes with participant counts

---

### Migration 11: Demo Themes (Optional)

**File:** `DEMO_THEMES.sql`

Creates 8 sample theme circles for testing:
1. AI in Healthcare
2. Sustainable Technology
3. Web3 & Decentralization
4. Game Development & Unity
5. Data Science & Visualization
6. Startup Ideas Workshop
7. Cybersecurity & Ethical Hacking
8. UI/UX Design Collaboration

**Run this only in development/testing environments.**

---

## Additional Tables

### Projects Table

If not already created:

```sql
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'planning',
  creator_id UUID REFERENCES community(id),
  required_skills TEXT[],
  tags TEXT[],
  upvote_count INTEGER DEFAULT 0,
  theme_id UUID REFERENCES theme_circles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Projects are viewable by everyone"
  ON projects FOR SELECT
  USING (true);

CREATE POLICY "Users can create projects"
  ON projects FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Creators can update their projects"
  ON projects FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM community
      WHERE community.user_id = auth.uid()
      AND community.id = projects.creator_id
    )
  );
```

---

### Connections Table

```sql
CREATE TABLE IF NOT EXISTS connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_user_id UUID REFERENCES community(id),
  to_user_id UUID REFERENCES community(id),
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(from_user_id, to_user_id)
);

-- Enable RLS
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their connections"
  ON connections FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM community
      WHERE community.user_id = auth.uid()
      AND (community.id = connections.from_user_id OR community.id = connections.to_user_id)
    )
  );

CREATE POLICY "Users can create connections"
  ON connections FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM community
      WHERE community.user_id = auth.uid()
      AND community.id = connections.from_user_id
    )
  );

CREATE POLICY "Users can update their connections"
  ON connections FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM community
      WHERE community.user_id = auth.uid()
      AND (community.id = connections.from_user_id OR community.id = connections.to_user_id)
    )
  );
```

---

### Endorsements Table

```sql
CREATE TABLE IF NOT EXISTS endorsements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  endorser_community_id UUID REFERENCES community(id),
  endorsed_community_id UUID REFERENCES community(id),
  skill TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(endorser_community_id, endorsed_community_id, skill)
);

-- Enable RLS
ALTER TABLE endorsements ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Endorsements are viewable by everyone"
  ON endorsements FOR SELECT
  USING (true);

CREATE POLICY "Users can endorse others"
  ON endorsements FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM community
      WHERE community.user_id = auth.uid()
      AND community.id = endorsements.endorser_community_id
    )
  );
```

---

## Performance Indexes

Add these indexes for better query performance:

```sql
-- Community table
CREATE INDEX IF NOT EXISTS idx_community_user_id ON community(user_id);
CREATE INDEX IF NOT EXISTS idx_community_email ON community(email);

-- Projects table
CREATE INDEX IF NOT EXISTS idx_projects_creator ON projects(creator_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_theme ON projects(theme_id);

-- Connections table
CREATE INDEX IF NOT EXISTS idx_connections_from ON connections(from_user_id);
CREATE INDEX IF NOT EXISTS idx_connections_to ON connections(to_user_id);
CREATE INDEX IF NOT EXISTS idx_connections_status ON connections(status);

-- Messages table
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_read ON messages(read, conversation_id);

-- Endorsements table
CREATE INDEX IF NOT EXISTS idx_endorsements_endorsed ON endorsements(endorsed_community_id);
CREATE INDEX IF NOT EXISTS idx_endorsements_endorser ON endorsements(endorser_community_id);
```

---

## Verification Queries

After running all migrations, verify your setup:

### Check All Tables

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

**Expected tables:**
- achievements
- activity_log
- community
- connections
- conversations
- endorsements
- messages
- projects
- theme_actions
- theme_circles
- theme_participants
- user_achievements

---

### Check RLS Policies

```sql
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

---

### Check Indexes

```sql
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
```

---

### Test Theme Circles

```sql
-- View active themes
SELECT * FROM active_themes_summary;

-- Count themes by status
SELECT status, COUNT(*) 
FROM theme_circles 
GROUP BY status;
```

---

## Scheduled Jobs (Optional)

Set up automatic theme decay using pg_cron:

```sql
-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule theme decay to run hourly
SELECT cron.schedule(
  'decay-themes',
  '0 * * * *',
  'SELECT decay_theme_circles()'
);

-- View scheduled jobs
SELECT * FROM cron.job;
```

---

## Backup and Restore

### Create Backup

```bash
# Using Supabase CLI
supabase db dump -f backup.sql

# Or download from Supabase dashboard
# Settings → Database → Backups
```

### Restore from Backup

```bash
# Using Supabase CLI
supabase db reset
psql -h your-project.supabase.co -U postgres -d postgres -f backup.sql
```

---

## Troubleshooting

### Issue: Migration fails with "relation does not exist"

**Solution:** Ensure previous migrations completed successfully. Check migration order.

### Issue: RLS policies blocking queries

**Solution:** Verify user is authenticated and policies match your use case.

```sql
-- Temporarily disable RLS for testing (NOT for production!)
ALTER TABLE table_name DISABLE ROW LEVEL SECURITY;
```

### Issue: Foreign key constraint violations

**Solution:** Ensure referenced records exist before inserting.

```sql
-- Check for orphaned records
SELECT * FROM table_name 
WHERE foreign_key_column NOT IN (SELECT id FROM referenced_table);
```

---

## Next Steps

After completing database setup:

1. ✅ Update `supabaseClient.js` with your credentials
2. ✅ Configure OAuth providers in Supabase dashboard
3. ✅ Test authentication flow
4. ✅ Create your first user profile
5. ✅ Run `DEMO_THEMES.sql` for testing

---

## Support

If you encounter issues:
- Check [Supabase Documentation](https://supabase.com/docs)
- Review migration files for detailed comments
- Open an issue on GitHub
- Contact: hello@charlestonhacks.co

---

**Last Updated:** January 14, 2026
