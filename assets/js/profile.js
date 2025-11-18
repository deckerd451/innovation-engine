// =============================================================
// CharlestonHacks Innovation Engine – Profile Controller (2025)
// Fully Rewritten for Schema-A + GitHub Pages ESM Compatibility
// =============================================================

import { supabase } from "./supabaseClient.js";
import { showNotification } from "./utils.js";

// DOM Elements
const profileSection = document.getElementById("profile-section");
const profileForm = document.getElementById("skills-form");
const previewImg = document.getElementById("preview");

// Inputs
const firstNameInput = document.getElementById("first-name");
const lastNameInput = document.getElementById("last-name");
const emailInput = document.getElementById("email");
const skillsInput = document.getElementById("skills-input");
const bioInput = document.getElementById("bio-input");
const availabilityInput = document.getElementById("availability-input");
const photoInput = document.getElementById("photo-input");
const newsletterOptInInput = document.getElementById("newsletter-opt-in");

// UI
const progressBar = document.querySelector(".profile-bar-inner");
const progressMsg = document.getElementById("profile-progress-msg");

// Skill Autocomplete
const autocompleteBox = document.getElementById("autocomplete-skills-input");

// Local cache
let currentUserId = null;

// =============================================================
// INIT
// =============================================================
export async function initProfileForm() {
  const { data } = await supabase.auth.getSession();
  const user = data?.session?.user;

  if (!user) {
    console.warn("[Profile] No user session found.");
    return;
  }

  currentUserId = user.id;

  await loadExistingProfile();
  setupImagePreview();
  setupSkillAutocomplete();
}

// =============================================================
// LOAD EXISTING PROFILE
// =============================================================
async function loadExistingProfile() {
  try {
    const { data, error } = await supabase
      .from("community")
      .select("*")
      .eq("user_id", currentUserId)
      .maybeSingle();

    if (error) throw error;

    if (data) {
      // Name
      if (data.name) {
        const parts = data.name.split(" ");
        firstNameInput.value = parts[0] || "";
        lastNameInput.value = parts.slice(1).join(" ");
      }

      // Email
      if (data.email) emailInput.value = data.email;

      // Skills (text)
      if (data.skills) skillsInput.value = data.skills;

      // Bio
      if (data.bio) bioInput.value = data.bio;

      // Availability
      if (data.availability) availabilityInput.value = data.availability;

      // Newsletter
      if (data.newsletter_opt_in) newsletterOptInInput.checked = true;

      // Image Preview
      if (data.image_url) {
        previewImg.src = data.image_url;
        previewImg.classList.remove("hidden");
      }

      updateProgressState();
    }
  } catch (err) {
    console.error("[Profile] Load error:", err);
    showNotification("Could not load profile.", "error");
  }
}

// =============================================================
// FORM SUBMIT — SAVE PROFILE
// =============================================================
profileForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!currentUserId) {
    showNotification("You must be logged in to save your profile.", "error");
    return;
  }

  const name = `${firstNameInput.value.trim()} ${lastNameInput.value.trim()}`;
  const skills = skillsInput.value.trim(); // TEXT, not JSONB
  const bio = bioInput.value.trim();
  const availability = availabilityInput.value;
  const newsletterOptIn = newsletterOptInInput.checked;

  // Upload photo if present
  let uploadedImageURL = null;

  if (photoInput.files.length > 0) {
    const file = photoInput.files[0];
    const filePath = `${currentUserId}/${Date.now()}_${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from("profile_photos")
      .upload(filePath, file);

    if (uploadError) {
      console.error(uploadError);
      showNotification("Photo upload failed.", "error");
    } else {
      const { data: urlData } = supabase.storage
        .from("profile_photos")
        .getPublicUrl(filePath);

      uploadedImageURL = urlData.publicUrl;
    }
  }

  // Update profile row
  try {
    const updates = {
      name,
      email: emailInput.value.trim(),
      skills,
      bio,
      availability,
      newsletter_opt_in: newsletterOptIn,
      newsletter_opt_in_at: newsletterOptIn ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
      profile_completed: isProfileComplete(),
    };

    if (uploadedImageURL) updates.image_url = uploadedImageURL;

    const { error } = await supabase
      .from("community")
      .update(updates)
      .eq("user_id", currentUserId);

    if (error) throw error;

    showNotification("Profile saved successfully!", "success");
  } catch (err) {
    console.error("[Profile] Update error:", err);
    showNotification("Error saving profile.", "error");
  }

  updateProgressState();
});

// =============================================================
// PROFILE COMPLETENESS CALCULATION
// =============================================================
function isProfileComplete() {
  return (
    firstNameInput.value.trim() &&
    lastNameInput.value.trim() &&
    emailInput.value.trim() &&
    skillsInput.value.trim() &&
    availabilityInput.value.trim()
  );
}

function updateProgressState() {
  const complete = isProfileComplete();

  if (complete) {
    progressBar.style.width = "100%";
    progressMsg.textContent = "Profile complete!";
    progressMsg.classList.remove("profile-incomplete");
    progressMsg.classList.add("profile-complete");
  } else {
    progressBar.style.width = "40%";
    progressMsg.textContent = "Your profile is incomplete.";
    progressMsg.classList.remove("profile-complete");
    progressMsg.classList.add("profile-incomplete");
  }
}

// =============================================================
// IMAGE PREVIEW
// =============================================================
function setupImagePreview() {
  photoInput?.addEventListener("change", () => {
    const file = photoInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      previewImg.src = reader.result;
      previewImg.classList.remove("hidden");
    };
    reader.readAsDataURL(file);
  });
}

// =============================================================
// BASIC SKILL AUTOCOMPLETE
// =============================================================
const COMMON_SKILLS = [
  "python", "javascript", "java", "aws", "react", "node", "ui/ux",
  "design", "sql", "go", "rust", "c++", "c#", "html", "css"
];

function setupSkillAutocomplete() {
  skillsInput?.addEventListener("input", () => {
    const text = skillsInput.value.toLowerCase();
    const match = COMMON_SKILLS.filter((s) => s.startsWith(text));

    if (!text || match.length === 0) {
      autocompleteBox.innerHTML = "";
      return;
    }

    autocompleteBox.innerHTML = match
      .map((s) => `<div class="autocomplete-item">${s}</div>`)
      .join("");

    document.querySelectorAll(".autocomplete-item").forEach((item) => {
      item.addEventListener("click", () => {
        skillsInput.value = item.textContent;
        autocompleteBox.innerHTML = "";
      });
    });
  });
}

// =============================================================
// END OF FILE
// =============================================================
