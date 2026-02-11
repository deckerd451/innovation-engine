# Profile Linking Fix - Deployment Checklist

## Pre-Deployment

### 1. Database Verification
- [ ] Verify `community.user_id` has UNIQUE constraint
- [ ] Check for existing orphaned profiles (user_id = NULL)
  ```sql
  SELECT COUNT(*) FROM community WHERE user_id IS NULL;
  ```
- [ ] Check for duplicate emails
  ```sql
  SELECT email, COUNT(*) 
  FROM community 
  GROUP BY email 
  HAVING COUNT(*) > 1;
  ```
- [ ] Ensure `is_hidden` column exists
  ```sql
  -- If not exists, add it:
  ALTER TABLE community ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT false;
  ```

### 2. Backup
- [ ] Backup `community` table before deployment
  ```sql
  -- Create backup table
  CREATE TABLE community_backup_20260204 AS SELECT * FROM community;
  ```

### 3. Code Review
- [ ] Review `auth.js` changes (fetchUserProfile, loadUserProfileOnce)
- [ ] Review `dashboard.js` changes (onboarding enforcement)
- [ ] Verify no syntax errors: `getDiagnostics(['auth.js', 'dashboard.js'])`
- [ ] Test locally if possible

## Deployment Steps

### 1. Deploy Files
```bash
# Commit changes
git add auth.js dashboard.js PROFILE_LINKING_FIX.md
git commit -m "Fix: Implement profile linking for OAuth migration support"

# Push to production
git push origin main
```

### 2. Clear Cache (if using CDN)
- [ ] Clear browser cache for test users
- [ ] Clear CDN cache if applicable
- [ ] Force refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)

### 3. Monitor Initial Sign-ins
- [ ] Watch browser console for `[PROFILE-LINK]` logs
- [ ] Verify no JavaScript errors
- [ ] Check network tab for database queries

## Post-Deployment Testing

### Test Scenario 1: Migrated User (user_id = NULL)
**Setup:**
- Find a test user with `user_id = NULL` in database
- Note their email address

**Test:**
1. [ ] User signs in via OAuth (GitHub or Google)
2. [ ] Check console for `[PROFILE-LINK] linked-by-email` log
3. [ ] Verify notification: "Your existing profile has been linked"
4. [ ] Check database: `user_id` should now be set
5. [ ] Verify no duplicate profile created

**Expected Database State:**
```sql
-- Before
user_id: NULL
email: test@example.com

-- After
user_id: <auth_uid>
email: test@example.com
updated_at: <current_timestamp>
```

### Test Scenario 2: New User
**Setup:**
- Use an email that doesn't exist in database

**Test:**
1. [ ] User signs in via OAuth
2. [ ] Check console for `[PROFILE-LINK] created-new` log
3. [ ] Check console for `[PROFILE-LINK] onboarding-forced` log
4. [ ] Verify new profile created with correct fields
5. [ ] Verify `_needsOnboarding` flag is set

**Expected Database State:**
```sql
user_id: <auth_uid>
email: newuser@example.com
onboarding_completed: false
profile_completed: false
created_at: <current_timestamp>
updated_at: <current_timestamp>
```

### Test Scenario 3: Duplicate Profiles
**Setup:**
- Find or create test user with duplicate profiles (same email)

**Test:**
1. [ ] User signs in via OAuth
2. [ ] Check console for `[PROFILE-LINK] duplicate-email-detected` log
3. [ ] Verify canonical profile selected (completed or oldest)
4. [ ] Check database: non-canonical profiles marked `is_hidden = true`
5. [ ] Verify notification: "We've consolidated your duplicate profiles"

**Expected Database State:**
```sql
-- Canonical profile
user_id: <auth_uid>
email: duplicate@example.com
is_hidden: false

-- Non-canonical profiles
user_id: NULL
email: duplicate@example.com
is_hidden: true
```

### Test Scenario 4: Existing Linked Profile
**Setup:**
- User already has profile with `user_id` set

