// ================================================================
// PROFILE MANAGEMENT SYSTEM
// ================================================================
// Handles user profile creation, editing, and display

// ========================
// GLOBAL STATE
// ========================
let currentUser = null;
let currentUserProfile = null;

// ========================
// PROFILE UI FUNCTIONS
// ========================

function updateUserUI(profile) {
  const name = profile.name || currentUser.email?.split('@')[0] || 'User';
  
  const userNameHeader = document.getElementById('user-name-header');
  if (userNameHeader) {
    userNameHeader.textContent = name;
  }
  
  const initialsHeader = document.getElementById('user-initials-header');
  if (initialsHeader) {
    const initials = getInitials(name);
    initialsHeader.textContent = initials;
  }
  
  const avatarHeader = document.getElementById('user-avatar-header');
  if (avatarHeader && profile.image_url) {
    avatarHeader.innerHTML = `<img src="${profile.image_url}" alt="${name}">`;
  }
}

function getInitials(name) {
  if (!name) return '??';
  const parts = name.trim().split(' ');
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ========================
// PROFILE FORM RENDERING
// ========================

window.renderProfileForm = function(existingProfile = null) {
  const isNewProfile = !existingProfile;
  const profileSection = document.getElementById('profile-section');
  
  const formHTML = `
    <form id="profile-form" style="max-width: 800px; margin: 0 auto;">
      <div style="margin-bottom: 1.5rem;">
        <label style="display: block; color: #aaa; margin-bottom: 0.5rem; font-weight: bold;">
          Name *
        </label>
        <input 
          type="text" 
          id="profile-name" 
          value="${existingProfile?.name || ''}"
          required
          placeholder="Your full name"
          style="width: 100%; padding: 0.75rem; background: rgba(0,224,255,0.05); border: 1px solid rgba(0,224,255,0.2); border-radius: 8px; color: white; font-family: inherit;"
        >
      </div>

      <div style="margin-bottom: 1.5rem;">
        <label style="display: block; color: #aaa; margin-bottom: 0.5rem; font-weight: bold;">
          Bio
        </label>
        <textarea 
          id="profile-bio" 
          rows="4"
          placeholder="Tell us about yourself..."
          style="width: 100%; padding: 0.75rem; background: rgba(0,224,255,0.05); border: 1px solid rgba(0,224,255,0.2); border-radius: 8px; color: white; font-family: inherit; resize: vertical;"
        >${existingProfile?.bio || ''}</textarea>
      </div>

      <div style="margin-bottom: 1.5rem;">
        <label style="display: block; color: #aaa; margin-bottom: 0.5rem; font-weight: bold;">
          Skills (comma-separated)
        </label>
        <input 
          type="text" 
          id="profile-skills" 
          value="${existingProfile?.skills || ''}"
          placeholder="e.g., JavaScript, React, Python, Design"
          style="width: 100%; padding: 0.75rem; background: rgba(0,224,255,0.05); border: 1px solid rgba(0,224,255,0.2); border-radius: 8px; color: white; font-family: inherit;"
        >
      </div>

      <div style="margin-bottom: 1.5rem;">
        <label style="display: block; color: #aaa; margin-bottom: 0.5rem; font-weight: bold;">
          Interests (comma-separated)
        </label>
        <input 
          type="text" 
          id="profile-interests" 
          value="${Array.isArray(existingProfile?.interests) ? existingProfile.interests.join(', ') : ''}"
          placeholder="e.g., AI, Web3, Sustainability"
          style="width: 100%; padding: 0.75rem; background: rgba(0,224,255,0.05); border: 1px solid rgba(0,224,255,0.2); border-radius: 8px; color: white; font-family: inherit;"
        >
      </div>

      <div style="margin-bottom: 1.5rem;">
        <label style="display: block; color: #aaa; margin-bottom: 0.5rem; font-weight: bold;">
          Availability
        </label>
        <select 
          id="profile-availability"
          style="width: 100%; padding: 0.75rem; background: rgba(0,224,255,0.05); border: 1px solid rgba(0,224,255,0.2); border-radius: 8px; color: white; font-family: inherit;"
        >
          <option value="Available" ${existingProfile?.availability === 'Available' ? 'selected' : ''}>Available</option>
          <option value="Busy" ${existingProfile?.availability === 'Busy' ? 'selected' : ''}>Busy</option>
          <option value="Not Available" ${existingProfile?.availability === 'Not Available' ? 'selected' : ''}>Not Available</option>
        </select>
      </div>

      <!-- Photo Upload Section -->
      <div style="margin-bottom: 2rem; text-align: center;">
        <div style="margin-bottom: 1rem;">
          <div id="profile-image-preview" style="display: inline-block; position: relative;">
            ${existingProfile?.image_url ? `
              <img src="${existingProfile.image_url}" alt="Profile" style="width: 120px; height: 120px; border-radius: 50%; object-fit: cover; border: 3px solid #00e0ff;">
            ` : `
              <div style="width: 120px; height: 120px; border-radius: 50%; background: rgba(0,224,255,0.1); border: 3px dashed rgba(0,224,255,0.3); display: flex; align-items: center; justify-content: center;">
                <i class="fas fa-user" style="font-size: 3rem; color: rgba(0,224,255,0.3);"></i>
              </div>
            `}
          </div>
        </div>
        
        <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
          <label style="background: linear-gradient(135deg, #00e0ff, #0080ff); border: none; padding: 0.75rem 1.5rem; border-radius: 8px; color: white; font-weight: bold; cursor: pointer; display: inline-block;">
            <i class="fas fa-upload"></i> Upload Photo
            <input 
              type="file" 
              id="profile-photo-upload" 
              accept="image/*"
              style="display: none;"
              onchange="handlePhotoUpload(event)"
            >
          </label>
          
          <button 
            type="button"
            onclick="toggleUrlInput()"
            style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); padding: 0.75rem 1.5rem; border-radius: 8px; color: white; cursor: pointer;"
          >
            <i class="fas fa-link"></i> Use URL Instead
          </button>
        </div>
        
        <!-- URL Input (hidden by default) -->
        <div id="url-input-container" style="display: none; margin-top: 1rem;">
          <input 
            type="url" 
            id="profile-image-url" 
            value="${existingProfile?.image_url || ''}"
            placeholder="https://example.com/your-photo.jpg"
            style="width: 100%; max-width: 400px; padding: 0.75rem; background: rgba(0,224,255,0.05); border: 1px solid rgba(0,224,255,0.2); border-radius: 8px; color: white; font-family: inherit;"
          >
        </div>
        
        <input type="hidden" id="profile-image-url-final" value="${existingProfile?.image_url || ''}">
      </div>

      <div style="display: flex; gap: 1rem; margin-top: 2rem;">
        <button 
          type="submit" 
          style="flex: 1; background: linear-gradient(135deg, #00e0ff, #0080ff); border: none; padding: 1rem; border-radius: 8px; color: white; font-weight: bold; cursor: pointer; font-size: 1rem;"
        >
          <i class="fas fa-save"></i> ${isNewProfile ? 'Create Profile' : 'Save Changes'}
        </button>
        ${!isNewProfile ? `
          <button 
            type="button"
            onclick="cancelProfileEdit()"
            style="flex: 1; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); padding: 1rem; border-radius: 8px; color: white; cursor: pointer; font-size: 1rem;"
          >
            Cancel
          </button>
        ` : ''}
      </div>
    </form>
  `;
  
  profileSection.innerHTML = formHTML;
  
  // Add form submit handler
  document.getElementById('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveProfile(isNewProfile);
  });
}

