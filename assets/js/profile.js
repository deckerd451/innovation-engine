// ======================================================================
// CharlestonHacks Innovation Engine – PROFILE CONTROLLER (COMPLETE 2025)
// Works with:
//   ✓ community table
//   ✓ RLS: auth.uid() = user_id
//   ✓ Storage bucket: hacksbucket
//   ✓ Login.js custom events
//   ✓ Auto-populate for existing users
//   ✓ Dynamic title/button text
//   ✓ FIXED: Complete field population including interests
// ======================================================================

import { supabase } from "./supabaseClient.js";
import { showNotification } from "./utils.js";

// DOM
let form, previewImg;
let firstNameInput, lastNameInput, emailInput, skillsInput;
let bioInput, availabilityInput, newsletterInput, photoInput;
let progressBar, progressMsg;
let profileTitle, submitButton;
let interestsInput; // ADD THIS

let currentUser = null;
let currentProfile = null;

// ======================================================================
// INITIALIZE DOM REFERENCES
// ======================================================================
function initDOMRefs() {
  form = document.getElementById("skills-form");
  previewImg = document.getElementById("preview");

  firstNameInput = document.getElementById("first-name");
  lastNameInput = document.getElementById("last-name");
  emailInput = document.getElementById("email");
  skillsInput = document.getElementById("skills-input");
  bioInput = document.getElementById("bio-input");
  availabilityInput = document.getElementById("availability-input");
  newsletterInput = document.getElementById("newsletter-opt-in");
  photoInput = document.getElementById("photo-input");

  // ADD INTERESTS INPUT (adjust ID if different in your HTML)
  interestsInput = document.getElementById("interests-input");

  progressBar = document.querySelector(".profile-bar-inner");
  progressMsg = document.getElementById("profile-progress-msg");
  
  profileTitle = document.querySelector("#profile .section-title");
  submitButton = document.querySelector("#skills-form button[type='submit']");

  if (!form) {
    console.error("❌ Profile form not found in DOM");
    return false;
  }
  
  return true;
}

// ======================================================================
// LOAD USER + PROFILE
// ======================================================================
async function loadProfile(user) {
  if (!user) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      console.warn("⚠️ No logged in user.");
      return;
    }
    user = session.user;
  }

  currentUser = user;
  console.log("👤 Loading profile for:", user.email);

  const { data: profiles, error } = await supabase
    .from("community")
    .select("*")
    .eq("user_id", user.id);

  if (error) {
    console.error("❌ Error loading profile:", error);
    // Treat as new user
    currentProfile = null;
    prefillNewUser(user);
    updateUIForNewUser();
    return;
  }

  if (profiles && profiles.length > 0) {
    currentProfile = profiles[0];
    console.log("✅ Profile loaded:", currentProfile);
    fillProfileForm();
    updateProgressBar();
    updateUIForExistingUser();
  } else {
    // No profile exists - new user
    console.log("🆕 No profile found - new user");
    currentProfile = null;
    prefillNewUser(user);
    updateUIForNewUser();
  }
}

// ======================================================================
// POPULATE FORM (EXISTING USER) - FIXED TO INCLUDE ALL FIELDS
// ======================================================================
function fillProfileForm() {
  if (!currentProfile) {
    console.warn("⚠️ No profile to fill");
    return;
  }

  console.log("📝 Filling form with profile data:", currentProfile);

  // Email
  if (emailInput) {
    emailInput.value = currentProfile.email || "";
  }

  // Name splitting
  if (firstNameInput && lastNameInput) {
    const nameParts = (currentProfile.name || "").trim().split(" ");
    firstNameInput.value = nameParts[0] || "";
    lastNameInput.value = nameParts.slice(1).join(" ") || "";
  }

  // Skills
  if (skillsInput) {
    skillsInput.value = currentProfile.skills || "";
  }

  // Bio
  if (bioInput) {
    bioInput.value = currentProfile.bio || "";
  }

  // Availability
  if (availabilityInput) {
    availabilityInput.value = currentProfile.availability || "Available";
  }

  // Interests (handle array field)
  if (interestsInput) {
    if (Array.isArray(currentProfile.interests)) {
      // If interests is an array, join with commas
      interestsInput.value = currentProfile.interests.join(", ");
    } else if (typeof currentProfile.interests === 'string') {
      // If it's already a string
      interestsInput.value = currentProfile.interests;
    } else {
      interestsInput.value = "";
    }
  }

  // Image
  if (previewImg && currentProfile.image_url) {
    previewImg.src = currentProfile.image_url;
    previewImg.classList.remove("hidden");
  }

  // Newsletter
  if (newsletterInput) {
    newsletterInput.checked = currentProfile.newsletter_opt_in ?? false;
  }
  
  console.log("✅ Profile form populated with all fields");
}

