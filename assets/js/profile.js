// =============================================================
// CharlestonHacks Innovation Engine – Profile Controller (2025)
// FINAL PRIVATE STORAGE VERSION — Using hacksbucket + signed URLs
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

// PRIVATE bucket
const BUCKET = "hacksbucket";

// Current user
let currentUserId = null;

/* =============================================================
   SKILL HELPERS
============================================================= */
function normalizeSkills(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(s => s.toLowerCase().trim());

  if (typeof raw === "string") {
    return raw
      .split(",")
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);
  }
  return [];
}

export function filterBySkills(users, searchTerms) {
  const terms = searchTerms
    .split(",")
    .map(t => t.trim().toLowerCase())
    .filter(Boolean);

  return users.filter(user => {
    const userSkills = normalizeSkills(user.skills);
    return terms.every(term => userSkills.includes(term));
  });
}

/* =============================================================
   INIT
============================================================= */
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

/* =============================================================
   LOAD EXISTING PROFILE (PRIVATE STORAGE READY)
============================================================= */
async function loadExistingProfile() {
  try {
    const { data, error } = await supabase
      .from("community")
      .select("*")
      .eq("id", currentUserId)
      .maybeSingle();

    if (error) throw error;

    if (data) {
      // Name
      if (data.name) {
        const parts = data.name.split(" ");
        firstNameInput.value = parts[0] || "";
        lastNameInput.value = parts.slice(1).join(" ");
      }

      if (data.email) emailInput.value = data.email;
      if (data.skills) skillsInput.value = data.skills;
      if (data.bio) bioInput.value = data.bio;
      if (data.availability) availabilityInput.value = data.availability;
      if (data.newsletter_opt_in) newsletterOptInInput.checked = true;

      // Load signed URL for image
      if (data.image_path) {
        const { data: signed } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(data.image_path, 60 * 60 * 24 * 7); // 7-day signed URL

        if (signed?.signedUrl) {
          previewImg.src = signed.signedUrl;
          previewImg.classList.remove("hidden");
        }
      }

      updateProgressState();
    }
  } catch (err) {
    console.error("[Profile] Load error:", err);
    showNotification("Could not load profile.", "error");
  }
}

/* =============================================================
   SAVE PROFILE — UPSERT + PRIVATE STORAGE
============================================================= */
profileForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!currentUserId) {
    showNotification("You must be logged in to save your profile.", "error");
    return;
  }

  const name = `${firstNameInput.value.trim()} ${lastNameInput.value.trim()}`.trim();
  const skills = skillsInput.value.trim();
  const bio = bioInput.value.trim();
  const availability = availabilityInput.value;
  const newsletterOptIn = newsletterOptInInput.checked;

  let uploadedImagePath = null; // store internal path (NOT public URL)

  // === Upload photo to PRIVATE bucket ===
  if (photoInput.files.length > 0) {
    const file = photoInput.files[0];
    const filePath = `${currentUserId}/${Date.now()}_${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, file);

    if (uploadError) {
      console.error(uploadError);
      showNotification("Photo upload failed.", "error");
    } else {
      uploadedImagePath = filePath;
    }
  }

  // === UPSERT (Create OR Update) ===
  const updates = {
    id: currentUserId,
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

  if (uploadedImagePath) updates.image_path = uploadedImagePath;

  try {
    const { error } = await supabase
      .from("community")
      .upsert(updates);

    if (error) throw error;

    showNotification("Profile saved successfully!", "success");
  } catch (err) {
    console.error("[Profile] Save error:", err);
    showNotification("Error saving profile.", "error");
  }

  updateProgressState();
});

/* =============================================================
   PROFILE COMPLETION STATE
============================================================= */
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

/* =============================================================
   IMAGE PREVIEW
============================================================= */
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

/* =============================================================
   BASIC SKILL AUTOCOMPLETE
============================================================= */
const COMMON_SKILLS = [
  "python", "javascript", "java", "aws", "react",
  "node", "ui/ux", "design", "sql", "go", "rust",
  "c++", "c#", "html", "css"
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

/* =============================================================
   END OF FILE
============================================================= */
