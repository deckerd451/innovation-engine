# Onboarding "Next" Button Fix

## Problem
The "Next: Choose Interests" button in the onboarding flow was clicking but not advancing to the next step.

## Root Cause
The JavaScript was calling two Supabase RPC functions that didn't exist in the database:
- `update_onboarding_step(auth_user_id, step_number)`
- `complete_onboarding(auth_user_id)`

## Solution

### Step 1: Run SQL Migration
Run the file `RUN_THIS_TO_FIX_ONBOARDING.sql` in Supabase SQL Editor:

**URL:** https://supabase.com/dashboard/project/hvmotpzhliufzomewzfl/sql/new

This will:
1. Add missing columns to the `community` table (if they don't exist)
2. Create the `update_onboarding_step()` function
3. Create the `complete_onboarding()` function
4. Grant proper permissions
5. Verify the setup

### Step 2: Test the Fix
1. Hard refresh the dashboard (Cmd+Shift+R)
2. Click the bell icon (notification button)
3. Click "Next: Choose Interests"
4. The onboarding should now advance to step 2

### Step 3: Check Console for Debugging
The JavaScript now has enhanced error logging. If there are still issues, check the browser console for:
- `🔄 Moving to next onboarding step from X to Y`
- `📝 Calling update_onboarding_step with: {...}`
- `✅ Onboarding step updated in database`
- `🎨 Re-rendering START UI with step: X`

If you see errors, they will be clearly marked with `❌` and include detailed error information.

## What Changed

### Database (RUN_THIS_TO_FIX_ONBOARDING.sql)
- Added `onboarding_completed`, `onboarding_step`, `onboarding_started_at`, `onboarding_completed_at` columns
- Created `update_onboarding_step()` function to save progress
- Created `complete_onboarding()` function to mark completion
- Granted execute permissions to authenticated users

### JavaScript (assets/js/start-onboarding.js)
- Enhanced error handling in `nextStep()` function
- Added detailed console logging for debugging
- Added error toast notifications for users
- Added cache clearing before re-rendering
- Prevents advancing if database update fails

## Files Modified
- ✅ `RUN_THIS_TO_FIX_ONBOARDING.sql` (created)
- ✅ `assets/js/start-onboarding.js` (enhanced error handling)
- ✅ `ONBOARDING_NEXT_BUTTON_FIX.md` (this file)

## Testing Checklist
- [ ] Run SQL migration in Supabase
- [ ] Verify 4 columns exist in verification query
- [ ] Hard refresh dashboard (Cmd+Shift+R)
- [ ] Click bell icon to open START sequence
- [ ] Click "Next: Choose Interests" button
- [ ] Verify step advances to "Choose Your Interests"
- [ ] Click "Next: Connect with People"
- [ ] Verify step advances to "Build Your Network"
- [ ] Click "Next: Explore Projects"
- [ ] Verify step advances to "Discover Projects"
- [ ] Click "Complete Setup"
- [ ] Verify onboarding completes and modal closes

## Notes
- The onboarding state is now persisted in the database
- Users can close the modal and resume where they left off
- The `onboarding_step` field tracks progress (0-4)
- The `onboarding_completed` field marks completion
- All changes are backwards compatible with existing profiles
