// ===============================
// PUBLIC VERSION: assets/js/profile.js
// ===============================
// Handles profile creation and image uploads (no authentication).
// Saves directly to Supabase 'community' table with a random ID.
// Also stores a local copy in localStorage for convenience.
// ===============================

import { supabaseClient as supabase } from "./supabaseClient.js";
import { showNotification } from "./utils.js";

const bucketName = "hacksbucket";

// Initialize Profile Form
export function initProfileForm() {
  const form = document.getElementById("skills-form");
  if (!form) return;

  // Prefill local or existing data
  autoFillProfileForm();

  // Handle form submission
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveProfile();
  });

  // Handle photo preview
  const fileInput = document.getElementById("photo-input");
  const previewImg = document.getElementById("preview");
  fileInput?.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) {
      previewImg.classList.add("hidden");
      previewImg.src = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      previewImg.src = event.target.result;
      previewImg.classList.remove("hidden");
    };
    reader.readAsDataURL(file);
  });
}

// ===============================
// Save Profile (no login required)
// ===============================
async function saveProfile() {
  try {
    showNotification("Saving profile…", "info");

    // Collect form data
    const first = document.getElementById("first-name").value.trim();
    const last = document.getElementById("last-name").value.trim();
    const email = document.getElementById("email").value.trim();
    const skills = document.getElementById("skills-input").value.trim();
    const bio = document.getElementById("bio-input").value.trim();
    const newsletter = document.getElementById("newsletter-opt-in").checked;
    const availability = document.getElementById("availability-input").value;
    const file = document.getElementById("photo-input").files[0];

    // Use localStorage ID for persistence
    let localId = localStorage.getItem("guest_id");
    if (!localId) {
      localId = crypto.randomUUID();
      localStorage.setItem("guest_id", localId);
    }

    let image_url = "";

    // Upload photo anonymously (optional)
    if (file) {
      const fileName = `${localId}_${Date.now()}_${file.name}`;
      const { error: uploadErr } = await supabase.storage
        .from(bucketName)
        .upload(fileName, file, { upsert: true });

      if (uploadErr) {
        console.error("[Profile] Image upload failed:", uploadErr.message);
        showNotification("Image upload failed. Check bucket settings.", "error");
      } else {
        const { data: publicData } = supabase.storage
          .from(bucketName)
          .getPublicUrl(fileName);
        image_url = publicData.publicUrl;
      }
    }

    // Build anonymous profile payload
    const payload = {
      id: localId,
      name: `${first} ${last}`,
      email,
      skills,
      bio,
      image_url,
      newsletter,
      availability,
      updated_at: new Date().toISOString(),
    };

    // Save in Supabase
    const { error: upsertError } = await supabase.from("community").upsert(payload);

    if (upsertError) {
      console.error("[Profile] Upsert error:", upsertError);
      showNotification("Error saving profile. Please try again.", "error");
    } else {
      showNotification("✅ Profile saved successfully!", "success");
      localStorage.setItem("guest_profile", JSON.stringify(payload));
    }
  } catch (err) {
    console.error("Profile save failed:", err);
    showNotification("Unexpected error while saving profile.", "error");
  }
}

// ===============================
// Prefill profile (from localStorage)
// ===============================
async function autoFillProfileForm() {
  try {
    const saved = localStorage.getItem("guest_profile");
    if (!saved) return;

    const data = JSON.parse(saved);
    if (!data) return;

    document.getElementById("first-name").value = data.name?.split(" ")[0] || "";
    document.getElementById("last-name").value = data.name?.split(" ")[1] || "";
    document.getElementById("email").value = data.email || "";
    document.getElementById("skills-input").value = data.skills || "";
    document.getElementById("bio-input").value = data.bio || "";
    document.getElementById("newsletter-opt-in").checked = data.newsletter || false;
    document.getElementById("availability-input").value = data.availability || "Available";

    if (data.image_url) {
      const img = document.getElementById("preview");
      img.src = data.image_url;
      img.classList.remove("hidden");
    }

    console.log("[Profile] Prefilled form with local data:", data);
  } catch (err) {
    console.error("[Profile] Prefill error:", err);
  }
}
