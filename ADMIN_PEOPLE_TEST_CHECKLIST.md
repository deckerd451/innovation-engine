# Admin People Management - Test Checklist

## Pre-Test Setup
- [ ] Logged in as admin (dmhamilton1@live.com)
- [ ] Dashboard loaded successfully
- [ ] No console errors on page load
- [ ] Admin crown icon visible

## Access & Navigation
- [ ] Click admin crown icon → Admin panel opens
- [ ] Click "Resource Management" dropdown → Opens
- [ ] Click "Manage Community" → People panel loads
- [ ] No console errors during load
- [ ] Panel shows "Loading..." then displays data

## Search Functionality
- [ ] Type in search box → Results update after ~300ms
- [ ] Search by name → Finds correct people
- [ ] Search by email → Finds correct people
- [ ] Search with no results → Shows "No people found"
- [ ] Clear search → Shows all people again

## Filter Functionality
- [ ] Role filter: "Member" → Shows only Members
- [ ] Role filter: "Admin" → Shows only Admins
- [ ] Visibility filter: "Visible" → Shows only visible
- [ ] Visibility filter: "Hidden" → Shows only hidden
- [ ] Status filter: "Active" → Shows only active
- [ ] Status filter: "Disabled" → Shows only disabled
- [ ] Claimed filter: "Claimed" → Shows only claimed accounts
- [ ] Claimed filter: "Unclaimed" → Shows only unclaimed accounts
- [ ] Combine multiple filters → Works correctly
- [ ] Click "Clear" button → Resets all filters

## Table Display (Desktop)
- [ ] Table shows all columns (checkbox, name, email, role, status, created, actions)
- [ ] Avatars display correctly (images or initials)
- [ ] Role pills color-coded (Admin=gold, Member=cyan)
- [ ] Status pills show correctly (Visible/Hidden, Active/Disabled, Claimed/Unclaimed)
- [ ] Created dates formatted properly
- [ ] Hover over row → Background highlights

## Sorting (Desktop)
- [ ] Click "Name" header → Sorts by name (asc/desc)
- [ ] Click "Email" header → Sorts by email (asc/desc)
- [ ] Click "Role" header → Sorts by role (asc/desc)
- [ ] Click "Created" header → Sorts by date (asc/desc)
- [ ] Sort icon updates to show direction

## Selection & Bulk Actions
- [ ] Click individual checkbox → Person selected
- [ ] Click "Select All" → All on page selected
- [ ] Unclick "Select All" → All deselected
- [ ] Select 2+ people → Bulk action bar appears at bottom
- [ ] Bulk count shows correct number
- [ ] Click "Cancel" in bulk bar → Selection cleared, bar hides

### Bulk Set Role
- [ ] Select multiple people → Click "Set Role"
- [ ] Prompt appears for role input
- [ ] Enter "Admin" → Confirms and updates
- [ ] Enter "Member" → Confirms and updates
- [ ] Enter invalid role → Shows error
- [ ] Cancel prompt → No changes made

### Bulk Hide/Unhide
- [ ] Select visible people → Click "Hide" → Confirms and hides
- [ ] Select hidden people → Click "Unhide" → Confirms and unhides
- [ ] Changes reflected in table immediately

### Bulk Disable/Enable
- [ ] Select active people → Click "Disable" → Confirms and disables
- [ ] Select disabled people → Click "Enable" → Confirms and enables
- [ ] Changes reflected in table immediately

## Person Details Drawer
- [ ] Click person row → Drawer slides in from right
- [ ] Drawer shows person avatar and name
- [ ] All editable fields populated correctly
- [ ] All read-only fields displayed correctly

### Edit Fields
- [ ] Change name → Save → Updates successfully
- [ ] Change email → Save → Updates successfully
- [ ] Change bio → Save → Updates successfully
- [ ] Change skills → Save → Updates successfully
- [ ] Change interests → Save → Updates successfully
- [ ] Change availability → Save → Updates successfully
- [ ] Change image URL → Save → Updates successfully
- [ ] Toggle "Hidden" → Save → Updates successfully
- [ ] Toggle "Disabled" → Save → Confirms, then updates
- [ ] Toggle "Newsletter opt-in" → Save → Updates successfully

### Role Changes
- [ ] Change Member to Admin → Save → Updates successfully
- [ ] Change Admin to Member (not self) → Save → Updates successfully
- [ ] Change own role from Admin to Member → Prompts for "DEMOTE"
- [ ] Type "DEMOTE" correctly → Allows demotion
- [ ] Type wrong text → Cancels demotion
- [ ] Try to demote last admin → Blocked with error

### Drawer Actions
- [ ] Click "Cancel" → Drawer closes without saving
- [ ] Click X button → Drawer closes without saving
- [ ] Click "Save Changes" → Shows "Saving..." then "Saved!"
- [ ] After save → Drawer closes, table refreshes
- [ ] Save with error → Shows error message, stays open

