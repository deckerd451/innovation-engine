// assets/js/synapse/themes.js
import { showSynapseNotification, escapeHtml } from "./ui.js";

// Minimal “theme node” shape used in rendering.
export async function fetchActiveThemes(supabase) {
  // MVP query: you can refine status/is_active later.
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("theme_circles")
    .select("id, title, tags, created_at, expires_at")
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("⚠️ fetchActiveThemes failed:", error);
    return [];
  }

  return (data || []).map(t => ({
    id: `theme:${t.id}`,
    theme_id: t.id,
    type: "theme",
    name: t.title,
    title: t.title,
    tags: t.tags || [],
    expires_at: t.expires_at,
    // Position near center (will be stabilized by simulation if you choose)
    x: window.innerWidth * 0.5 + (Math.random() * 120 - 60),
    y: window.innerHeight * 0.5 + (Math.random() * 120 - 60),
  }));
}

export async function getThemeInterestCount(supabase, themeId) {
  const { count, error } = await supabase
    .from("theme_participants")
    .select("id", { count: "exact", head: true })
    .eq("theme_id", themeId);

  if (error) return 0;
  return count || 0;
}

export async function markInterested(supabase, { themeId, communityId }) {
  const { error } = await supabase
    .from("theme_participants")
    .insert([{
      theme_id: themeId,
      community_id: communityId,
      signals: "interested",
      engagement_level: "observer"
    }]);

  if (error) throw error;
}

export async function upgradeEngagement(supabase, { themeId, communityId, newLevel }) {
  // Validate engagement levels
  const validLevels = ["observer", "interested", "active", "leading"];
  if (!validLevels.includes(newLevel)) {
    throw new Error("Invalid engagement level");
  }

  const { error } = await supabase
    .from("theme_participants")
    .update({
      engagement_level: newLevel,
      signals: newLevel === "observer" ? "interested" : "active"
    })
    .eq("theme_id", themeId)
    .eq("community_id", communityId);

  if (error) throw error;
}