// ========================
// PROFILE VIEW RENDERING
// ========================

window.renderProfileView = function(profile) {
  const profileSection = document.getElementById('profile-section');
  
  const interests = Array.isArray(profile.interests) ? profile.interests : [];
  
  const viewHTML = `
    <div style="max-width: 800px; margin: 0 auto;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
        <h3 style="color: #00e0ff; margin: 0;">Your Profile</h3>
        <button 
          onclick="editCurrentProfile()"
          style="background: linear-gradient(135deg, #00e0ff, #0080ff); border: none; padding: 0.75rem 1.5rem; border-radius: 8px; color: white; font-weight: bold; cursor: pointer;"
        >
          <i class="fas fa-edit"></i> Edit Profile
        </button>
      </div>
      
      <div style="background: rgba(0,224,255,0.05); border: 1px solid rgba(0,224,255,0.2); border-radius: 12px; padding: 2rem;">
        ${profile.image_url ? `
          <div style="text-align: center; margin-bottom: 2rem;">
            <img src="${profile.image_url}" alt="${profile.name}" style="width: 120px; height: 120px; border-radius: 50%; object-fit: cover; border: 3px solid #00e0ff;">
          </div>
        ` : ''}
        
        <div style="margin-bottom: 1.5rem;">
          <h4 style="color: #aaa; font-size: 0.9rem; margin-bottom: 0.5rem;">NAME</h4>
          <p style="color: white; font-size: 1.2rem; margin: 0;">${profile.name}</p>
        </div>
        
        <div style="margin-bottom: 1.5rem;">
          <h4 style="color: #aaa; font-size: 0.9rem; margin-bottom: 0.5rem;">EMAIL</h4>
          <p style="color: white; margin: 0;">${profile.email}</p>
        </div>
        
        ${profile.bio ? `
          <div style="margin-bottom: 1.5rem;">
            <h4 style="color: #aaa; font-size: 0.9rem; margin-bottom: 0.5rem;">BIO</h4>
            <p style="color: white; margin: 0; line-height: 1.6;">${profile.bio}</p>
          </div>
        ` : ''}
        
        ${profile.skills ? `
          <div style="margin-bottom: 1.5rem;">
            <h4 style="color: #aaa; font-size: 0.9rem; margin-bottom: 0.5rem;">SKILLS</h4>
            <p style="color: white; margin: 0;">${profile.skills}</p>
          </div>
        ` : ''}
        
        ${interests.length > 0 ? `
          <div style="margin-bottom: 1.5rem;">
            <h4 style="color: #aaa; font-size: 0.9rem; margin-bottom: 0.5rem;">INTERESTS</h4>
            <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
              ${interests.map(interest => `
                <span style="background: rgba(0,224,255,0.2); color: #00e0ff; padding: 0.25rem 0.75rem; border-radius: 12px; font-size: 0.85rem;">
                  ${interest}
                </span>
              `).join('')}
            </div>
          </div>
        ` : ''}
        
        <div style="margin-bottom: 1.5rem;">
          <h4 style="color: #aaa; font-size: 0.9rem; margin-bottom: 0.5rem;">AVAILABILITY</h4>
          <p style="color: ${profile.availability === 'Available' ? '#00ff88' : profile.availability === 'Busy' ? '#ffd700' : '#ff6b6b'}; margin: 0; font-weight: bold;">
            <i class="fas fa-circle" style="font-size: 0.5rem;"></i> ${profile.availability || 'Not set'}
          </p>
        </div>
      </div>
    </div>
  `;
  
  profileSection.innerHTML = viewHTML;
}

