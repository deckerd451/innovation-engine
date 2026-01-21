# Theme Participation Array Format Fix
**Date:** January 21, 2026 - 07:45:00

## Issue Fixed

**Error:** `Array value must start with '{' or dimension information. (HINT: malformed array literal: "interested")`

**Root Cause:** The `signals` field in the `theme_participants` table expects PostgreSQL array format, but JavaScript was sending plain strings.

## Files Modified

### `assets/js/synapse/themes.js`
- **Fixed `joinTheme()` function:** Changed `signals: "interested"` to `signals: ["interested"]`
- **Fixed `upgradeEngagement()` function:** Changed string values to array format

### `assets/js/synapse/data.js`
- **Fixed data processing:** Ensured `signals` field defaults to array format

## Changes Made

**Before (Incorrect):**
```javascript
signals: "interested"
signals: newLevel === "observer" ? "interested" : "active"
```

**After (Correct):**
```javascript
signals: ["interested"]
signals: newLevel === "observer" ? ["interested"] : ["active"]
```

## Testing

1. **Hard refresh your browser** (Ctrl+Shift+R or Cmd+Shift+R)
2. **Try joining a theme** - should work without the array format error
3. **Check theme participation** - engagement levels should update correctly

## Database Schema

The `theme_participants.signals` field is defined as `TEXT[]` (PostgreSQL array), which requires:
- JavaScript: `["value1", "value2"]` 
- PostgreSQL: `{value1,value2}`

---

**Status:** ✅ Fixed and Ready for Testing
**Impact:** Resolves theme joining errors
**Risk Level:** Low (JavaScript array format fix only)