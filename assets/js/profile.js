// ======================================================================
// CharlestonHacks Innovation Engine – PROFILE CONTROLLER (DEBUG VERSION)
// ======================================================================

import { supabase } from "./supabaseClient.js";
import { showNotification } from "./utils.js";

// DOM
let form, previewImg;
let firstNameInput, lastNameInput, emailInput, skillsInput;
let bioInput, availabilityInput, newsletterInput, photoInput;
let progressBar, progressMsg;
let profileTitle, submitButton;
let interestsInput;

let currentUser = null;
let currentProfile = null;

// ======================================================================
// INITIALIZE DOM REFERENCES WITH DETAILED LOGGING
// ======================================================================
function initDOMRefs() {
  console.log("🔍 Looking for DOM elements...");
  
  form = document.getElementById("skills-form");
  console.log("Form:", form ? "✅ Found" : "❌ Missing");
  
  previewImg = document.getElementById("preview");
  console.log("Preview image:", previewImg ? "✅ Found" : "❌ Missing");

  firstNameInput = document.getElementById("first-name");
  console.log("First name input:", firstNameInput ? "✅ Found" : "❌ Missing");
  
  lastNameInput = document.getElementById("last-name");
  console.log("Last name input:", lastNameInput ? "✅ Found" : "❌ Missing");
  
  emailInput = document.getElementById("email");
  console.log("Email input:", emailInput ? "✅ Found" : "❌ Missing");
  
  skillsInput = document.getElementById("skills-input");
  console.log("Skills input:", skillsInput ? "✅ Found" : "❌ Missing");
  
  bioInput = document.getElementById("bio-input");
  console.log("Bio input:", bioInput ? "✅ Found" : "❌ Missing");
  
  availabilityInput = document.getElementById("availability-input");
  console.log("Availability input:", availabilityInput ? "✅ Found" : "❌ Missing");
  
  newsletterInput = document.getElementById("newsletter-opt-in");
  console.log("Newsletter input:", newsletterInput ? "✅ Found" : "❌ Missing");
  
  photoInput = document.getElementById("photo-input");
  console.log("Photo input:", photoInput ? "✅ Found" : "❌ Missing");

  interestsInput = document.getElementById("interests-input");
  console.log("Interests input:", interestsInput ? "✅ Found" : "❌ Missing (this is OK if you don't have this field)");

  progressBar = document.querySelector(".profile-bar-inner");
  console.log("Progress bar:", progressBar ? "✅ Found" : "❌ Missing");
  
  progressMsg = document.getElementById("profile-progress-msg");
  console.log("Progress message:", progressMsg ? "✅ Found" : "❌ Missing");
  
  profileTitle = document.querySelector("#profile .section-title");
  console.log("Profile title:", profileTitle ? "✅ Found" : "❌ Missing");
  
  submitButton = document.querySelector("#skills-form button[type='submit']");
  console.log("Submit button:", submitButton ? "✅ Found" : "❌ Missing");

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
    currentProfile = null;
    prefillNewUser(user);
    updateUIForNewUser();
    return;
  }

  if (profiles && profiles.length > 0) {
    currentProfile = profiles[0];
    console.log("✅ Profile loaded:", currentProfile);
    console.log("📊 Full profile object:", JSON.stringify(currentProfile, null, 2));
    fillProfileForm();
    updateProgressBar();
    updateUIForExistingUser();
  } else {
    console.log("🆕 No profile found - new user");
    currentProfile = null;
    prefillNewUser(user);
    updateUIForNewUser();
  }
}