## Invite/Add Person
- [ ] Click "Invite / Add Person" button → Modal opens
- [ ] Modal shows email and name fields
- [ ] Leave email empty → Click Add → Shows error
- [ ] Enter invalid email → Click Add → Shows error
- [ ] Enter valid email only → Click Add → Creates person with email prefix as name
- [ ] Enter email + name → Click Add → Creates person with custom name
- [ ] Try duplicate email → Shows "User already exists" error
- [ ] Click "Cancel" → Modal closes without adding
- [ ] Click backdrop → Modal closes without adding
- [ ] Successful add → Shows success, modal closes, table refreshes

## Pagination
- [ ] Shows "Showing X-Y of Z people" correctly
- [ ] Page indicator shows "Page X of Y"
- [ ] "Previous" button disabled on first page
- [ ] Click "Next" → Goes to next page
- [ ] Click "Previous" → Goes to previous page
- [ ] "Next" button disabled on last page
- [ ] Pagination persists with filters applied

## Mobile Responsiveness
- [ ] Resize window to <768px → Table switches to cards
- [ ] Cards show all information
- [ ] Cards are touch-friendly
- [ ] Checkboxes work on cards
- [ ] Click card → Opens drawer
- [ ] Drawer works on mobile
- [ ] Bulk actions work on mobile
- [ ] Invite modal works on mobile

## Guardrails & Safety
- [ ] Cannot demote last admin → Blocked
- [ ] Self-demotion requires "DEMOTE" → Enforced
- [ ] Disable action requires confirmation → Prompted
- [ ] All changes respect RLS → Non-admins cannot mutate
- [ ] Invalid data rejected → Shows clear errors

## Performance
- [ ] Search debounces (doesn't fire on every keystroke)
- [ ] Table loads quickly (<2 seconds)
- [ ] Drawer opens quickly (<1 second)
- [ ] Pagination is smooth
- [ ] No lag when selecting multiple items
- [ ] No memory leaks (check DevTools)

## Error Handling
- [ ] Network error → Shows clear error message
- [ ] Invalid data → Shows validation error
- [ ] Permission denied → Shows RLS error
- [ ] Timeout → Shows timeout message
- [ ] All errors logged to console

## Console Checks
- [ ] No errors on page load
- [ ] No errors when opening admin panel
- [ ] No errors when loading people panel
- [ ] No errors during search/filter
- [ ] No errors during CRUD operations
- [ ] Helpful debug logs present

## Integration
- [ ] Old "Add Person" section removed
- [ ] Old "Search/Remove" section removed
- [ ] No duplicate People management UI
- [ ] Admin panel tabs still work
- [ ] Other admin tabs (Themes, Projects, etc.) unaffected
- [ ] Closing admin panel works
- [ ] Reopening admin panel works

## Data Integrity
- [ ] Changes persist after page refresh
- [ ] Changes visible to other admins
- [ ] Hidden members not visible to non-admins
- [ ] Disabled members cannot log in
- [ ] Role changes take effect immediately
- [ ] Unclaimed accounts can be claimed on first login

## Edge Cases
- [ ] Empty database → Shows "No people found"
- [ ] Single person → Pagination works
- [ ] Exactly 50 people → Pagination boundary works
- [ ] 51 people → Second page has 1 person
- [ ] All people hidden → Filter shows them
- [ ] All people disabled → Filter shows them
- [ ] Person with no name → Shows "Unnamed"
- [ ] Person with no email → Shows "No email"
- [ ] Person with no avatar → Shows initials

## Cleanup Verification
- [ ] No references to old `adminAddPerson()` in UI
- [ ] No references to old `adminSearchPeople()` in UI
- [ ] No references to old `adminTogglePersonVisibility()` in UI
- [ ] Legacy functions marked as deprecated
- [ ] No dead code in dashboard-actions.js

## Final Checks
- [ ] All features work as expected
- [ ] UI is polished and professional
- [ ] No console errors or warnings
- [ ] Performance is acceptable
- [ ] Mobile experience is good
- [ ] Admin can manage all community members
- [ ] Non-admins cannot access (if tested)
- [ ] Documentation is accurate

## Sign-Off
- [ ] Tested by: _______________
- [ ] Date: _______________
- [ ] All critical issues resolved: Yes / No
- [ ] Ready for production: Yes / No

## Notes
_Add any issues, observations, or recommendations here:_

---

## Test Results Summary
- **Total Tests**: 150+
- **Passed**: ___
- **Failed**: ___
- **Blocked**: ___
- **Not Tested**: ___

## Critical Issues Found
1. 
2. 
3. 

## Non-Critical Issues Found
1. 
2. 
3. 

## Recommendations
1. 
2. 
3.
