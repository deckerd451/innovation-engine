// profileSystem.js - Smart Profile Management for CharlestonHacks
// Works with community table and hacksbucket storage

export async function initProfileSystem() {
  console.log('🔄 Initializing Profile System...');

  // Wait for Supabase to be ready
  while (!window.supabase) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Listen for auth state changes
  window.supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      console.log('✅ User signed in, checking profile...');
      await handleUserProfile(session.user);
    }
  });

  // Check if user is already logged in
  const { data: { session } } = await window.supabase.auth.getSession();
  if (session) {
    console.log('✅ Existing session found, checking profile...');
    await handleUserProfile(session.user);
  }
}

/**
 * Handle user profile - check if exists, populate or show create form
 */
async function handleUserProfile(user) {
  const profile = await fetchUserProfile(user.id);
  
  if (profile) {
    console.log('📋 Existing profile found:', profile);
    populateProfileForm(profile, user);
    updateProfileTitle('Your Profile');
    updateSubmitButton('Update Profile');
  } else {
    console.log('🆕 No profile found - new user');
    prefillBasicInfo(user);
    updateProfileTitle('Create Your Profile');
    updateSubmitButton('Save Profile');
  }

  // Set up form submission handler
  setupProfileFormHandler(user, !!profile);
}

/**
 * Fetch user profile from community table
 */
async function fetchUserProfile(userId) {
  try {
    const { data, error } = await window.supabase
      .from('community')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      // PGRST116 means no profile exists (expected for new users)
      if (error.code === 'PGRST116') {
        console.log('No profile found (new user)');
        return null;
      }
      console.error('Error fetching profile:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Exception fetching profile:', err);
    return null;
  }
}

/**
 * Populate form with existing profile data
 */
function populateProfileForm(profile, user) {
  // Split name into first and last
  const nameParts = (profile.name || '').trim().split(' ');
  document.getElementById('first-name').value = nameParts[0] || '';
  document.getElementById('last-name').value = nameParts.slice(1).join(' ') || '';
  
  // Email
  document.getElementById('email').value = profile.email || user.email || '';
  
  // Skills (stored as text in community table)
  const skillsInput = document.getElementById('skills-input');
  skillsInput.value = profile.skills || '';
  
  // Bio
  document.getElementById('bio-input').value = profile.bio || '';
  
  // Availability
  const availabilitySelect = document.getElementById('availability-input');
  if (profile.availability) {
    availabilitySelect.value = profile.availability;
  }
  
  // Newsletter opt-in
  document.getElementById('newsletter-opt-in').checked = profile.newsletter_opt_in || false;
  
  // Photo preview
  if (profile.image_url) {
    const preview = document.getElementById('preview');
    preview.src = profile.image_url;
    preview.classList.remove('hidden');
  }

  console.log('✅ Profile form populated');
}

/**
 * Prefill basic info for new users (email from auth)
 */
function prefillBasicInfo(user) {
  const emailInput = document.getElementById('email');
  if (user.email) {
    emailInput.value = user.email;
  }

  // If user signed in with Google/GitHub, try to get name
  if (user.user_metadata) {
    if (user.user_metadata.full_name) {
      const names = user.user_metadata.full_name.split(' ');
      document.getElementById('first-name').value = names[0] || '';
      document.getElementById('last-name').value = names.slice(1).join(' ') || '';
    }
    if (user.user_metadata.name) {
      const names = user.user_metadata.name.split(' ');
      document.getElementById('first-name').value = names[0] || '';
      document.getElementById('last-name').value = names.slice(1).join(' ') || '';
    }
    if (user.user_metadata.avatar_url) {
      const preview = document.getElementById('preview');
      preview.src = user.user_metadata.avatar_url;
      preview.classList.remove('hidden');
    }
  }

  console.log('✅ Basic info prefilled for new user');
}

/**
 * Update profile section title
 */
function updateProfileTitle(title) {
  const titleElement = document.querySelector('#profile .section-title');
  if (titleElement) {
    titleElement.textContent = title;
  }
}

/**
 * Update submit button text
 */
function updateSubmitButton(text) {
  const submitBtn = document.querySelector('#skills-form button[type="submit"]');
  if (submitBtn) {
    submitBtn.textContent = text;
  }
}

/**
 * Set up form submission handler
 */
function setupProfileFormHandler(user, isUpdate) {
  const form = document.getElementById('skills-form');
  
  // Remove any existing listeners
  const newForm = form.cloneNode(true);
  form.parentNode.replaceChild(newForm, form);
  
  newForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const submitBtn = newForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = isUpdate ? 'Updating...' : 'Saving...';
    submitBtn.disabled = true;

    try {
      const profileData = await collectFormData(user);
      
      if (isUpdate) {
        await updateProfile(user.id, profileData);
        showNotification('✅ Profile updated successfully!', 'success');
      } else {
        await createProfile(user.id, profileData);
        showNotification('✅ Profile created successfully!', 'success');
        
        // Switch to update mode
        updateProfileTitle('Your Profile');
        updateSubmitButton('Update Profile');
        isUpdate = true;
      }

      // Update progress bar
      updateProfileProgress(profileData);

    } catch (error) {
      console.error('Error saving profile:', error);
      showNotification('❌ Error saving profile. Please try again.', 'error');
    } finally {
      submitBtn.textContent = originalText;
      submitBtn.disabled = false;
    }
  });

  console.log('✅ Profile form handler set up');
}

