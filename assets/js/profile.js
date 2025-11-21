// =============================================================
// CharlestonHacks Innovation Engine – Profile Controller (2025)
// FINAL CLEAN BUILD – USER-ID + EMAIL SAFE LOOKUP
// =============================================================

import { supabase } from "./supabaseClient.js";
import { showNotification } from "./utils.js";

// ------------------------------
// DOM ELEMENTS
// ------------------------------
const profileForm = document.getElementById("skills-form");
const previewImg = document.getElementById("preview");
const firstNameInput = document.getElementById("first-name");
const lastNameInput = document.getElementById("last-name");
const emailInput = document.getElementById("email");
const skillsInput = document.getElementById("skills-input");
const bioInput = document.getElementById("bio-input");
const availabilityInput = document.getElementById("availability-input");
const photoInput = document.getElementById("photo-input");
const newsletterOptInInput = document.getElementById("newsletter-opt-in");

const progressBar = document.querySelector(".profile-bar-inner");
const progressMsg = document.getElementById("profile-progress-msg");

const autocompleteBox = document.getElementById("autocomplete-skills-input");

const BUCKET = "hacksbucket";

let currentUserId = null;
let existingImageUrl = null;
let existingProfileId = null;

/* =============================================================
   INIT
============================================================= */
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

/* =============================================================
   LOAD EXISTING PROFILE (SAFE)
   → Search by user_id OR email (prevents duplicates)
============================================================= */
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

    // ---------- No row exists → Create fresh profile ----------
    const { data: insertData, error: insertErr } = await supabase
      .from("community")
      .insert({
        user_id: currentUserId,
        email: email,
        name: email.split("@")[0],
        bio: "",
        skills: "",
        availability: "Available",
        profile_completed: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    existingProfileId = insertData.id;
    populateForm(insertData);

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
    previewImg.src = existingImageUrl;
    previewImg.classList.remove("hidden");
  }

  updateProgressState();
}

/* =============================================================
   SAVE PROFILE
============================================================= */
profileForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!currentUserId) {
    showNotification("You must be logged in.", "error");
    return;
  }

  const name = `${firstNameInput.value.trim()} ${lastNameInput.value.trim()}`;
  const email = emailInput.value.trim();
  const skills = skillsInput.value.trim();
  const bio = bioInput.value.trim();
  const availability = availabilityInput.value.trim();
  const newsletterOptIn = newsletterOptInInput.checked;

  let finalImageUrl = existingImageUrl;

  // ---------- Upload Photo ----------
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
      finalImageUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    }
  }

  // ---------- Update ----------
  try {
    const updates = {
      user_id: currentUserId,
      email,
      name,
      skills,
      bio,
      availability,
      image_url: finalImageUrl ?? null,
      newsletter_opt_in: !!newsletterOptIn,
      newsletter_opt_in_at: newsletterOptIn ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
      profile_completed: isProfileComplete()
    };

    const { error } = await supabase
      .from("community")
      .update(updates)
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

/* =============================================================
   PROFILE COMPLETENESS CHECK
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
  "html", "css", "sql", "design", "ui/ux"
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
