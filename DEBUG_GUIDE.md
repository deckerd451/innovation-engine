# Debug Guide

## Enable Debug Mode

Open browser console and type:
```javascript
enableDebug()
```

This will reload the page with debug mode enabled.

## Check System Status

```javascript
debugInfo()
```

Returns:
- Current user info
- Profile data
- Connection count
- Module status
- Feature availability

## Disable Debug Mode

```javascript
disableDebug()
```

## Common Issues & Solutions

### 1. Onboarding Not Showing

**Check:**
```javascript
window.currentUserProfile?._needsOnboarding
typeof window.showOnboarding === 'function'
```

**Fix:** Ensure ui-helpers.js and onboarding.js are loaded

### 2. Search Not Working

**Check:**
```javascript
document.getElementById('search-input')
typeof window.selectPerson === 'function'
```

**Fix:** Ensure enhanced-search.js is loaded

### 3. Tooltips Not Appearing

**Check:**
```javascript
document.querySelectorAll('[data-tooltip]').length
```

**Fix:** Ensure tooltips.js is loaded

### 4. Keyboard Shortcuts Not Working

**Check:**
```javascript
// Press ? key - should show shortcuts modal
```

**Fix:** Ensure keyboard-shortcuts.js is loaded

### 5. Loading States Not Showing

**Check:**
```javascript
typeof window.showLoadingState === 'function'
typeof window.hideLoadingState === 'function'
```

**Fix:** Ensure ui-helpers.js is loaded

### 6. Empty States Not Showing

**Check CSS:**
```javascript
getComputedStyle(document.querySelector('.empty-state'))
```

**Fix:** Ensure ui-enhancements.css is loaded

### 7. Mobile Features Not Working

**Check:**
```javascript
/Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent)
```

**Fix:** Test on actual mobile device or use device emulation

## Network Issues

### Check Supabase Connection
```javascript
window.supabase?.auth.getSession()
```

### Check Profile Loading
```javascript
window.currentUserProfile
window.currentUser
```

### Check Connections
```javascript
window.allConnections
```

## Performance Checks

### Check Load Times
```javascript
performance.getEntriesByType('navigation')[0].loadEventEnd
```

### Check Memory Usage
```javascript
performance.memory
```

## Clear Cache

### Clear Search History
```javascript
localStorage.removeItem('searchHistory')
```

### Clear All Local Storage
```javascript
localStorage.clear()
location.reload()
```

## Test Features

### Test Onboarding
```javascript
window.showOnboarding({ 
  id: 'test', 
  display_name: '', 
  skills: [], 
  interests: [] 
})
```

### Test Toast Notifications
```javascript
window.showSuccessToast('Test success!')
window.showErrorToast('Test error!')
window.showToast('Test info!', 'info')
```

### Test Loading State
```javascript
window.showLoadingState()
setTimeout(() => window.hideLoadingState(), 2000)
```

### Test Error State
```javascript
window.showDashboardError(new Error('Test error'))
```

### Test Search
```javascript
document.getElementById('search-input').value = 'test'
document.getElementById('search-input').dispatchEvent(new Event('input'))
```

## Browser Console Commands

### View All Global Functions
```javascript
Object.keys(window).filter(k => typeof window[k] === 'function' && k.startsWith('show'))
```

### View All Event Listeners
```javascript
getEventListeners(document)
```

### Monitor Network Requests
```javascript
// Open Network tab in DevTools
// Filter by: supabase.co
```

## Common Error Messages

### "Profile not loaded"
- Wait for profile-loaded event
- Check window.currentUserProfile

### "Unable to load connections"
- Check network connection
- Verify Supabase credentials
- Check RLS policies

### "Supabase not available"
- Check if supabaseClient.js loaded
- Verify window.supabase exists

### "Function not defined"
- Check if module loaded
- Verify script order in index.html

## Performance Optimization

### Disable Animations (for testing)
```javascript
document.body.style.animation = 'none'
document.querySelectorAll('*').forEach(el => el.style.animation = 'none')
```

### Check Animation Performance
```javascript
performance.getEntriesByType('measure')
```

## Mobile Testing

### Simulate Touch Events
```javascript
const touch = new Touch({
  identifier: Date.now(),
  target: element,
  clientX: 100,
  clientY: 100
})
element.dispatchEvent(new TouchEvent('touchstart', { touches: [touch] }))
```

### Check Viewport
```javascript
{
  width: window.innerWidth,
  height: window.innerHeight,
  devicePixelRatio: window.devicePixelRatio
}
```

## Reset Everything

```javascript
// Clear all data and reload
localStorage.clear()
sessionStorage.clear()
location.reload()
```

## Report Issues

When reporting issues, include:
1. Output of `debugInfo()`
2. Browser console errors
3. Network tab (failed requests)
4. Steps to reproduce
5. Expected vs actual behavior

## Tips

- Use Chrome DevTools Device Mode for mobile testing
- Check Console for errors (red messages)
- Check Network tab for failed requests
- Use Lighthouse for performance audits
- Test in incognito mode to rule out extensions