/**
 * Collect form data
 */
async function collectFormData(user) {
  const firstName = document.getElementById('first-name').value.trim();
  const lastName = document.getElementById('last-name').value.trim();
  const name = `${firstName} ${lastName}`.trim();
  
  const skillsInput = document.getElementById('skills-input').value.trim();

  const photoFile = document.getElementById('photo-input').files[0];
  let imageUrl = null;

  if (photoFile) {
    imageUrl = await uploadPhoto(photoFile, user.id);
  } else {
    // Keep existing photo if present
    const preview = document.getElementById('preview');
    if (preview.src && !preview.classList.contains('hidden')) {
      imageUrl = preview.src;
    }
  }

  return {
    name: name,
    email: document.getElementById('email').value.trim(),
    skills: skillsInput, // Store as text (comma-separated)
    bio: document.getElementById('bio-input').value.trim(),
    availability: document.getElementById('availability-input').value,
    newsletter_opt_in: document.getElementById('newsletter-opt-in').checked,
    image_url: imageUrl,
    profile_completed: true,
    updated_at: new Date().toISOString()
  };
}

/**
 * Create new profile in community table
 */
async function createProfile(userId, profileData) {
  const { error } = await window.supabase
    .from('community')
    .insert([{
      user_id: userId,
      ...profileData,
      created_at: new Date().toISOString()
    }]);

  if (error) {
    console.error('Error creating profile:', error);
    throw error;
  }

  console.log('✅ Profile created');
}

/**
 * Update existing profile in community table
 */
async function updateProfile(userId, profileData) {
  const { error } = await window.supabase
    .from('community')
    .update(profileData)
    .eq('user_id', userId);

  if (error) {
    console.error('Error updating profile:', error);
    throw error;
  }

  console.log('✅ Profile updated');
}

/**
 * Upload photo to hacksbucket storage
 */
async function uploadPhoto(file, userId) {
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `avatar-${Date.now()}.${fileExt}`;
    const filePath = `avatars/${userId}/${fileName}`;

    const { error: uploadError } = await window.supabase.storage
      .from('hacksbucket')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true
      });

    if (uploadError) {
      console.error('Error uploading photo:', uploadError);
      return null;
    }

    const { data } = window.supabase.storage
      .from('hacksbucket')
      .getPublicUrl(filePath);

    console.log('✅ Photo uploaded:', data.publicUrl);
    return data.publicUrl;
  } catch (error) {
    console.error('Exception uploading photo:', error);
    return null;
  }
}

/**
 * Show notification message
 */
function showNotification(message, type = 'info') {
  // Try to use existing notification system
  const matchNotification = document.getElementById('matchNotification');
  if (matchNotification) {
    matchNotification.textContent = message;
    matchNotification.className = `notification ${type}`;
    matchNotification.classList.remove('hidden');
    
    setTimeout(() => {
      matchNotification.classList.add('hidden');
    }, 3000);
    return;
  }

  // Fallback to progress message
  const progressMsg = document.getElementById('profile-progress-msg');
  if (progressMsg) {
    progressMsg.textContent = message;
    progressMsg.style.color = type === 'success' ? '#0f0' : type === 'error' ? '#f00' : '#00e0ff';
    
    setTimeout(() => {
      progressMsg.textContent = '';
    }, 3000);
  }
}

/**
 * Update profile completion progress bar
 */
function updateProfileProgress(profileData) {
  const progressBar = document.querySelector('.profile-bar-inner');
  const progressMsg = document.getElementById('profile-progress-msg');
  
  if (!progressBar || !progressMsg) return;

  // Calculate completion percentage
  let completed = 0;
  const total = 6; // Total fields to check

  if (profileData.name) completed++;
  if (profileData.email) completed++;
  if (profileData.skills) completed++;
  if (profileData.bio) completed++;
  if (profileData.image_url) completed++;
  if (profileData.availability) completed++;

  const percentage = Math.round((completed / total) * 100);
  
  progressBar.style.width = `${percentage}%`;
  progressMsg.textContent = `Profile ${percentage}% complete`;
  
  if (percentage === 100) {
    progressMsg.textContent = '✅ Profile Complete!';
    progressMsg.style.color = '#0f0';
  }
}

/**
 * Public function to get current user profile
 */
export async function getCurrentUserProfile() {
  const { data: { session } } = await window.supabase.auth.getSession();
  if (!session) return null;
  
  return await fetchUserProfile(session.user.id);
}

/**
 * Public function to refresh profile display
 */
export async function refreshProfile() {
  const { data: { session } } = await window.supabase.auth.getSession();
  if (session) {
    await handleUserProfile(session.user);
  }
}