// ======================================================================
// POPULATE FORM (EXISTING USER) - ENHANCED DEBUG VERSION
// ======================================================================
function fillProfileForm() {
  if (!currentProfile) {
    console.warn("⚠️ No profile to fill");
    return;
  }

  console.log("📝 Starting to fill form with profile data");
  console.log("📊 Profile data:", currentProfile);

  // Email
  if (emailInput) {
    const emailValue = currentProfile.email || "";
    console.log(`Setting email: "${emailValue}"`);
    emailInput.value = emailValue;
    console.log(`Email input value after setting: "${emailInput.value}"`);
  } else {
    console.warn("⚠️ Email input not found");
  }

  // Name splitting
  if (firstNameInput && lastNameInput) {
    const fullName = currentProfile.name || "";
    console.log(`Full name from DB: "${fullName}"`);
    
    const nameParts = fullName.trim().split(" ");
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";
    
    console.log(`Setting first name: "${firstName}"`);
    firstNameInput.value = firstName;
    console.log(`First name input value after setting: "${firstNameInput.value}"`);
    
    console.log(`Setting last name: "${lastName}"`);
    lastNameInput.value = lastName;
    console.log(`Last name input value after setting: "${lastNameInput.value}"`);
  } else {
    console.warn("⚠️ Name inputs not found");
  }

  // Skills
  if (skillsInput) {
    const skillsValue = currentProfile.skills || "";
    console.log(`Setting skills: "${skillsValue}"`);
    skillsInput.value = skillsValue;
    console.log(`Skills input value after setting: "${skillsInput.value}"`);
  } else {
    console.warn("⚠️ Skills input not found");
  }

  // Bio
  if (bioInput) {
    const bioValue = currentProfile.bio || "";
    console.log(`Setting bio: "${bioValue}"`);
    bioInput.value = bioValue;
    console.log(`Bio input value after setting: "${bioInput.value}"`);
  } else {
    console.warn("⚠️ Bio input not found");
  }

  // Availability
  if (availabilityInput) {
    const availValue = currentProfile.availability || "Available";
    console.log(`Setting availability: "${availValue}"`);
    availabilityInput.value = availValue;
    console.log(`Availability input value after setting: "${availabilityInput.value}"`);
  } else {
    console.warn("⚠️ Availability input not found");
  }

  // Interests (handle array field)
  if (interestsInput) {
    let interestsValue = "";
    if (Array.isArray(currentProfile.interests)) {
      interestsValue = currentProfile.interests.join(", ");
    } else if (typeof currentProfile.interests === 'string') {
      interestsValue = currentProfile.interests;
    }
    console.log(`Setting interests: "${interestsValue}"`);
    interestsInput.value = interestsValue;
    console.log(`Interests input value after setting: "${interestsInput.value}"`);
  } else {
    console.log("ℹ️ Interests input not found (this is OK if you don't have this field)");
  }

  // Image
  if (previewImg && currentProfile.image_url) {
    console.log(`Setting image: "${currentProfile.image_url}"`);
    previewImg.src = currentProfile.image_url;
    previewImg.classList.remove("hidden");
    console.log("✅ Image preview set");
  } else if (!currentProfile.image_url) {
    console.log("ℹ️ No image URL in profile");
  } else {
    console.warn("⚠️ Preview image element not found");
  }

  // Newsletter
  if (newsletterInput) {
    const newsletterValue = currentProfile.newsletter_opt_in ?? false;
    console.log(`Setting newsletter: ${newsletterValue}`);
    newsletterInput.checked = newsletterValue;
    console.log(`Newsletter input checked after setting: ${newsletterInput.checked}`);
  } else {
    console.warn("⚠️ Newsletter input not found");
  }
  
  console.log("✅ Profile form population complete");
  
  // Verify all values were set
  console.log("🔍 Final form values:");
  console.log("  - First Name:", firstNameInput?.value);
  console.log("  - Last Name:", lastNameInput?.value);
  console.log("  - Email:", emailInput?.value);
  console.log("  - Skills:", skillsInput?.value);
  console.log("  - Bio:", bioInput?.value);
  console.log("  - Availability:", availabilityInput?.value);
  console.log("  - Newsletter:", newsletterInput?.checked);
}

// ======================================================================
// PREFILL NEW USER (FROM OAUTH DATA)
// ======================================================================
function prefillNewUser(user) {
  console.log("🆕 Prefilling new user form with OAuth data");

  if (user.email && emailInput) {
    emailInput.value = user.email;
  }

  if (user.user_metadata) {
    const fullName = user.user_metadata.full_name || user.user_metadata.name;
    if (fullName && firstNameInput && lastNameInput) {
      const names = fullName.split(' ');
      firstNameInput.value = names[0] || '';
      lastNameInput.value = names.slice(1).join(' ') || '';
    }

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
// SAVE PROFILE
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

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Saving...";
  }

  try {
    let image_url = currentProfile?.image_url || null;

    if (photoInput && photoInput.files.length > 0) {
      console.log("📷 Uploading new photo...");
      if (progressMsg) progressMsg.textContent = "Uploading photo…";
      image_url = await uploadPhoto(photoInput.files[0]);
      if (progressBar) progressBar.style.width = "60%";
    }

    // Parse interests
    let interests = [];
    if (interestsInput && interestsInput.value.trim()) {
      interests = interestsInput.value
        .split(',')
        .map(i => i.trim())
        .filter(i => i.length > 0);
    }

    const fullName = `${firstNameInput?.value || ""} ${lastNameInput?.value || ""}`.trim();
    
    const profileData = {
      name: fullName,
      email: emailInput?.value || "",
      skills: skillsInput?.value?.trim() || "",
      interests: interests,
      bio: bioInput?.value?.trim() || "",
      availability: availabilityInput?.value || "Available",
      image_url,
      newsletter_opt_in: newsletterInput?.checked || false,
      newsletter_opt_in_at: newsletterInput?.checked ? new Date().toISOString() : null,
      profile_completed: true,
      updated_at: new Date().toISOString()
    };

    console.log("📤 Saving profile with data:", profileData);
    if (progressMsg) progressMsg.textContent = "Saving profile…";
    if (progressBar) progressBar.style.width = "80%";

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

  window.addEventListener('profile-new', (event) => {
    console.log("📨 Received profile-new event");
    console.log("📊 Event detail:", event.detail);
    
    const { user } = event.detail;
    currentUser = user;
    currentProfile = null;
    prefillNewUser(user);
    updateUIForNewUser();
  });

  window.addEventListener('user-logged-out', () => {
    console.log("📨 Received user-logged-out event");
    clearProfileState();
  });

  console.log("✅ Profile event listeners attached");
}

function clearProfileState() {
  console.log("🧹 Clearing profile state");
  
  currentUser = null;
  currentProfile = null;
  
  if (form) {
    form.reset();
  }
  
  if (previewImg) {
    previewImg.src = "";
    previewImg.classList.add("hidden");
  }
  
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

  if (!initDOMRefs()) {
    console.error("❌ Failed to initialize DOM references");
    return;
  }

  setupEventListeners();
  setupPhotoPreview();

  if (form) {
    form.addEventListener("submit", saveProfile);
    console.log("✅ Form submit handler attached");
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    console.log("🔄 User already logged in, loading profile...");
    await loadProfile(session.user);
  }

  console.log("✅ Profile system ready");
}
