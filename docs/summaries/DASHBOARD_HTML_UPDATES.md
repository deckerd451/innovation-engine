# Dashboard.html Updates Required

## 1. Add Notification Bell to Header

Find the user menu section (around line 700-750) and add the notification bell icon BEFORE the user menu:

```html
<!-- ADD THIS BEFORE THE USER MENU -->
<!-- Notification Bell -->
<div id="notification-bell" style="
  position: relative;
  width: 40px;
  height: 40px;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  margin-right: 0.75rem;
" onclick="if(window.NotificationBell) window.NotificationBell.showPanel()" 
   onmouseenter="this.style.background='rgba(255,255,255,0.15)'" 
   onmouseleave="this.style.background='rgba(255,255,255,0.08)'">
  <i class="fas fa-bell" style="color: rgba(255,255,255,0.8); font-size: 1.1rem;"></i>
</div>
```

## 2. Add Script Includes

Add these script tags BEFORE the closing `</body>` tag, after the existing scripts (around line 1300-1400):

```html
<!-- Comprehensive Fixes Module -->
<script src="assets/js/comprehensive-fixes.js?v=fixes001"></script>

<!-- Notification Bell Module -->
<script src="assets/js/notification-bell.js?v=fixes001"></script>

<!-- Avatar Upload Module -->
<script src="assets/js/avatar-upload.js?v=fixes001"></script>

<!-- Node Panel Fixes -->
<script src="assets/js/node-panel-fixes.js?v=fixes001"></script>

<!-- Initialize Notification Bell on Profile Load -->
<script>
  window.addEventListener('profile-loaded', (e) => {
    const { profile } = e.detail;
    if (window.NotificationBell && profile) {
      window.NotificationBell.init(profile);
    }
  });
</script>
```

## 3. Update Organization Join Function

Find the `joinOrganization` function in dashboard-actions.js or inline scripts and replace it with:

```javascript
async function joinOrganization(orgId) {
  const currentUser = window.currentUserProfile;
  if (!currentUser) {
    window.ComprehensiveFixes.showToast('Please log in to join an organization', 'error');
    return;
  }

  // Use the comprehensive fixes module
  await window.ComprehensiveFixes.submitOrganizationJoinRequest(orgId, currentUser.id);
}
```

## 4. Ensure Logout Button is Visible

The logout button already exists in the dropdown menu (line ~780-798). Verify it's visible by checking the dropdown logic around line 1650-1750.

## 5. Add CSS for Notification Bell Badge

Add this to the `<style>` section in the `<head>`:

```css
/* Notification Bell Badge */
.notification-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background: #ff3b30;
  color: white;
  border-radius: 10px;
  padding: 2px 6px;
  font-size: 0.7rem;
  font-weight: bold;
  min-width: 18px;
  text-align: center;
  box-shadow: 0 2px 4px rgba(0,0,0,0.3);
  z-index: 10;
}

/* Fix blue bar overlay on profile pages */
.profile-overlay-bar,
.blue-bar-overlay {
  display: none !important;
}

/* Ensure profile modal content is not overlapped */
#profile-modal .modal-content {
  z-index: 1000;
  position: relative;
}

/* Make project details panel scrollable */
.project-details-panel,
.project-info-content {
  overflow-y: auto !important;
  max-height: calc(100vh - 200px) !important;
}

/* Ensure project members list is scrollable */
.project-members-list {
  overflow-y: auto !important;
  max-height: 300px !important;
}
```

## 6. Update Profile.js to Include Avatar Upload

In profile.js, find the profile editor form and add the avatar upload UI. Look for the image_url input field and replace it with:

```javascript
// In the profile editor form rendering section
// Replace the image_url text input with:

const avatarSection = document.createElement('div');
avatarSection.style.marginBottom = '1.5rem';

const avatarLabel = document.createElement('label');
avatarLabel.textContent = 'Profile Picture';
avatarLabel.style.cssText = 'display: block; color: rgba(255,255,255,0.8); margin-bottom: 0.5rem; font-weight: 600;';

const avatarUI = window.AvatarUpload.createUI(
  state.profile?.image_url || state.profile?.avatar_storage_path,
  (newUrl) => {
    // Update the profile state with new avatar URL
    state.profile.image_url = newUrl;
    // Refresh header avatar
    updateHeaderAvatar(newUrl);
  }
);

avatarSection.appendChild(avatarLabel);
avatarSection.appendChild(avatarUI);

// Add this section to the form
```

## Complete Integration Checklist

- [ ] Add notification bell icon to header
- [ ] Add script includes for new modules
- [ ] Add CSS for notification bell badge and fixes
- [ ] Update joinOrganization function
- [ ] Verify logout button visibility
- [ ] Update profile.js for avatar upload
- [ ] Test notification bell functionality
- [ ] Test avatar upload
- [ ] Test level/streak display
- [ ] Test clickable project members
- [ ] Test clickable skills
- [ ] Test organization join requests
- [ ] Test project requests
- [ ] Verify no blue bar on profiles
- [ ] Verify projects panel scrolls
