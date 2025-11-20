// =====================================================================
// CharlestonHacks – Profile Controller (2025)
// OPTION B: Hybrid tolerant loader (least DB changes, max compatibility)
// Safe for legacy rows (email-only), new rows (user_id), and duplicates
// =====================================================================

import { supabase } from "./supabaseClient.js";
import { showNotification } from "./utils.js";

// ----------------------------------------------------
// DOM elements
// ----------------------------------------------------
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

/* ============================================================
   INIT
============================================================ */
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

/* ============================================================
   OPTION B — TOLERANT HYBRID PROFILE LOADER
   1) Try match by user_id
   2) Fall back to email
   3) If multiple email rows: choose latest + attach user_id
============================================================ */
async function loadExistingProfile() {
  try {
    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user;
    if (!user) return;

    const email = user.email;

    // --------------------------------------------------------
    // STEP 1 — TRY USER_ID MATCH
    // --------------------------------------------------------
    const { data: uidRows, error: uidError } = await supabase
      .from("community")
      .select("*")
      .eq("user_id", currentUserId);

    if (uidError) throw uidError;

    if (uidRows?.length > 0) {
      console.log("✔ Profile matched by user_id");
      const row = uidRows[0];
      existingProfileId = row.id;
      populateForm(row);
      return;
    }

    // --------------------------------------------------------
    // STEP 2 — FALL BACK TO EMAIL MATCH
    // --------------------------------------------------------
    const { data: emailRows, error: emailError } = await supabase
      .from("community")
      .select("*")
      .eq("email", email);

    if (emailError) throw emailError;

    // 0 EXISTING ROWS → CREATE NEW
    if (!emailRows || emailRows.length === 0) {
      console.log("ℹ No profile found → creating fresh row");

      const { data: inserted, error: insertErr } = await supabase
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

      existingProfileId = inserted.id;
      populateForm(inserted);
      return;
    }

    // --------------------------------------------------------
    // STEP 3 — ONE MATCHING EMAIL → LINK user_id
    // --------------------------------------------------------
    if (emailRows.length === 1) {
      console.log("✔ Found single email-based profile");

      const row = emailRows[0];

      // Attach user_id if missing
      if (!row.user_id) {
        console.log("🔗 Linking email row to user_id…");
        await supabase
          .from("community")
          .update({ user_id: currentUserId })
          .eq("id", row.id);
      }

      existingProfileId = row.id;
      populateForm(row);
      return;
    }

    // --------------------------------------------------------
    // STEP 4 — MULTIPLE EMAIL ROWS (DUPLICATES)
    // Pick the newest and attach user_id
    // --------------------------------------------------------
    console.warn("⚠ Duplicate email rows detected:", emailRows.length);

    // Sort by created_at or updated_at
    const sorted = emailRows.sort(
      (a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)
    );

    const chosen = sorted[0];

    console.log("🔎 Using newest profile row:", chosen.id);

    // Attach user_id if needed
    if (!chosen.user_id) {
      console.log("🔗 Linking chosen row to user_id");
      await supabase
        .from("community")
        .update({ user_id: currentUserId })
        .eq("id", chosen.id);
    }

    existingProfileId = chosen.id;
    populateForm(chosen);

  } catch (err) {
    console.error("[Profile] Load error:", err);
    showNotification("Could not load profile", "error");
  }
}

/* ============================================================
   POPULATE FORM
============================================================ */
function populateForm(row) {
  if (!row) return;

  // Split into first + last
  if (row.name) {
    const parts = row.name.split(" ");
    firstNameInput.value = parts[0] || "";
    lastNameInput.value = parts.slice(1).join(" ") || "";
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

/* ============================================================
   SAVE PROFILE
============================================================ */
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

  // ---------- Upload photo ----------
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

  // ---------- Save ----------
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
      .eq("id", existingProfileId);

    if (error) throw error;

    existingImageUrl = finalImageUrl;

    showNotification("Profile saved!", "success");
  } catch (err) {
    console.error("[Profile] Save error:", err);
    showNotification("Error saving profile.", "error");
  }

  updateProgressState();
});

/* ============================================================
   PROFILE COMPLETENESS
============================================================ */
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
  } else {
    progressBar.style.width = "40%";
    progressMsg.textContent = "Your profile is incomplete.";
  }
}

/* ============================================================
   IMAGE PREVIEW
============================================================ */
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

/* ============================================================
   SKILL AUTOCOMPLETE
============================================================ */
const COMMON_SKILLS = ["python", "javascript", "react", "node", "aws", "html", "css", "sql", "design", "ui/ux"];

function setupSkillAutocomplete() {
  skillsInput?.addEventListener("input", () => {
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
