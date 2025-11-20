// ============================================================================
// CharlestonHacks – Profile Controller (2025 FINAL, HARDENED, OPTION B)
// ----------------------------------------------------------------------------
// ✓ No duplicates
// ✓ No blank rows
// ✓ Fully compatible with backfill logic in supabaseClient.js
// ✓ Uses user_id as the ONLY authoritative lookup
// ✓ Falls back to email ONLY for old pre-auth profiles
// ✓ Safe against NULL email bugs
// ✓ Matches your actual community table columns
// ============================================================================

import { supabase } from "./supabaseClient.js";
import { showNotification } from "./utils.js";

// DOM References
const form = document.getElementById("skills-form");
const firstNameInput = document.getElementById("first-name");
const lastNameInput = document.getElementById("last-name");
const emailInput = document.getElementById("email");
const skillsInput = document.getElementById("skills-input");
const bioInput = document.getElementById("bio-input");
const availabilityInput = document.getElementById("availability-input");
const newsletterOptInInput = document.getElementById("newsletter-opt-in");
const photoInput = document.getElementById("photo-input");
const previewImg = document.getElementById("preview");

const progressBar = document.querySelector(".profile-bar-inner");
const progressMsg = document.getElementById("profile-progress-msg");
const autocompleteBox = document.getElementById("autocomplete-skills-input");

let currentUserId = null;
let communityRowId = null;
let existingImageUrl = null;

const BUCKET = "hacksbucket";

/* ============================================================================
   INIT
============================================================================ */
export async function initProfileForm() {
  const { data } = await supabase.auth.getSession();
  const user = data?.session?.user;

  if (!user) {
    console.warn("[Profile] No authenticated user yet.");
    return;
  }

  currentUserId = user.id;

  // Load existing profile (Option B — WITH EMAIL BACKFILL)
  await loadProfile();

  setupImagePreview();
  setupSkillAutocomplete();
}

/* ============================================================================
   LOAD PROFILE (HARDENED)
   → 1. Try lookup by user_id
   → 2. If none, try email for pre-auth rows
   → 3. If found-by-email and user_id is NULL → attach user_id
   → 4. Only create a new row on SAVE, not automatically
============================================================================ */
async function loadProfile() {
  try {
    const { data: authUser } = await supabase.auth.getUser();
    const email = authUser?.user?.email;

    if (!email) {
      console.error("⚠ Profile load aborted — missing email in auth session");
      return;
    }

    // --- Step 1: lookup by user_id ---
    const { data: byId } = await supabase
      .from("community")
      .select("*")
      .eq("user_id", currentUserId)
      .maybeSingle();

    if (byId) {
      communityRowId = byId.id;
      existingImageUrl = byId.image_url;
      populateForm(byId);
      return;
    }

    // --- Step 2: lookup by email (old pre-auth rows) ---
    const { data: byEmail } = await supabase
      .from("community")
      .select("*")
      .eq("email", email)
      .is("user_id", null)
      .maybeSingle();

    if (byEmail) {
      // Attach user_id (Option B)
      const { error: updateErr } = await supabase
        .from("community")
        .update({ user_id: currentUserId })
        .eq("id", byEmail.id);

      if (updateErr) console.error("[Backfill] error:", updateErr);

      communityRowId = byEmail.id;
      existingImageUrl = byEmail.image_url;
      populateForm({ ...byEmail, user_id: currentUserId });
      return;
    }

    // --- Step 3: No row found — leave form blank.
    // Only create row when user hits SAVE.
    console.log("ℹ No existing profile. User will create one on Save.");
    emailInput.value = email;

  } catch (err) {
    console.error("[Profile] Load failed:", err);
  }
}

/* ============================================================================
   POPULATE FORM
============================================================================ */
function populateForm(row) {
  if (!row) return;

  // NAME
  if (row.name) {
    const parts = row.name.split(" ");
    firstNameInput.value = parts[0] || "";
    lastNameInput.value = parts.slice(1).join(" ");
  }

  emailInput.value = row.email || "";
  skillsInput.value = row.skills || "";
  bioInput.value = row.bio || "";
  availabilityInput.value = row.availability || "Available";
  newsletterOptInInput.checked = !!row.newsletter_opt_in;

  // IMAGE
  if (row.image_url) {
    existingImageUrl = row.image_url;
    previewImg.src = existingImageUrl;
    previewImg.classList.remove("hidden");
  }

  updateProgressUI();
}

/* ============================================================================
   SAVE PROFILE (HARDENED)
============================================================================ */
form?.addEventListener("submit", async (e) => {
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

  // --- Upload New Photo ---
  if (photoInput.files?.length > 0) {
    const file = photoInput.files[0];
    const storagePath = `${currentUserId}/${Date.now()}_${file.name}`;

    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, file, { upsert: false });

    if (uploadErr) {
      showNotification("Image upload failed.", "error");
      console.error(uploadErr);
    } else {
      finalImageUrl =
        supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;
    }
  }

  // Prepare updates
  const updates = {
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
    profile_completed: isProfileComplete()
  };

  try {
    let error;

    // --- UPDATE existing row ---
    if (communityRowId) {
      ({ error } = await supabase
        .from("community")
        .update(updates)
        .eq("id", communityRowId));
    }

    // --- CREATE new row (first-time users) ---
    else {
      const { data: inserted, error: insertErr } = await supabase
        .from("community")
        .insert([updates])
        .select()
        .single();

      if (insertErr) throw insertErr;
      communityRowId = inserted.id;
      existingImageUrl = inserted.image_url;
    }

    if (error) throw error;

    showNotification("Profile saved!", "success");
    updateProgressUI();

  } catch (err) {
    console.error("[Profile] Save failed:", err);
    showNotification("Could not save your profile.", "error");
  }
});

/* ============================================================================
   PROFILE COMPLETION
============================================================================ */
function isProfileComplete() {
  return (
    firstNameInput.value.trim() &&
    lastNameInput.value.trim() &&
    emailInput.value.trim() &&
    skillsInput.value.trim() &&
    availabilityInput.value.trim()
  );
}

function updateProgressUI() {
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

/* ============================================================================
   IMAGE PREVIEW
============================================================================ */
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

/* ============================================================================
   SKILL AUTOCOMPLETE
============================================================================ */
const COMMON_SKILLS = [
  "python", "javascript", "react", "node",
  "aws", "html", "css", "sql", "design", "ui/ux"
];

function setupSkillAutocomplete() {
  skillsInput?.addEventListener("input", () => {
    const text = skillsInput.value.toLowerCase();
    const match = COMMON_SKILLS.filter(s => s.startsWith(text));

    if (!text || match.length === 0) {
      autocompleteBox.innerHTML = "";
      return;
    }

    autocompleteBox.innerHTML = match
      .map(s => `<div class="autocomplete-item">${s}</div>`)
      .join("");

    document.querySelectorAll(".autocomplete-item").forEach(item => {
      item.addEventListener("click", () => {
        skillsInput.value = item.textContent;
        autocompleteBox.innerHTML = "";
      });
    });
  });
}
