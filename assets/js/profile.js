// ======================================================================
// CharlestonHacks Innovation Engine – PROFILE CONTROLLER (FINAL 2025)
// Works with: 
//   ✔ community table (user_id PK, unique email)
//   ✔ RLS: auth.uid() = user_id
//   ✔ supabaseClient.js ensureCommunityUser()
// ======================================================================

import { supabase } from "./supabaseClient.js";
import { showNotification } from "./utils.js";

// DOM ELEMENTS
const form = document.getElementById("skills-form");
const previewImg = document.getElementById("preview");

const firstNameInput = document.getElementById("first-name");
const lastNameInput  = document.getElementById("last-name");
const emailInput     = document.getElementById("email");
const skillsInput    = document.getElementById("skills-input");
const bioInput       = document.getElementById("bio-input");
const availabilityInput = document.getElementById("availability-input");
const newsletterInput = document.getElementById("newsletter-opt-in");

const photoInput = document.getElementById("photo-input");

const progressBar = document.querySelector(".profile-bar-inner");
const progressMsg  = document.getElementById("profile-progress-msg");

let currentUser = null;
let currentProfile = null;

// ======================================================================
// LOAD CURRENT USER + PROFILE
// ======================================================================
async function loadProfile() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    console.warn("No user logged in.");
    return;
  }

  currentUser = session.user;

  const { data, error } = await supabase
    .from("community")
    .select("*")
    .eq("user_id", currentUser.id)
    .single();

  if (error) {
    console.error("❌ profile load error:", error);
    return;
  }

  currentProfile = data;

  fillProfileForm();
  updateProgressBar();
}

// ======================================================================
// FILL FORM WITH EXISTING PROFILE
// ======================================================================
function fillProfileForm() {
  if (!currentProfile) return;

  emailInput.value = currentProfile.email || "";
  
  // Split existing name
  const [first, ...rest] = (currentProfile.name || "").split(" ");
  firstNameInput.value = first || "";
  lastNameInput.value = rest.join(" ") || "";

  skillsInput.value = currentProfile.skills || "";
  bioInput.value = currentProfile.bio || "";
  availabilityInput.value = currentProfile.availability || "Available";

  previewImg.src = currentProfile.image_url || "";
  if (currentProfile.image_url) previewImg.classList.remove("hidden");

  newsletterInput.checked = currentProfile.newsletter_opt_in ?? false;
}

// ======================================================================
// PHOTO UPLOAD → SUPABASE STORAGE
// ======================================================================
async function uploadPhoto(file) {
  if (!file) return null;
  if (!currentUser) return null;

  const filePath = `avatars/${currentUser.id}-${Date.now()}.png`;

  const { error: uploadError } = await supabase.storage
    .from("hacksbucket")
    .upload(filePath, file, { upsert: true });

  if (uploadError) {
    console.error("❌ photo upload error:", uploadError);
    showNotification("Photo upload failed", "error");
    return null;
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("profile-photos").getPublicUrl(filePath);

  return publicUrl;
}

// ======================================================================
// SAVE PROFILE
// ======================================================================
async function saveProfile(e) {
  e.preventDefault();
  if (!currentUser) return;

  progressMsg.textContent = "Saving...";
  progressBar.style.width = "40%";

  // Handle photo upload if selected
  let image_url = currentProfile?.image_url || null;
  if (photoInput.files.length > 0) {
    image_url = await uploadPhoto(photoInput.files[0]);
  }

  const updated = {
    name: `${firstNameInput.value} ${lastNameInput.value}`.trim(),
    email: emailInput.value,
    skills: skillsInput.value.trim(),
    bio: bioInput.value.trim(),
    availability: availabilityInput.value,
    image_url,
    newsletter_opt_in: newsletterInput.checked,
    profile_completed: true,
  };

  const { data, error } = await supabase
    .from("community")
    .update(updated)
    .eq("user_id", currentUser.id)
    .select()
    .single();

  if (error) {
    console.error("❌ Profile update failed:", error);
    showNotification("Profile update failed!", "error");
    return;
  }

  currentProfile = data;

  progressBar.style.width = "100%";
  progressMsg.textContent = "Profile saved!";
  showNotification("Profile updated successfully!", "success");
}

// ======================================================================
// UPDATE COMPLETION PROGRESS
// ======================================================================
function updateProgressBar() {
  if (!currentProfile) return;

  let score = 0;
  if (currentProfile.name) score += 20;
  if (currentProfile.skills) score += 20;
  if (currentProfile.bio) score += 20;
  if (currentProfile.image_url) score += 20;
  if (currentProfile.availability) score += 20;

  progressBar.style.width = `${score}%`;
}

// ======================================================================
// LIVE PREVIEW FOR PHOTO
// ======================================================================
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

// ======================================================================
// INIT
// ======================================================================
export async function initProfileForm() {
  console.log("👤 Initializing Profile Form…");

  await loadProfile();
  form.addEventListener("submit", saveProfile);

  console.log("👤 Profile system ready.");
}