// ========================
// PROFILE ACTIONS
// ========================

window.toggleUrlInput = function() {
  const container = document.getElementById('url-input-container');
  if (container.style.display === 'none') {
    container.style.display = 'block';
  } else {
    container.style.display = 'none';
  }
};

window.handlePhotoUpload = async function(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  // Validate file type
  if (!file.type.startsWith('image/')) {
    alert('Please select an image file');
    return;
  }
  
  // Validate file size (max 5MB)
  if (file.size > 5 * 1024 * 1024) {
    alert('Image must be less than 5MB');
    return;
  }
  
  try {
    // Show loading state
    const preview = document.getElementById('profile-image-preview');
    preview.innerHTML = `
      <div style="width: 120px; height: 120px; border-radius: 50%; background: rgba(0,224,255,0.1); border: 3px solid #00e0ff; display: flex; align-items: center; justify-content: center; flex-direction: column;">
        <i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: #00e0ff;"></i>
        <p style="color: #00e0ff; font-size: 0.8rem; margin-top: 0.5rem;">Uploading...</p>
      </div>
    `;
    
    // Generate unique filename
    const fileExt = file.name.split('.').pop();
    const fileName = `${currentUser.id || Date.now()}_${Date.now()}.${fileExt}`;
    const filePath = `profile-photos/${fileName}`;
    
    // Upload to Supabase Storage
    const { data, error } = await window.supabase.storage
      .from('hacksbucket')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });
    
    if (error) {
      console.error('Upload error:', error);
      alert('Failed to upload image: ' + error.message);
      // Restore previous image or placeholder
      renderProfileForm(currentUserProfile);
      return;
    }
    
    // Get public URL
    const { data: { publicUrl } } = window.supabase.storage
      .from('hacksbucket')
      .getPublicUrl(filePath);
    
    console.log('✅ Image uploaded:', publicUrl);
    
    // Update preview
    preview.innerHTML = `
      <img src="${publicUrl}" alt="Profile" style="width: 120px; height: 120px; border-radius: 50%; object-fit: cover; border: 3px solid #00e0ff;">
    `;
    
    // Store URL in hidden field
    document.getElementById('profile-image-url-final').value = publicUrl;
    
  } catch (err) {
    console.error('Upload error:', err);
    alert('Failed to upload image');
    renderProfileForm(currentUserProfile);
  }
};

