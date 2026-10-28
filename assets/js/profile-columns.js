// ================================================================
// PROFILE COLUMNS
// ================================================================
// The community columns the website reads, in one place. Profile queries
// name their columns instead of using select('*'), and none of them include
// email: a member's own email comes from their sign-in session
// (window.currentAuthUser.email), and other members' emails are not shown.
// This prepares for a database change that stops members reading the email
// column (scripts/tests/test-profile-email-reads.js keeps it that way).
//
//   own     the signed-in member's own profile (sign-in, You, Edit Profile)
//   member  another member's profile (cards, profile page, Network, Inbox)
//
// Every column here must exist in production (see the PR's verification
// query). Classic script, loaded first in the page, so modules and inline
// scripts can all read window.BuildspaceProfileColumns.
(() => {
  'use strict';

  const member = [
    'id', 'user_id', 'name', 'bio', 'skills', 'interests', 'availability',
    'role', 'user_role', 'image_url', 'avatar_storage_path', 'photo_visible',
    'photo_consent_at', 'is_hidden', 'connection_count', 'created_at', 'updated_at',
  ];
  const own = member.concat([
    'onboarding_completed', 'profile_completed', 'xp', 'level', 'login_streak',
    'last_login', 'projects_created', 'projects_joined', 'endorsements_given',
    'endorsements_received',
  ]);

  window.BuildspaceProfileColumns = Object.freeze({
    own: own.join(', '),
    member: member.join(', '),
  });
})();
