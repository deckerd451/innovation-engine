// Shared by classic scripts and modules. This is a display policy, not a
// substitute for private Storage buckets and server-side authorization.
(() => {
  'use strict';

  function shouldHidePhoto(person, viewerId) {
    if (!person) return true;
    person = person._raw || person;
    const authId = window.currentAuthUser?.id;
    if (!authId) return true;
    const viewer = window.currentUserProfile;
    const viewerIsCurrent = !!authId && viewer?.user_id === authId;
    if (viewerIsCurrent && viewer.user_role === 'Admin') return false;
    const ids = [viewerId, authId, viewerIsCurrent ? viewer.id : null].filter(Boolean);
    if (ids.some(id => id === person.id || id === person.user_id)) return false;
    // Old photo_visible=true values came from the previous default, not consent.
    return !(authId && person.photo_visible === true && person.photo_consent_at);
  }

  function profilePhotoUrl(person, viewerId) {
    if (shouldHidePhoto(person, viewerId)) return null;
    return person.image_url || person.imageUrl || person.avatar_url || person.image_path || null;
  }

  function profileInitials(person) {
    const name = String(person?.name || person?.email || '?').trim();
    const parts = name.split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  window.shouldHideProfilePhoto = shouldHidePhoto;
  window.profilePhotoUrl = profilePhotoUrl;
  window.profileInitials = profileInitials;
})();