window.saveProfile = async function(isNewProfile) {
  const name = document.getElementById('profile-name').value.trim();
  const bio = document.getElementById('profile-bio').value.trim();
  const skills = document.getElementById('profile-skills').value.trim();
  const interestsInput = document.getElementById('profile-interests').value.trim();
  const availability = document.getElementById('profile-availability').value;
  
  // Get image URL from hidden field (set by upload) or manual URL input
  let imageUrl = document.getElementById('profile-image-url-final').value.trim();
  if (!imageUrl) {
    imageUrl = document.getElementById('profile-image-url')?.value.trim() || '';
  }
  
  if (!name) {
    alert('Name is required');
    return;
  }
  
  // Convert interests string to array
  const interests = interestsInput ? interestsInput.split(',').map(i => i.trim()).filter(Boolean) : [];
  
  const profileData = {
    user_id: currentUser.id,
    name,
    bio,
    skills,
    interests,
    availability,
    image_url: imageUrl || null,
    email: currentUser.email
  };
  
  try {
    if (isNewProfile) {
      // Create new profile
      const { data, error } = await window.supabase
        .from('community')
        .insert(profileData)
        .select()
        .single();
      
      if (error) {
        console.error('Error creating profile:', error);
        alert('Failed to create profile: ' + error.message);
        return;
      }
      
      console.log('✅ Profile created:', data);
      currentUserProfile = data;
      
      // Dispatch profile-loaded event
      window.dispatchEvent(new CustomEvent('profile-loaded', { 
        detail: { user: currentUser, profile: data }
      }));
      
      alert('Profile created successfully!');
      
    } else {
      // Update existing profile
      console.log('📝 Updating profile with data:', profileData);
      console.log('📝 Profile ID:', currentUserProfile.id);
      
      const { data, error } = await window.supabase
        .from('community')
        .update(profileData)
        .eq('id', currentUserProfile.id)
        .select()
        .single();
      
      if (error) {
        console.error('Error updating profile:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        alert('Failed to update profile: ' + error.message);
        return;
      }
      
      console.log('✅ Profile updated:', data);
      currentUserProfile = data;
      
      // Update UI silently
      updateUserUI(data);
      
      // Close the editor and show view
      cancelProfileEdit();
    }
  } catch (err) {
    console.error('Save profile error:', err);
    alert('Failed to save profile');
  }
}

window.cancelProfileEdit = function() {
  if (currentUserProfile) {
    renderProfileView(currentUserProfile);
  }
};

window.editCurrentProfile = function() {
  if (currentUserProfile) {
    renderProfileForm(currentUserProfile);
  } else {
    alert('Profile not loaded yet');
  }
};

// ========================
// EVENT LISTENERS
// ========================

// Listen for profile-loaded event from auth.js
window.addEventListener('profile-loaded', async (e) => {
  console.log('📋 Profile loaded:', e.detail.profile);
  const { profile, user } = e.detail;
  
  currentUser = user;
  currentUserProfile = profile;
  
  // Update UI
  updateUserUI(profile);
  
  // Render profile view in profile section
  renderProfileView(profile);
  
  // Auto-expand the profile editor section
  const profileEditorContent = document.getElementById('profile-editor-content');
  if (profileEditorContent) {
    profileEditorContent.classList.add('expanded');
  }
  
  // Notify dashboard that profile is ready
  window.dispatchEvent(new CustomEvent('profile-ready', { 
    detail: { user, profile }
  }));
});

// Listen for new user event from auth.js
window.addEventListener('profile-new', (e) => {
  console.log('🆕 New user:', e.detail.user);
  currentUser = e.detail.user;
  currentUserProfile = null;
  
  // Show profile creation form
  renderProfileForm(null);
  
  // Auto-expand the profile editor section
  const profileEditorContent = document.getElementById('profile-editor-content');
  if (profileEditorContent) {
    profileEditorContent.classList.add('expanded');
  }
});

// Listen for logout event from auth.js
window.addEventListener('user-logged-out', () => {
  console.log('👋 Logged out - clearing profile state');
  currentUser = null;
  currentUserProfile = null;
});

// ========================
// NO EXPORTS NEEDED
// ========================
// All functions are attached to window object and available globally
// The module communicates via custom events
