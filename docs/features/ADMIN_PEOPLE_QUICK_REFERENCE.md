# Admin People Management - Quick Reference

## Access
1. Open dashboard.html
2. Click gold crown icon (👑) - top-left or bottom bar
3. Click "Resource Management" dropdown
4. Select "Manage Community"

## Search & Filter
```
Search Box: Type name or email (auto-searches after 300ms)
Role Filter: All Roles | Member | Admin
Visibility: All | Visible | Hidden
Status: All | Active | Disabled
Claimed: All | Claimed | Unclaimed
Clear Button: Reset all filters
```

## Table Actions
- **Click row**: Open person details drawer
- **Checkbox**: Select for bulk actions
- **Select All**: Check/uncheck all on current page
- **Column headers**: Click to sort (name, email, role, created date)
- **⋯ button**: Quick access to person details

## Person Details Drawer
### Editable Fields
- Name, Email, Bio
- Skills, Interests, Availability
- Image URL
- Role (Member/Admin)
- Hidden toggle
- Disabled toggle
- Newsletter opt-in toggle

### Read-Only Info
- ID, User ID (auth link)
- Created/Updated timestamps
- Last login
- Profile completed status
- XP, Level, Streak

### Actions
- **Save**: Update person (with validation)
- **Cancel**: Close without saving

## Bulk Actions
1. Select multiple people (checkboxes)
2. Bulk action bar appears at bottom
3. Available actions:
   - **Set Role**: Prompt for Member/Admin
   - **Hide**: Make invisible to community
   - **Unhide**: Make visible again
   - **Disable**: Prevent login
   - **Enable**: Allow login
   - **Cancel**: Clear selection

## Invite/Add Person
1. Click "Invite / Add Person" button
2. Enter email (required)
3. Enter name (optional - defaults to email prefix)
4. Click "Add Person"
5. New member created as unclaimed Member
6. They can claim account on first login

## Guardrails
- ❌ Cannot demote last Admin
- ⚠️ Self-demotion requires typing "DEMOTE"
- ⚠️ Disable action requires confirmation
- ✅ All changes respect database RLS policies

## Status Pills
- **Visible** (green) / **Hidden** (red): Community visibility
- **Active** (green) / **Disabled** (red): Login ability
- **Claimed** (purple) / **Unclaimed** (orange): Auth link status

## Role Pills
- **Admin** (gold): Full admin access
- **Member** (cyan): Standard user

## Pagination
- 50 people per page
- Previous/Next buttons
- Page indicator shows current/total pages

## Tips
- Use search to quickly find specific people
- Combine filters for precise queries
- Bulk actions save time for common operations
- Hidden members can still be found via search
- Disabled members cannot log in but data is preserved
- Unclaimed accounts are waiting for first login

## Common Tasks

### Make someone an Admin
1. Search for person
2. Click row to open drawer
3. Change Role dropdown to "Admin"
4. Click Save

### Hide a member from community
1. Search for person
2. Click row to open drawer
3. Check "Hidden" toggle
4. Click Save

### Disable an account
1. Search for person
2. Click row to open drawer
3. Check "Disabled" toggle
4. Confirm action
5. Click Save

### Bulk hide multiple members
1. Use filters to find target group
2. Select checkboxes
3. Click "Hide" in bulk action bar
4. Confirm

### Find unclaimed accounts
1. Set "Claimed" filter to "Unclaimed"
2. View all accounts waiting for first login

## Keyboard Shortcuts
- **Esc**: Close drawer or modal
- **Enter**: Submit forms (invite modal, drawer)

## Mobile
- Table switches to stacked cards automatically
- All features available on mobile
- Touch-friendly interactions

## Troubleshooting
- **Panel won't load**: Refresh page, check console
- **Changes not saving**: Check RLS policies, verify admin status
- **Can't demote admin**: Ensure not last admin, type "DEMOTE" for self
- **Search not working**: Wait 300ms for debounce, check spelling

## Database Fields Reference
```
Canonical Role Field: user_role (NOT role)
Visibility: is_hidden (boolean)
Status: is_disabled (boolean)
Auth Link: user_id (uuid, nullable)
```

## Admin Check
Your admin status is determined by:
```sql
user_role = 'Admin'
AND user_id = auth.uid()
AND is_disabled = false
```

Function: `public.is_admin(auth.uid())`

## Support
- Check console for detailed error messages
- All mutations are logged
- RLS policies enforce security
- Contact: dmhamilton1@live.com
