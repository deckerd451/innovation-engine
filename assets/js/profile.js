// ======================================================================
// CharlestonHacks Innovation Engine – PROFILE CONTROLLER (FIXED 2025)
// Fully compatible with:
//   ✔ Supabase user_id linking
//   ✔ Backfill logic (supabaseClient.js)
//   ✔ Login system (login.js FINAL)
//   ✔ Main bootstrap (main.js FINAL)
//   ✔ Your current table schema
// ======================================================================

import { supabase } from "./supabaseClient.js";
import { showNotification } from "./utils.js";

// ======================================================================
// DOM ELEMENTS
// ======================================================================
let profileForm;
let previewImg;
let firstNameInput;
let lastNameInput;
let emailInput;
let skillsInput;
let bioInput;
let availabilityInput;
let newsletterOptInInput;
let photoInput;
let progressBar;
let progressMsg;
let autocompleteBox;

const BUCKET = "hacksbucket";

let currentUserId = null;
let existingProfileId = null;
let existingImageUrl = null;

// ======================================================================
// INIT
// ======================================================================
export async function initProfileForm() {
  console.log("🧬 Initializing profile form...");

  // Get DOM elements
  profileForm       = document.getElementById("skills-form");
  previewImg        = document.getElementById("preview");
  firstNameInput    = document.getElementById("first-name");
  lastNameInput     = document.getElementById("last-name");
  emailInput        = document.getElementById("email");
  skillsInput       = document.getElementById("skills-input");
  bioInput          = document.getElementById("bio-input");
  availabilityInput = document.getElementById("availability-input");
  newsletterOptInInput = document.getElementById("newsletter-opt-in");
  photoInput        = document.getElementById("photo-input");
  progressBar       = document.querySelector(".profile-bar-inner");
  progressMsg       = document.getElementById("profile-progress-msg");
  autocompleteBox   = document.getElementById("autocomplete-skills-input");

  if (!profileForm) {
    console.error("❌ Profile form not found in DOM");
    return;
  }

  console.log("✅ Profile form DOM elements found");

  // Check for authenticated user
  const { data } = await supabase.auth.getSession();
  const user = data?.session?.user;

  if (!user) {
    console.warn("[Profile] No authenticated user yet");
    return;
  }

  console.log("✅ User authenticated:", user.email);
  currentUserId = user.id;

  await loadExistingProfile();
  setupImagePreview();
  setupSkillAutocomplete();
  setupFormSubmit();
  
  console.log("✅ Profile form fully initialized");
}

// ======================================================================
// SETUP FORM SUBMIT
// ======================================================================
function setupFormSubmit() {
  if (!profileForm) return;

  profileForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    console.log("📝 Profile form submitted");

    if (!currentUserId || !existingProfileId) {
      showNotification("You must be logged in.", "error");
      return;
    }

    const fullName = `${firstNameInput.value.trim()} ${lastNameInput.value.trim()}`;
    const email     = emailInput.value.trim();
    const skills    = skillsInput.value.trim();
    const bio       = bioInput.value.trim();
    const availability = availabilityInput.value.trim();
    const newsletterOptIn = newsletterOptInInput.checked;

    console.log("📋 Form data:", { fullName, email, skills, bio, availability });

    let finalImageUrl = existingImageUrl;

    // --- PHOTO UPLOAD --------------------------------------------------
    if (photoInput.files?.length > 0) {
      console.log("📸 Uploading photo...");
      const file = photoInput.files[0];
      const path = `${currentUserId}/${Date.now()}_${file.name}`;

      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: false });

      if (uploadErr) {
        console.error("[Profile] Upload error:", uploadErr);
        showNotification("Photo upload failed.", "error");
      } else {
        finalImageUrl = supabase.storage
          .from(BUCKET)
          .getPublicUrl(path).data.publicUrl;
        console.log("✅ Photo uploaded:", finalImageUrl);
      }
    }

    // --- UPDATE ROW (always 1 row) -------------------------------------
    try {
      const updateData = {
        user_id: currentUserId,
        email,
        name: fullName,
        skills,
        bio,
        availability,
        image_url: finalImageUrl ?? null,
        newsletter_opt_in: newsletterOptIn,
        newsletter_opt_in_at: newsletterOptIn ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
        profile_completed: isComplete()
      };

      console.log("💾 Updating profile:", existingProfileId);

      const { error } = await supabase
        .from("community")
        .update(updateData)
        .eq("id", existingProfileId);

      if (error) throw error;

      existingImageUrl = finalImageUrl;
      console.log("✅ Profile saved successfully");
      showNotification("Profile saved!", "success");

    } catch (err) {
      console.error("[Profile] Save error:", err);
      showNotification("Error saving profile.", "error");
    }

    updateProgressState();
  });

  console.log("✅ Form submit handler attached");
}

