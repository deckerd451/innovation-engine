// assets/js/profile.js
import { supabase } from "./supabaseClient.js";


export function initProfileForm() {
  const form = document.getElementById("skills-form");
  if (!form) return;

  form.addEventListener("submit", async e => {
    e.preventDefault();

    const firstName = document.getElementById("first-name").value.trim();
    const lastName = document.getElementById("last-name").value.trim();
    const email = document.getElementById("email").value.trim();
    const skills = document.getElementById("skills-input").value.split(",").map(s => s.trim());

    const { error } = await supabase.from("community").insert({
      name: `${firstName} ${lastName}`,
      email,
      skills,
    });

    if (error) {
      alert("Error saving profile: " + error.message);
    } else {
      document.getElementById("success-message").classList.remove("hidden");
    }
  });
}

document.addEventListener("DOMContentLoaded", initProfileForm);