**Test:**
1. [ ] User signs in via OAuth
2. [ ] Check console for `[PROFILE-LINK] found-by-uid` log
3. [ ] Verify profile loads normally
4. [ ] No linking or creation should occur

## Monitoring

### Key Logs to Watch
```javascript
// Success cases
✅ [PROFILE-LINK] found-by-uid
✅ [PROFILE-LINK] linked-by-email
✅ [PROFILE-LINK] created-new

// Warning cases
⚠️ [PROFILE-LINK] duplicate-email-detected
⚠️ [PROFILE-LINK] duplicate-email-collision
⚠️ [PROFILE-LINK] onboarding-forced

// Action cases
🔄 [PROFILE-LINK] rehomed-uid
```

### Database Queries for Monitoring

**Check orphaned profiles (should decrease over time):**
```sql
SELECT COUNT(*) as orphaned_count
FROM community 
WHERE user_id IS NULL;
```

**Check hidden profiles (duplicates):**
```sql
SELECT COUNT(*) as hidden_count
FROM community 
WHERE is_hidden = true;
```

**Check profiles needing onboarding:**
```sql
SELECT COUNT(*) as needs_onboarding
FROM community 
WHERE onboarding_completed = false 
   OR profile_completed = false
   OR display_name IS NULL
   OR username IS NULL;
```

**Check for email collisions:**
```sql
SELECT email, COUNT(*) as profile_count
FROM community
WHERE user_id IS NOT NULL
GROUP BY email
HAVING COUNT(*) > 1;
```

## Rollback Plan

If issues occur, rollback steps:

### 1. Revert Code
```bash
git revert HEAD
git push origin main
```

### 2. Restore Database (if needed)
```sql
-- Only if data corruption occurred
-- Restore from backup
DELETE FROM community;
INSERT INTO community SELECT * FROM community_backup_20260204;
```

### 3. Clear User Sessions
```sql
-- Force users to re-authenticate
-- (Supabase handles this automatically on code changes)
```

## Success Criteria

- [ ] All 62 orphaned profiles linked when users sign in
- [ ] No new duplicate profiles created
- [ ] All users see appropriate onboarding when needed
- [ ] No JavaScript errors in console
- [ ] No database errors in logs
- [ ] User notifications working correctly

## Known Issues & Workarounds

### Issue 1: Email Case Sensitivity
**Problem:** Some databases treat email case-sensitively
**Solution:** Using `ilike` for case-insensitive matching

### Issue 2: Multiple OAuth Providers
**Problem:** User might sign in with different providers (GitHub vs Google)
**Solution:** Email is the canonical identifier, links to same profile

### Issue 3: Email Changes
**Problem:** User changes email in OAuth provider
**Solution:** Profile stays linked via `user_id`, email updated on next sign-in

## Support & Troubleshooting

### User Reports Duplicate Profile
1. Check database for profiles with their email
2. Verify which profile has `user_id` set
3. Manually hide duplicates if needed:
   ```sql
   UPDATE community 
   SET is_hidden = true 
   WHERE email = 'user@example.com' 
     AND id != '<canonical_profile_id>';
   ```

### User Can't Sign In
1. Check browser console for errors
2. Verify Supabase auth is working
3. Check if profile linking is failing
4. Review `[PROFILE-LINK]` logs

### Profile Not Loading
1. Check if `user_id` is set correctly
2. Verify no database constraint violations
3. Check for timeout errors (15s limit)
4. Review network tab for failed queries

## Next Steps After Deployment

1. **Week 1:** Monitor logs and user reports
2. **Week 2:** Analyze orphaned profile reduction
3. **Week 3:** Implement onboarding UI (if not done)
4. **Week 4:** Clean up hidden duplicate profiles
5. **Month 2:** Add admin dashboard for collision management

## Contact

For issues or questions:
- Check `PROFILE_LINKING_FIX.md` for technical details
- Review console logs with `[PROFILE-LINK]` prefix
- Run `testProfileLinking()` in browser console for diagnostics