// ======================================================================
// PREFILL NEW USER (FROM OAUTH DATA)
// ======================================================================
function prefillNewUser(user) {
  console.log("🆕 Prefilling new user form with OAuth data");

  // Prefill email
  if (user.email && emailInput) {
    emailInput.value = user.email;
  }

  // Try to get name from OAuth metadata
  if (user.user_metadata) {
    const fullName = user.user_metadata.full_name || user.user_metadata.name;
    if (fullName && firstNameInput && lastNameInput) {
      const names = fullName.split(' ');
      firstNameInput.value = names[0] || '';
      lastNameInput.value = names.slice(1).join(' ') || '';
    }

    // Try to get avatar from OAuth
    if (user.user_metadata.avatar_url && previewImg) {
      previewImg.src = user.user_metadata.avatar_url;
      previewImg.classList.remove("hidden");
    }
  }

  console.log("✅ New user info prefilled");
}

// ======================================================================
// UPDATE UI BASED ON USER STATUS
// ======================================================================
function updateUIForExistingUser() {
  if (profileTitle) {
    profileTitle.textContent = "Your Profile";
  }
  if (submitButton) {
    submitButton.textContent = "Update Profile";
  }
  console.log("🔄 UI updated for existing user");
}

function updateUIForNewUser() {
  if (profileTitle) {
    profileTitle.textContent = "Create Your Profile";
  }
  if (submitButton) {
    submitButton.textContent = "Save Profile";
  }
  console.log("🔄 UI updated for new user");
}

// ======================================================================
// PHOTO UPLOAD → SUPABASE STORAGE
// ======================================================================
async function uploadPhoto(file) {
  if (!file) return null;
  if (!currentUser) return null;

  const ext = file.name.split(".").pop();
  const filePath = `avatars/${currentUser.id}/avatar-${Date.now()}.${ext}`;

  console.log("📤 Uploading photo to:", filePath);

  const { error: uploadError } = await supabase.storage
    .from("hacksbucket")
    .upload(filePath, file, { upsert: true });

  if (uploadError) {
    console.error("❌ Upload failed:", uploadError);
    showNotification("Photo upload failed!", "error");
    return null;
  }

  const { data } = supabase.storage.from("hacksbucket").getPublicUrl(filePath);

  console.log("✅ Photo uploaded:", data.publicUrl);
  return data.publicUrl || null;
}

// ======================================================================
// SAVE PROFILE - FIXED TO INCLUDE INTERESTS
// ======================================================================
async function saveProfile(event) {
  event.preventDefault();
  if (!currentUser) {
    console.error("❌ No current user");
    showNotification("Not logged in", "error");
    return;
  }

  console.log("💾 Starting profile save...");
  if (progressMsg) {
    progressMsg.textContent = "Saving…";
    progressMsg.style.color = "#00e0ff";
  }
  if (progressBar) {
    progressBar.style.width = "40%";
  }

  // Disable submit button to prevent double-clicks
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Saving...";
  }

  try {
    let image_url = currentProfile?.image_url || null;

    // Upload photo if selected
    if (photoInput && photoInput.files.length > 0) {
      console.log("📷 Uploading new photo...");
      if (progressMsg) progressMsg.textContent = "Uploading photo…";
      image_url = await uploadPhoto(photoInput.files[0]);
      if (progressBar) progressBar.style.width = "60%";
    }

    // Parse interests (handle comma-separated string → array)
    let interests = [];
    if (interestsInput && interestsInput.value.trim()) {
      interests = interestsInput.value
        .split(',')
        .map(i => i.trim())
        .filter(i => i.length > 0);
    }

    const profileData = {
      name: `${firstNameInput.value} ${lastNameInput.value}`.trim(),
      email: emailInput.value,
      skills: skillsInput.value.trim(),
      interests: interests, // Array field
      bio: bioInput.value.trim(),
      availability: availabilityInput.value,
      image_url,
      newsletter_opt_in: newsletterInput.checked,
      newsletter_opt_in_at: newsletterInput.checked ? new Date().toISOString() : null,
      profile_completed: true,
      updated_at: new Date().toISOString()
    };

    console.log("📤 Updating profile with data:", profileData);
    if (progressMsg) progressMsg.textContent = "Saving profile…";
    if (progressBar) progressBar.style.width = "80%";

    // ALWAYS UPDATE (ensureCommunityUser already created the row)
    const { data: result, error } = await supabase
      .from("community")
      .update(profileData)
      .eq("user_id", currentUser.id)
      .select()
      .single();

    if (error) {
      console.error("❌ Profile save failed:", error);
      showNotification("Profile save failed: " + error.message, "error");
      if (progressMsg) {
        progressMsg.textContent = "Save failed!";
        progressMsg.style.color = "#f00";
      }
      if (progressBar) progressBar.style.width = "0%";
      return;
    }

    currentProfile = result;

    if (progressBar) progressBar.style.width = "100%";
    if (progressMsg) {
      progressMsg.textContent = "Profile saved!";
      progressMsg.style.color = "#0f0";
    }
    
    showNotification("Profile updated successfully!", "success");
    
    // Update UI to reflect existing user
    updateUIForExistingUser();
    updateProgressBar();

    console.log("✅ Profile saved successfully:", result);

  } catch (err) {
    console.error("❌ Exception during save:", err);
    showNotification("An error occurred while saving", "error");
    if (progressMsg) {
      progressMsg.textContent = "Error!";
      progressMsg.style.color = "#f00";
    }
  } finally {
    // Re-enable submit button
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = currentProfile ? "Update Profile" : "Save Profile";
    }
  }
}

