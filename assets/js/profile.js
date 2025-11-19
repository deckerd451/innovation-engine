// =============================================================
// CharlestonHacks Innovation Engine – Profile Controller (2025)
// USER-ID-BASED PROFILE SYSTEM (FINAL + id fix)
// Supports:
//  - Auto-profile creation on first login
//  - Private bucket (hacksbucket)
//  - Signed URL retrieval
//  - Full update with UPSERT using (id + user_id)
// =============================================================

import { supabase } from "./supabaseClient.js";
import { showNotification } from "./utils.js";

// ------------------------------
// DOM ELEMENTS
// ------------------------------
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

// Autocomplete
const autocompleteBox = document.getElementById("autocomplete-skills-input");

// Storage bucket
const BUCKET = "hacksbucket";

// Internal state
let currentUserId = null;
let existingImageUrl = null;
let existingRowId = null;   // 🔥 PRIMARY KEY (id) — FIX ADDED

/* =============================================================
   INIT PROFILE SYSTEM
============================================================= */
export async function initProfileForm() {
  const { data } = await supabase.auth.getSession();
  const user = data?.session?.user;

  if (!user) {
    console.warn("[Profile] No authenticated user. Profile not loaded.");
    return;
  }

  currentUserId = user.id;

  await loadExistingProfile();
  setupImagePreview();
  setupSkillAutocomplete();
}

/* =============================================================
   LOAD EXISTING PROFILE (auto-create if missing)
============================================================= */
async function loadExistingProfile() {
  try {
    const { data: row, error } = await supabase
      .from("community")
      .select("*")
      .eq("user_id", currentUserId)
      .maybeSingle();

    if (error) throw error;

    // ---------- CASE 1: PROFILE EXISTS ----------
    if (row) {
      existingRowId = row.id;             // 🔥 Save primary key
      populateForm(row);
      return;
    }

    // ---------- CASE 2: FIRST LOGIN — CREATE DEFAULT ROW ----------
    console.log("[Profile] No profile row — creating new one...");

    const insertPayload = {
      id: crypto.randomUUID(),            // 🔥 MUST include id
      user_id: currentUserId,
      email: "",
      name: "",
      bio: "",
      skills: "",
      availability: "Available",
      profile_completed: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: createdRow, error: insertErr } = await supabase
      .from("community")
      .insert(insertPayload)
      .select()
      .single();

    if (insertErr) {
      console.error("[Profile] Insert error:", insertErr);
    } else {
      existingRowId = createdRow.id;
      console.log("[Profile] Blank profile row created.");
    }

  } catch (err) {
    console.error("[Profile] Load error:", err);
    showNotification("Could not load profile", "error");
  }
}

/* =============================================================
   POPULATE FORM
============================================================= */
function populateForm(row) {
  if (!row) return;

  // Keep primary key
  existingRowId = row.id;

  // Name
  if (row.name) {
    const parts = row.name.split(" ");
    firstNameInput.value = parts[0] || "";
    lastNameInput.value = parts.slice(1).join(" ");
  }

  // Email
  if (row.email) emailInput.value = row.email;

  // Skills
  if (row.skills) skillsInput.value = row.skills;

  // Bio
  if (row.bio) bioInput.value = row.bio;

  // Availability
  if (row.availability) availabilityInput.value = row.availability;

  // Newsletter Opt-in
  newsletterOptInInput.checked = !!row.newsletter_opt_in;

  // Image
  if (row.image_url) {
    existingImageUrl = row.image_url;
    previewImg.src = existingImageUrl;
    previewImg.classList.remove("hidden");
  }

  updateProgressState();
}

/* =============================================================
   SAVE PROFILE — UPSERT USING id + user_id
============================================================= */
profileForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!currentUserId) {
    showNotification("You must be logged in to save your profile.", "error");
    return;
  }

  const name = `${firstNameInput.value.trim()} ${lastNameInput.value.trim()}`;
  const email = emailInput.value.trim();
  const skills = skillsInput.value.trim();
  const bio = bioInput.value.trim();
  const availability = availabilityInput.value;
  const newsletterOptIn = newsletterOptInInput.checked;

  let finalImageUrl = existingImageUrl;

  // ---------- PHOTO UPLOAD ----------
  if (photoInput.files?.length > 0) {
    const file = photoInput.files[0];
    const path = `${currentUserId}/${Date.now()}_${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { upsert: false });

    if (uploadError) {
      console.error("[Profile] Upload error:", uploadError);
      showNotification("Photo upload failed.", "error");
    } else {
      const { data } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(path);
      finalImageUrl = data.publicUrl;
    }
  }

  // ---------- UPSERT PROFILE ----------
  try {
    const updates = {
      id: existingRowId,                  // 🔥 REQUIRED FOR UPSERT
      user_id: currentUserId,
      email,
      name,
      skills,
      bio,
      availability,
      image_url: finalImageUrl,
      newsletter_opt_in: newsletterOptIn,
      newsletter_opt_in_at: newsletterOptIn ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
      profile_completed: isProfileComplete(),
    };

    const { error } = await supabase
      .from("community")
      .upsert(updates, { onConflict: "user_id" });

    if (error) throw error;

    existingImageUrl = finalImageUrl;

    showNotification("Profile saved successfully!", "success");
  } catch (err) {
    console.error("[Profile] Save error:", err);
    showNotification("Error saving profile.", "error");
  }

  updateProgressState();
});

/* =============================================================
   PROFILE COMPLETENESS
============================================================= */
function isProfileComplete() {
  return (
    firstNameInput.value.trim() &&
    lastNameInput.value.trim() &&
    emailInput.value.trim() &&
    skillsInput.value.trim() &&
    availabilityInput.value
  );
}

function updateProgressState() {
  if (isProfileComplete()) {
    progressBar.style.width = "100%";
    progressMsg.textContent = "Profile complete!";
    progressMsg.classList.add("profile-complete");
    progressMsg.classList.remove("profile-incomplete");
  } else {
    progressBar.style.width = "40%";
    progressMsg.textContent = "Your profile is incomplete.";
    progressMsg.classList.add("profile-incomplete");
    progressMsg.classList.remove("profile-complete");
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
   SKILL AUTOCOMPLETE
============================================================= */
const COMMON_SKILLS = [
  "python", "javascript", "react", "node", "aws",
  "html", "css", "sql", "design", "ui/ux",
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

    document.querySelectorAll(".autocomplete-item").forEach(item => {
      item.addEventListener("click", () => {
        skillsInput.value = item.textContent;
        autocompleteBox.innerHTML = "";
      });
    });
  });
}
