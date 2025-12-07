// ======================================================================
// CharlestonHacks Innovation Engine — PROFILE CONTROLLER (COMPLETE 2025)
// Works with:
//   ✓ community table
//   ✓ RLS: auth.uid() = user_id
//   ✓ Storage bucket: hacksbucket
//   ✓ Login.js custom events
//   ✓ Auto-populate for existing users
//   ✓ Dynamic title/button text
//   ✓ FIXED: Always UPDATE (ensureCommunityUser creates row)
// ======================================================================

import { supabase } from "./supabaseClient.js";
import { showNotification } from "./utils.js";

// DOM
let form, previewImg;
let firstNameInput, lastNameInput, emailInput, skillsInput;
let bioInput, availabilityInput, newsletterInput, photoInput;
let progressBar, progressMsg;
let profileTitle, submitButton;

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

  const { data, error } = await supabase
    .from("community")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No profile exists - new user
      console.log("🆕 No profile found - new user");
      currentProfile = null;
      prefillNewUser(user);
      updateUIForNewUser();
      return;
    }
    console.error("❌ Error loading profile:", error);
    return;
  }

  currentProfile = data;
  console.log("✅ Profile loaded:", currentProfile.name);
  fillProfileForm();
  updateProgressBar();
  updateUIForExistingUser();
}

// ======================================================================
// POPULATE FORM (EXISTING USER)
// ======================================================================
function fillProfileForm() {
  if (!currentProfile) return;

  emailInput.value = currentProfile.email || "";

  // Name splitting
  const nameParts = (currentProfile.name || "").trim().split(" ");
  firstNameInput.value = nameParts[0] || "";
  lastNameInput.value = nameParts.slice(1).join(" ") || "";

  skillsInput.value = currentProfile.skills || "";
  bioInput.value = currentProfile.bio || "";
  availabilityInput.value = currentProfile.availability || "Available";

  if (currentProfile.image_url) {
    previewImg.src = currentProfile.image_url;
    previewImg.classList.remove("hidden");
  }

  newsletterInput.checked = currentProfile.newsletter_opt_in ?? false;
  
  console.log("✅ Profile form populated");
}

// ======================================================================
// PREFILL NEW USER (FROM OAUTH DATA)
// ======================================================================
function prefillNewUser(user) {
  // Prefill email
  if (user.email) {
    emailInput.value = user.email;
  }

  // Try to get name from OAuth metadata
  if (user.user_metadata) {
    const fullName = user.user_metadata.full_name || user.user_metadata.name;
    if (fullName) {
      const names = fullName.split(' ');
      firstNameInput.value = names[0] || '';
      lastNameInput.value = names.slice(1).join(' ') || '';
    }

    // Try to get avatar from OAuth
    if (user.user_metadata.avatar_url) {
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
  console.log("📝 UI updated for existing user");
}

function updateUIForNewUser() {
  if (profileTitle) {
    profileTitle.textContent = "Create Your Profile";
  }
  if (submitButton) {
    submitButton.textContent = "Save Profile";
  }
  console.log("📝 UI updated for new user");
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
// SAVE PROFILE (ALWAYS UPDATE - ensureCommunityUser creates row)
// ======================================================================
async function saveProfile(event) {
  event.preventDefault();
  if (!currentUser) {
    console.error("❌ No current user");
    showNotification("Not logged in", "error");
    return;
  }

  console.log("💾 Starting profile save...");
  progressMsg.textContent = "Saving…";
  progressMsg.style.color = "#00e0ff";
  progressBar.style.width = "40%";

  // Disable submit button to prevent double-clicks
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Saving...";
  }

  try {
    let image_url = currentProfile?.image_url || null;

    // Upload photo if selected
    if (photoInput.files.length > 0) {
      console.log("📷 Uploading new photo...");
      progressMsg.textContent = "Uploading photo…";
      image_url = await uploadPhoto(photoInput.files[0]);
      progressBar.style.width = "60%";
    }

    const profileData = {
      name: `${firstNameInput.value} ${lastNameInput.value}`.trim(),
      email: emailInput.value,
      skills: skillsInput.value.trim(),
      bio: bioInput.value.trim(),
      availability: availabilityInput.value,
      image_url,
      newsletter_opt_in: newsletterInput.checked,
      newsletter_opt_in_at: newsletterInput.checked ? new Date().toISOString() : null,
      profile_completed: true,
      updated_at: new Date().toISOString()
    };

    console.log("📤 Updating profile with data:", profileData);
    progressMsg.textContent = "Saving profile…";
    progressBar.style.width = "80%";

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
      progressMsg.textContent = "Save failed!";
      progressMsg.style.color = "#f00";
      progressBar.style.width = "0%";
      return;
    }

    currentProfile = result;

    progressBar.style.width = "100%";
    progressMsg.textContent = "Profile saved!";
    progressMsg.style.color = "#0f0";
    
    showNotification("Profile updated successfully!", "success");
    
    // Update UI to reflect existing user
    updateUIForExistingUser();
    updateProgressBar();

    console.log("✅ Profile saved successfully:", result);

  } catch (err) {
    console.error("❌ Exception during save:", err);
    showNotification("An error occurred while saving", "error");
    progressMsg.textContent = "Error!";
    progressMsg.style.color = "#f00";
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
    progressBar.style.width = "0%";
    return;
  }

  let score = 0;
  if (p.name && p.name.trim()) score += 20;
  if (p.skills && p.skills.trim()) score += 20;
  if (p.bio && p.bio.trim()) score += 20;
  if (p.image_url) score += 20;
  if (p.availability) score += 20;

  progressBar.style.width = `${score}%`;
  
  if (score === 100) {
    progressMsg.textContent = "✅ Profile Complete!";
    progressMsg.style.color = "#0f0";
  } else {
    progressMsg.textContent = `Profile ${score}% complete`;
    progressMsg.style.color = "#00e0ff";
  }
}

// ======================================================================
// LISTEN FOR LOGIN EVENTS FROM login.js
// ======================================================================
function setupEventListeners() {
  // Event fired by login.js when existing profile is loaded
  window.addEventListener('profile-loaded', (event) => {
    console.log("📨 Received profile-loaded event");
    const { profile, user } = event.detail;
    currentUser = user;
    currentProfile = profile;
    fillProfileForm();
    updateProgressBar();
    updateUIForExistingUser();
  });

  // Event fired by login.js when new user (no profile)
  window.addEventListener('profile-new', (event) => {
    console.log("📨 Received profile-new event");
    const { user } = event.detail;
    currentUser = user;
    currentProfile = null;
    prefillNewUser(user);
    updateUIForNewUser();
  });
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
    await loadProfile(session.user);
  }

  console.log("✅ Profile system ready");
}
