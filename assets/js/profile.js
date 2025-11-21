// ======================================================================
// CharlestonHacks Innovation Engine – PROFILE CONTROLLER (2025 FINAL BUILD)
// Fully compatible with:
//   ✔ Supabase user_id linking
//   ✔ Backfill logic (supabaseClient.js)
//   ✔ Login system (login.js FINAL)
//   ✔ Main bootstrap (main.js FINAL)
// ======================================================================

import { supabase } from "./supabaseClient.js";
import { showNotification } from "./utils.js";

// === DOM ELEMENTS ======================================================
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

const autocompleteBox = document.getElementById("autocomplete-skills-input");

const BUCKET = "hacksbucket";

let currentUserId = null;
let existingProfileId = null;
let existingImageUrl = null;

/* ======================================================================
   INIT
====================================================================== */
export async function initProfileForm() {
  const { data } = await supabase.auth.getSession();
  const user = data?.session?.user;

  if (!user) {
    console.warn("[Profile] No authenticated user");
    return;
  }

  currentUserId = user.id;
  await loadExistingProfile();
  setupImagePreview();
  setupSkillAutocomplete();
}

/* ======================================================================
   LOAD PROFILE (user_id OR email) — SAFE FOR MIGRATED USERS
====================================================================== */
async function loadExistingProfile() {
  try {
    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user;
    if (!user) return;

    const email = user.email;

    const { data: row, error } = await supabase
      .from("community")
      .select("*")
      .or(`user_id.eq.${currentUserId},email.eq.${email}`)
      .maybeSingle();

    if (error) throw error;

    if (row) {
      existingProfileId = row.id;
      populateForm(row);
      return;
    }

    // === CREATE DEFAULT PROFILE FOR NEW USERS =========================
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
    populateForm(inserted);

  } catch (err) {
    console.error("[Profile] Load error:", err);
    showNotification("Could not load profile.", "error");
  }
}

/* ======================================================================
   POPULATE FORM
====================================================================== */
function populateForm(row) {
  if (!row) return;

  if (row.name) {
    const parts = row.name.split(" ");
    firstNameInput.value = parts[0] || "";
    lastNameInput.value = parts.slice(1).join(" ");
  }

  emailInput.value = row.email || "";
  skillsInput.value = row.skills || "";
  bioInput.value = row.bio || "";
  availabilityInput.value = row.availability || "";
  newsletterOptInInput.checked = !!row.newsletter_opt_in;

  if (row.image_url) {
    existingImageUrl = row.image_url;
    previewImg.src = row.image_url;
    previewImg.classList.remove("hidden");
  }

  updateProgressState();
}

/* ======================================================================
   SAVE PROFILE
====================================================================== */
profileForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!currentUserId) {
    showNotification("You must be logged in.", "error");
    return;
  }

  const fullName = `${firstNameInput.value.trim()} ${lastNameInput.value.trim()}`;
  const email = emailInput.value.trim();
  const skills = skillsInput.value.trim();
  const bio = bioInput.value.trim();
  const availability = availabilityInput.value.trim();
  const newsletterOptIn = newsletterOptInInput.checked;

  let finalImageUrl = existingImageUrl;

  // === PHOTO UPLOAD ====================================================
  if (photoInput.files?.length > 0) {
    const file = photoInput.files[0];
    const path = `${currentUserId}/${Date.now()}_${file.name}`;

    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { upsert: false });

    if (uploadErr) {
      console.error("[Profile] Upload error:", uploadErr);
      showNotification("Photo upload failed.", "error");
    } else {
      finalImageUrl = supabase.storage.from(BUCKET)
        .getPublicUrl(path).data.publicUrl;
    }
  }

  // === UPDATE COMMUNITY ROW ===========================================
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

    const { error } = await supabase
      .from("community")
      .update(updateData)
      .eq("user_id", currentUserId);

    if (error) throw error;

    existingImageUrl = finalImageUrl;
    showNotification("Profile saved!", "success");

  } catch (err) {
    console.error("[Profile] Save error:", err);
    showNotification("Error saving profile.", "error");
  }

  updateProgressState();
});

/* ======================================================================
   COMPLETENESS CHECK
====================================================================== */
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

/* ======================================================================
   IMAGE PREVIEW
====================================================================== */
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

/* ======================================================================
   SKILL AUTOCOMPLETE
====================================================================== */
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
}