// ======================================================================
// LOAD EXISTING PROFILE (robust + safe for migrated users)
// ======================================================================
async function loadExistingProfile() {
  console.log("🔍 Loading existing profile...");
  
  try {
    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user;
    if (!user) return;

    const email = user.email;

    // --- ALWAYS return at most one row ---
    const { data: rows, error } = await supabase
      .from("community")
      .select("*")
      .or(`user_id.eq.${currentUserId},email.eq.${email}`)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) throw error;

    const row = rows?.[0] || null;

    // --- PROFILE EXISTS ---
    if (row) {
      console.log("✅ Found existing profile:", row.id);
      existingProfileId = row.id;
      populateForm(row);
      return;
    }

    // --- CREATE NEW PROFILE ---
    console.log("➕ Creating new profile...");
    const { data: inserted, error: insertErr } = await supabase
      .from("community")
      .insert({
        user_id: currentUserId,
        email,
        name: email.split("@")[0],
        skills: "",
        bio: "",
        availability: "Available",
        profile_completed: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    existingProfileId = inserted.id;
    console.log("✅ New profile created:", inserted.id);
    populateForm(inserted);

  } catch (err) {
    console.error("[Profile] Load error:", err);
    showNotification("Could not load profile.", "error");
  }
}

// ======================================================================
// POPULATE FORM FIELDS
// ======================================================================
function populateForm(row) {
  if (!row) return;

  console.log("📝 Populating form with existing data");

  if (row.name) {
    const parts = row.name.split(" ");
    firstNameInput.value = parts[0] || "";
    lastNameInput.value  = parts.slice(1).join(" ");
  }

  emailInput.value        = row.email || "";
  skillsInput.value       = row.skills || "";
  bioInput.value          = row.bio || "";
  availabilityInput.value = row.availability || "";
  newsletterOptInInput.checked = !!row.newsletter_opt_in;

  if (row.image_url) {
    existingImageUrl = row.image_url;
    previewImg.src = row.image_url;
    previewImg.classList.remove("hidden");
  }

  updateProgressState();
}

// ======================================================================
// COMPLETENESS LOGIC
// ======================================================================
function isComplete() {
  return (
    firstNameInput.value.trim() &&
    lastNameInput.value.trim() &&
    emailInput.value.trim() &&
    skillsInput.value.trim() &&
    availabilityInput.value.trim()
  );
}

function updateProgressState() {
  if (isComplete()) {
    progressBar.style.width = "100%";
    progressMsg.textContent = "Profile complete!";
    progressMsg.classList.add("profile-complete");
  } else {
    progressBar.style.width = "40%";
    progressMsg.textContent = "Your profile is incomplete.";
    progressMsg.classList.remove("profile-complete");
  }
}

// ======================================================================
// IMAGE PREVIEW
// ======================================================================
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

  console.log("✅ Image preview setup");
}

// ======================================================================
// SKILL AUTOCOMPLETE
// ======================================================================
const COMMON_SKILLS = [
  "javascript", "python", "react", "node", "sql",
  "aws", "design", "typescript", "ui/ux", "css"
];

function setupSkillAutocomplete() {
  skillsInput.addEventListener("input", () => {
    const text = skillsInput.value.toLowerCase();
    const matches = COMMON_SKILLS.filter((s) => s.startsWith(text));

    if (!text || matches.length === 0) {
      autocompleteBox.innerHTML = "";
      return;
    }

    autocompleteBox.innerHTML = matches
      .map((s) => `<div class="autocomplete-item">${s}</div>`)
      .join("");

    document.querySelectorAll(".autocomplete-item").forEach((el) => {
      el.addEventListener("click", () => {
        skillsInput.value = el.textContent;
        autocompleteBox.innerHTML = "";
      });
    });
  });

  console.log("✅ Skill autocomplete setup");
}

console.log("🧬 Profile Controller Loaded (ULTRA-STABLE)");