export async function renderThemeOverlayCard({ themeNode, interestCount, onInterested, participants = [], currentUserEngagement = null }) {
  // Lightweight card so we don't depend on node-panel changes yet
  const existing = document.getElementById("synapse-theme-card");
  if (existing) existing.remove();

  const card = document.createElement("div");
  card.id = "synapse-theme-card";
  card.className = "synapse-profile-card"; // reuse your existing styling class
  card.style.maxWidth = "420px";

  // Calculate time remaining
  const now = Date.now();
  const expires = new Date(themeNode.expires_at).getTime();
  const remaining = expires - now;
  const hoursRemaining = Math.floor(remaining / (1000 * 60 * 60));
  const daysRemaining = Math.floor(hoursRemaining / 24);
  const timeText = daysRemaining > 1 ? `${daysRemaining} days left` : `${hoursRemaining} hours left`;

  // Engagement level info
  const engagementLevels = {
    observer: { icon: "👀", label: "Observer", color: "rgba(255,255,255,0.5)", next: "interested" },
    interested: { icon: "⭐", label: "Interested", color: "rgba(0,224,255,0.7)", next: "active" },
    active: { icon: "⚡", label: "Active", color: "rgba(0,255,136,0.8)", next: "leading" },
    leading: { icon: "👑", label: "Leading", color: "rgba(255,215,0,0.9)", next: null }
  };

  const currentLevel = currentUserEngagement ? engagementLevels[currentUserEngagement] : null;

  // Render participant avatars (first 5)
  const participantHTML = participants.slice(0, 5).map(p => {
    if (p.image_url) {
      return `<img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}" class="participant-avatar" style="width:32px; height:32px; border-radius:50%; border:2px solid rgba(0,224,255,0.4); margin-right:4px;" title="${escapeHtml(p.name)}">`;
    } else {
      const initials = p.name ? p.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '?';
      return `<div class="participant-avatar" style="width:32px; height:32px; border-radius:50%; border:2px solid rgba(0,224,255,0.4); background:rgba(0,224,255,0.2); display:inline-flex; align-items:center; justify-content:center; margin-right:4px; font-size:12px; font-weight:bold; color:#00e0ff;" title="${escapeHtml(p.name)}">${initials}</div>`;
    }
  }).join('');

  const moreParticipants = participants.length > 5 ? `<span style="color:rgba(255,255,255,0.6); font-size:12px;">+${participants.length - 5} more</span>` : '';

  card.innerHTML = `
    <button class="synapse-card-close" aria-label="Close">
      <i class="fas fa-times"></i>
    </button>

    <div class="synapse-card-header">
      <div class="synapse-card-avatar-fallback" style="background: rgba(0,224,255,0.12); border: 1px solid rgba(0,224,255,0.35); font-size:32px;">
        ✨
      </div>
      <div class="synapse-card-info">
        <h3>${escapeHtml(themeNode.title)}</h3>
        <span class="synapse-availability">Theme Circle • ${timeText}</span>
      </div>
    </div>

    ${themeNode.description ? `
    <div class="synapse-card-bio" style="margin-bottom:1rem;">
      ${escapeHtml(themeNode.description)}
    </div>
    ` : ''}

    <div class="synapse-card-bio">
      <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.75rem;">
        <strong style="color:#00e0ff;">${interestCount}</strong>
        <span style="opacity:0.9;">interested</span>
      </div>

      ${participants.length > 0 ? `
        <div style="margin-bottom:1rem;">
          <div style="font-size:11px; opacity:0.7; margin-bottom:0.5rem; text-transform:uppercase;">Participants</div>
          <div style="display:flex; align-items:center; flex-wrap:wrap;">
            ${participantHTML}
            ${moreParticipants}
          </div>
        </div>
      ` : ''}

      ${themeNode.tags?.length ? `
        <div style="margin-top:0.75rem;">
          <div style="font-size:11px; opacity:0.7; margin-bottom:0.5rem; text-transform:uppercase;">Tags</div>
          <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
            ${themeNode.tags.map(tag => `
              <span style="background:rgba(0,224,255,0.15); border:1px solid rgba(0,224,255,0.3); padding:0.25rem 0.5rem; border-radius:4px; font-size:11px; color:#00e0ff;">
                ${escapeHtml(tag)}
              </span>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>

    ${currentLevel ? `
      <div class="synapse-card-bio" style="margin-top:1rem; padding:1rem; background:rgba(${currentLevel.color},0.1); border-left:3px solid ${currentLevel.color}; border-radius:4px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
          <div>
            <div style="font-size:11px; opacity:0.7; text-transform:uppercase; margin-bottom:0.25rem;">Your Engagement</div>
            <div style="font-size:1rem; font-weight:bold; color:${currentLevel.color};">
              ${currentLevel.icon} ${currentLevel.label}
            </div>
          </div>
          ${currentLevel.next ? `
            <button id="btn-upgrade-engagement" data-next-level="${currentLevel.next}"
              style="padding:0.5rem 1rem; background:linear-gradient(135deg, rgba(0,224,255,0.2), rgba(0,255,136,0.2));
                     border:1px solid rgba(0,255,136,0.5); border-radius:6px; color:#00ff88;
                     cursor:pointer; font-weight:700; font-size:0.85rem;">
              <i class="fas fa-arrow-up"></i> Upgrade
            </button>
          ` : `
            <span style="padding:0.5rem 1rem; background:rgba(255,215,0,0.2); border:1px solid rgba(255,215,0,0.5);
                         border-radius:6px; color:#ffd700; font-weight:700; font-size:0.85rem;">
              <i class="fas fa-crown"></i> Max Level
            </span>
          `}
        </div>
        ${currentLevel.next ? `
          <div style="font-size:0.75rem; opacity:0.7;">
            Upgrade to ${engagementLevels[currentLevel.next].icon} ${engagementLevels[currentLevel.next].label} to show deeper commitment
          </div>
        ` : ''}
      </div>
    ` : ''}

    <div class="synapse-card-actions">
      ${!currentLevel ? `
        <button class="synapse-connect-btn" id="theme-interested-btn">
          <i class="fas fa-star"></i> Signal Interest
        </button>
      ` : ''}
      <button class="synapse-connect-btn" id="theme-add-project-btn" style="background:rgba(0,224,255,0.2); border-color:rgba(0,224,255,0.5);">
        <i class="fas fa-plus-circle"></i> Add Project to Theme
      </button>
      ${themeNode.cta_text && themeNode.cta_link ? `
        <button class="synapse-connect-btn" style="background:rgba(255,107,107,0.2); border-color:rgba(255,107,107,0.5);" onclick="window.open('${escapeHtml(themeNode.cta_link)}', '_blank')">
          <i class="fas fa-external-link-alt"></i> ${escapeHtml(themeNode.cta_text)}
        </button>
      ` : ''}
    </div>
  `;

  card.querySelector(".synapse-card-close")?.addEventListener("click", () => card.remove());
  card.querySelector("#theme-interested-btn")?.addEventListener("click", onInterested);

  // Add Project to Theme button
  card.querySelector("#theme-add-project-btn")?.addEventListener("click", async () => {
    try {
      await showAddProjectToThemeModal(themeNode);
    } catch (error) {
      console.error("Failed to open add project modal:", error);
      showSynapseNotification(error.message || "Failed to open modal", "error");
    }
  });

  // Engagement upgrade button
  const upgradeBtn = card.querySelector("#btn-upgrade-engagement");
  if (upgradeBtn) {
    upgradeBtn.addEventListener("click", async () => {
      const nextLevel = upgradeBtn.dataset.nextLevel;
      if (!nextLevel) return;

      try {
        const supabase = window.supabase;
        if (!supabase) throw new Error("Supabase not available");

        // Get current user's community ID
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not logged in");

        const { data: profile } = await supabase
          .from("community")
          .select("id")
          .eq("user_id", user.id)
          .single();

        if (!profile) throw new Error("Profile not found");

        await upgradeEngagement(supabase, {
          themeId: themeNode.theme_id,
          communityId: profile.id,
          newLevel: nextLevel
        });

        showSynapseNotification(`Upgraded to ${nextLevel}! 🎉`, "success");

        // Re-render card with new engagement level
        card.remove();
        await renderThemeOverlayCard({
          themeNode,
          interestCount,
          participants,
          onInterested,
          currentUserEngagement: nextLevel
        });

      } catch (error) {
        console.error("Failed to upgrade engagement:", error);
        showSynapseNotification(error.message || "Failed to upgrade", "error");
      }
    });
  }

  document.getElementById("synapse-main-view")?.appendChild(card);
}

// Show modal to add existing projects to a theme
async function showAddProjectToThemeModal(themeNode) {
  const supabase = window.supabase;
  if (!supabase) throw new Error("Supabase not available");

  // Get current user's projects that aren't already in this theme
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not logged in");

  const { data: profile } = await supabase
    .from("community")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!profile) throw new Error("Profile not found");

  // Get user's projects
  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, title, description, theme_id")
    .eq("creator_id", profile.id)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error) throw error;

  if (!projects || projects.length === 0) {
    showSynapseNotification("You don't have any projects yet. Create one first!", "info");
    return;
  }

  // Filter out projects already in this theme
  const availableProjects = projects.filter(p => p.theme_id !== themeNode.theme_id);

  if (availableProjects.length === 0) {
    showSynapseNotification("All your projects are already in this theme!", "info");
    return;
  }

  // Create modal
  const existing = document.getElementById("add-project-theme-modal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "add-project-theme-modal";
  modal.className = "synapse-profile-card";
  modal.style.maxWidth = "500px";
  modal.style.maxHeight = "80vh";
  modal.style.overflowY = "auto";

  modal.innerHTML = `
    <button class="synapse-card-close" aria-label="Close">
      <i class="fas fa-times"></i>
    </button>

    <div class="synapse-card-header">
      <div class="synapse-card-avatar-fallback" style="background: rgba(0,224,255,0.12); border: 1px solid rgba(0,224,255,0.35); font-size:32px;">
        ✨
      </div>
      <div class="synapse-card-info">
        <h3>Add Project to Theme</h3>
        <span class="synapse-availability">${escapeHtml(themeNode.title)}</span>
      </div>
    </div>

    <div class="synapse-card-bio" style="margin-bottom:1rem;">
      Select a project to add to this theme:
    </div>

    <div id="project-selection-list" style="display:flex; flex-direction:column; gap:0.75rem;">
      ${availableProjects.map(project => `
        <div class="project-selection-item" data-project-id="${project.id}" style="
          background: rgba(0,224,255,0.05);
          border: 2px solid rgba(0,224,255,0.2);
          border-radius: 8px;
          padding: 1rem;
          cursor: pointer;
          transition: all 0.2s;
        " onmouseover="this.style.borderColor='rgba(0,224,255,0.5)'; this.style.background='rgba(0,224,255,0.1)';"
           onmouseout="this.style.borderColor='rgba(0,224,255,0.2)'; this.style.background='rgba(0,224,255,0.05)';">
          <div style="font-weight:bold; color:#00e0ff; margin-bottom:0.25rem;">
            <i class="fas fa-lightbulb"></i> ${escapeHtml(project.title)}
          </div>
          <div style="font-size:0.85rem; color:rgba(255,255,255,0.7);">
            ${escapeHtml(project.description || 'No description')}
          </div>
          ${project.theme_id ? `
            <div style="margin-top:0.5rem; font-size:0.75rem; color:rgba(255,255,255,0.5);">
              <i class="fas fa-info-circle"></i> Currently in another theme
            </div>
          ` : ''}
        </div>
      `).join('')}
    </div>
  `;

  modal.querySelector(".synapse-card-close")?.addEventListener("click", () => modal.remove());

  // Add click handlers to project items
  modal.querySelectorAll(".project-selection-item").forEach(item => {
    item.addEventListener("click", async () => {
      const projectId = item.dataset.projectId;
      const projectTitle = item.querySelector("div").textContent.replace("💡 ", "").trim();

      if (!confirm(`Add "${projectTitle}" to "${themeNode.title}"?`)) return;

      try {
        const { error } = await supabase
          .from("projects")
          .update({ theme_id: themeNode.theme_id })
          .eq("id", projectId);

        if (error) throw error;

        showSynapseNotification(`Project added to theme! 🎉`, "success");
        modal.remove();

        // Refresh synapse view
        if (typeof window.refreshSynapseConnections === 'function') {
          await window.refreshSynapseConnections();
        }
      } catch (error) {
        console.error("Failed to add project to theme:", error);
        showSynapseNotification(error.message || "Failed to add project", "error");
      }
    });
  });

  document.getElementById("synapse-main-view")?.appendChild(modal);
}
