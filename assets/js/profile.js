// ======================================================================
// CharlestonHacks Innovation Engine – PROFILE CONTROLLER (FINAL 2025)
// Fully aligned with existing community schema
// ======================================================================

import { supabase } from "./supabaseClient.js";
import { showNotification } from "./utils.js";

// DOM
const profileForm = document.getElementById("skills-form");
const previewImg = document.getElementById("preview");

const firstNameInput = document.getElementById("first-name");
const lastNameInput = document.getElementById("last-name");
const emailInput = document.getElementById("email");
const skillsInput = document.getElementById("skills-input");
const bioInput = document.getElementById("bio-input");
const availabilityInput = document.getElementById("availability-input");
const newsletterOptInInput = document.getElementById("newsletter-opt-in");
const photoInput = document.getElementById("photo-input");

const progressBar = document.querySelector(".profile-bar-inner");
const progressMsg = document.getElementById("profile-progress-msg");

// ======================================================================
// Parse Full Name → (first_name + last_name)
// ======================================================================
function buildFullName() {
  const f = firstNameInput.value.trim();
  const l = lastNameInput.value.trim();
  return (f + " " + l).trim();
}

// ======================================================================
// Handle Photo Preview
// ======================================================================
photoInput?.addEventListener("change", () => {
  const file = photoInput.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  previewImg.src = url;
  previewImg.classList.remove("hidden");
});

// ======================================================================
// Upload image to Supabase Storage
// ======================================================================
async function uploadImage(userId) {
  const file = photoInput.files[0];
  if (!file) return null;

  const filePath = `avatars/${userId}-${Date.now()}.${file.name.split(".").pop()}`;

  const { error: uploadErr } = await supabase.storage
    .from("profile-photos")
    .upload(filePath, file, { upsert: true });

  if (uploadErr) {
    console.error("❌ Image upload failed:", uploadErr);
    return null;
  }

  const { data: urlData } = supabase.storage
    .from("profile-photos")
    .getPublicUrl(filePath);

  return urlData.publicUrl || null;
}

// ======================================================================
// Calculate Profile Completion
// ======================================================================
function calculateCompletion() {
  let completed = 0;
  if (firstNameInput.value.trim()) completed++;
  if (lastNameInput.value.trim()) completed++;
  if (emailInput.value.trim()) completed++;
  if (skillsInput.value.trim()) completed++;
  if (bioInput.value.trim()) completed++;
  if (availabilityInput.value.trim()) completed++;

  const percent = Math.round((completed / 6) * 100);
  progressBar.style.width = percent + "%";
  progressMsg.textContent = percent < 100 ? "Profile incomplete" : "Profile complete";

  return percent === 100;
}

// Watch all inputs
[firstNameInput, lastNameInput, emailInput, skillsInput, bioInput, availabilityInput]
  .forEach(input => input?.addEventListener("input", calculateCompletion));

// ======================================================================
// Save Profile to Supabase (UPSERT)
// ======================================================================
async function saveProfile() {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session;
  if (!session) {
    showNotification("You must be logged in.");
    return;
  }

  const userId = session.user.id;
  const email = session.user.email;
  const fullName = buildFullName();

  // Upload image (optional)
  const imageUrl = await uploadImage(userId);

  const payload = {
    user_id: userId,
    email,
    name: fullName,
    skills: skillsInput.value.trim(),
    interests: [], // optional array field
    bio: bioInput.value.trim(),
    availability: availabilityInput.value,
    image_url: imageUrl,
    newsletter_opt_in: newsletterOptInInput.checked,
    profile_completed: calculateCompletion(),
    updated_at: new Date().toISOString()
  };

  // UPSERT based on user_id
  const { error } = await supabase
    .from("community")
    .upsert(payload, { onConflict: "user_id" });

  if (error) {
    console.error("❌ Error saving profile:", error);
    showNotification("Error saving profile.");
    return;
  }

  showNotification("Profile saved successfully!");
}

// ======================================================================
// Init
// ======================================================================
export function initProfileForm() {
  if (!profileForm) {
    console.warn("⚠️ No profile form found on page");
    return;
  }

  profileForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    await saveProfile();
  });

  console.log("👤 Profile form initialized");
}