// ======================================================================
// PROFILE COMPLETION BAR
// ======================================================================
function updateProgressBar() {
  const p = currentProfile;
  if (!p) {
    if (progressBar) progressBar.style.width = "0%";
    return;
  }

  let score = 0;
  if (p.name && p.name.trim()) score += 20;
  if (p.skills && p.skills.trim()) score += 20;
  if (p.bio && p.bio.trim()) score += 20;
  if (p.image_url) score += 20;
  if (p.availability) score += 20;

  if (progressBar) progressBar.style.width = `${score}%`;
  
  if (progressMsg) {
    if (score === 100) {
      progressMsg.textContent = "✅ Profile Complete!";
      progressMsg.style.color = "#0f0";
    } else {
      progressMsg.textContent = `Profile ${score}% complete`;
      progressMsg.style.color = "#00e0ff";
    }
  }
}

// ======================================================================
// LISTEN FOR LOGIN EVENTS FROM login.js
// ======================================================================
function setupEventListeners() {
  console.log("🎧 Setting up profile event listeners");

  // Event fired by login.js when existing profile is loaded
  window.addEventListener('profile-loaded', (event) => {
    console.log("📨 Received profile-loaded event");
    console.log("📊 Event detail:", event.detail);
    
    const { profile, user } = event.detail;
    currentUser = user;
    currentProfile = profile;
    
    console.log("🔄 Populating form with profile:", profile);
    fillProfileForm();
    updateProgressBar();
    updateUIForExistingUser();
  });

  // Event fired by login.js when new user (no profile)
  window.addEventListener('profile-new', (event) => {
    console.log("📨 Received profile-new event");
    console.log("📊 Event detail:", event.detail);
    
    const { user } = event.detail;
    currentUser = user;
    currentProfile = null;
    prefillNewUser(user);
    updateUIForNewUser();
  });

  // Event fired by login.js when user logs out
  window.addEventListener('user-logged-out', () => {
    console.log("📨 Received user-logged-out event");
    clearProfileState();
  });

  console.log("✅ Profile event listeners attached");
}

// Clear all profile state and form on logout
function clearProfileState() {
  console.log("🧹 Clearing profile state");
  
  currentUser = null;
  currentProfile = null;
  
  // Clear form
  if (form) {
    form.reset();
  }
  
  // Clear preview image
  if (previewImg) {
    previewImg.src = "";
    previewImg.classList.add("hidden");
  }
  
  // Reset progress
  if (progressBar) progressBar.style.width = "0%";
  if (progressMsg) {
    progressMsg.textContent = "Profile 0% complete";
    progressMsg.style.color = "#00e0ff";
  }
  
  console.log("✅ Profile state cleared");
}

// ======================================================================
// LIVE PHOTO PREVIEW
// ======================================================================
function setupPhotoPreview() {
  if (!photoInput || !previewImg) return;
  
  photoInput.addEventListener("change", () => {
    const file = photoInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = e => {
      previewImg.src = e.target.result;
      previewImg.classList.remove("hidden");
    };
    reader.readAsDataURL(file);
  });
  
  console.log("✅ Photo preview handler attached");
}

// ======================================================================
// INIT EXPORT
// ======================================================================
export async function initProfileForm() {
  console.log("👤 Initializing Profile Form…");

  // Initialize DOM references
  if (!initDOMRefs()) {
    console.error("❌ Failed to initialize DOM references");
    return;
  }

  // Setup event listeners for login.js events
  setupEventListeners();

  // Setup photo preview
  setupPhotoPreview();

  // Setup form submit handler
  if (form) {
    form.addEventListener("submit", saveProfile);
    console.log("✅ Form submit handler attached");
  }

  // Load profile for current user (if already logged in)
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    console.log("🔄 User already logged in, loading profile...");
    await loadProfile(session.user);
  }

  console.log("✅ Profile system ready");
}
