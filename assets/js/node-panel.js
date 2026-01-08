// ================================================================
// NODE SIDE PANEL (Clean rewrite — class-based CSS + responsive header)
// File: node-panel.js
//
// Fixes:
// - "Mutual Connections" / "Shared Projects" when viewing your own profile
// - Class-based CSS (no inline style soup)
// - Header collapses on short-height screens (and manual toggle)
// - Panel scroll is content-only; header + action bar remain usable
//
// Schema assumptions preserved from your original file:
// - community: id, user_id, name, image_url, bio, skills (csv), availability, user_role, ...
// - connections: id, from_user_id, to_user_id, status, created_at
// - endorsements: endorser_community_id, endorsed_community_id, skill
// - projects: id, title, description, status, creator_id, required_skills (array or text), tags
// - project_members: id, project_id, user_id, role ('pending' etc)
// ================================================================

console.log("%c👤 Node Panel Loading (rewritten)", "color:#0ff; font-weight:bold; font-size:16px");

let currentNodeData = null;
let panelElement = null;
let supabase = null;
let currentUserProfile = null;

let stylesInjected = false;
let headerCollapsed = false;

// -----------------------------
// Public init / open / close
// -----------------------------
export function initNodePanel() {
  supabase = window.supabase;

  injectNodePanelStyles();
  createPanelElement();

  window.addEventListener("profile-loaded", (e) => {
    currentUserProfile = e.detail.profile;
  });

  console.log("✅ Node panel initialized (rewritten)");
}

export async function openNodePanel(nodeData) {
  if (!panelElement) {
    injectNodePanelStyles();
    createPanelElement();
  }

  currentNodeData = nodeData;
  panelElement.classList.add("np-open");

  await loadNodeDetails(nodeData);
}

export function closeNodePanel() {
  if (!panelElement) return;
  panelElement.classList.remove("np-open");
  currentNodeData = null;
}

// Expose close for existing onclick hooks (kept for backward compatibility)
window.closeNodePanel = closeNodePanel;

// -----------------------------
// DOM creation
// -----------------------------
function createPanelElement() {
  if (panelElement) return;

  panelElement = document.createElement("aside");
  panelElement.id = "node-side-panel";
  panelElement.className = "np-panel";

  panelElement.innerHTML = `
    <div class="np-shell">
      <div class="np-header" id="np-header">
        <button class="np-icon-btn np-close" id="np-close" aria-label="Close">
          <i class="fas fa-times"></i>
        </button>

        <div class="np-header-main">
          <div class="np-avatar-wrap" id="np-avatar-wrap"></div>
          <div class="np-titleblock">
            <div class="np-title" id="np-title"></div>
            <div class="np-subtitle" id="np-subtitle"></div>
            <div class="np-pill-row" id="np-pill-row"></div>
          </div>
        </div>

        <div class="np-header-meta" id="np-header-meta"></div>

        <button class="np-collapse-btn" id="np-collapse-btn" type="button" aria-expanded="true">
          <i class="fas fa-chevron-up"></i>
          <span>Collapse</span>
        </button>
      </div>

      <div class="np-body" id="np-body">
        <div class="np-loading">
          <i class="fas fa-spinner fa-spin"></i>
          <div>Loading…</div>
        </div>
      </div>

      <div class="np-actionbar" id="np-actionbar"></div>
    </div>
  `;

  document.body.appendChild(panelElement);

  // Wire basic controls
  panelElement.querySelector("#np-close")?.addEventListener("click", closeNodePanel);

  const collapseBtn = panelElement.querySelector("#np-collapse-btn");
  collapseBtn?.addEventListener("click", () => setHeaderCollapsed(!headerCollapsed));

  // Auto-collapse on very short viewports
  window.addEventListener("resize", autoCollapseForShortScreens);
  autoCollapseForShortScreens();
}

function setHeaderCollapsed(collapsed) {
  headerCollapsed = !!collapsed;
  panelElement?.classList.toggle("np-header-collapsed", headerCollapsed);

  const btn = panelElement?.querySelector("#np-collapse-btn");
  if (btn) {
    btn.setAttribute("aria-expanded", String(!headerCollapsed));
    btn.innerHTML = headerCollapsed
      ? `<i class="fas fa-chevron-down"></i><span>Expand</span>`
      : `<i class="fas fa-chevron-up"></i><span>Collapse</span>`;
  }
}

function autoCollapseForShortScreens() {
  // Tune thresholds as desired
  const short = window.innerHeight <= 720;
  if (short) setHeaderCollapsed(true);
  else setHeaderCollapsed(false);
}

// -----------------------------
// Loading / routing
// -----------------------------
async function loadNodeDetails(nodeData) {
  const body = $("#np-body");
  const actionbar = $("#np-actionbar");
  const title = $("#np-title");
  const subtitle = $("#np-subtitle");
  const avatarWrap = $("#np-avatar-wrap");
  const pillRow = $("#np-pill-row");
  const meta = $("#np-header-meta");

  if (!body || !actionbar || !title || !subtitle || !avatarWrap || !pillRow || !meta) return;

  // Reset header
  title.textContent = "";
  subtitle.textContent = "";
  avatarWrap.innerHTML = "";
  pillRow.innerHTML = "";
  meta.innerHTML = "";

  body.innerHTML = `
    <div class="np-loading">
      <i class="fas fa-spinner fa-spin"></i>
      <div>Loading…</div>
    </div>
  `;
  actionbar.innerHTML = "";

  try {
    const isProject = nodeData?.type === "project";
    if (isProject) await renderProjectPanel(nodeData);
    else await renderPersonPanel(nodeData);
  } catch (e) {
    console.error("Error loading node details:", e);
    body.innerHTML = `
      <div class="np-error">
        <i class="fas fa-exclamation-circle"></i>
        <div>Error loading</div>
      </div>
    `;
  }
}

// -----------------------------
// PERSON PANEL
// -----------------------------
async function renderPersonPanel(nodeData) {
  const { data: profile, error } = await supabase
    .from("community")
    .select("*")
    .eq("id", nodeData.id)
    .single();

  if (error || !profile) throw error || new Error("Profile not found");

  const isSelf = !!(currentUserProfile?.id && profile.id === currentUserProfile.id);

  // Connection status (only for other users)
  let connectionStatus = "none";
  if (currentUserProfile && !isSelf) {
    const { data: connections } = await supabase
      .from("connections")
      .select("id, status")
      .or(
        `and(from_user_id.eq.${currentUserProfile.id},to_user_id.eq.${profile.id}),and(from_user_id.eq.${profile.id},to_user_id.eq.${currentUserProfile.id})`
      )
      .order("created_at", { ascending: false })
      .limit(1);

    if (connections?.length) connectionStatus = connections[0].status;
  }

  // Endorsements (top few)
  const { data: endorsements } = await supabase
    .from("endorsements")
    .select("skill, endorser:community!endorsements_endorser_community_id_fkey(name)")
    .eq("endorsed_community_id", profile.id)
    .limit(5);

  // Connections/projects sections:
  // - self -> show My Connections / My Projects
  // - other -> show Mutual Connections / Shared Projects
  const connectionsList = isSelf
    ? await getMyConnections(profile.id)
    : await getMutualConnections(profile.id);

  const projectsList = isSelf
    ? await getProjectsForUser(profile.id)
    : await getSharedProjects(profile.id);

  // Engagement tracking only for viewing others
  if (window.DailyEngagement && !isSelf) {
    try {
      await window.DailyEngagement.awardXP(
        window.DailyEngagement.XP_REWARDS.VIEW_PROFILE,
        `Viewed ${profile.name}'s profile`
      );
      await window.DailyEngagement.updateQuestProgress("view_profiles", 1);
    } catch (err) {
      console.warn("Failed to track profile view:", err);
    }
  }

  // Header
  hydratePersonHeader(profile);

  // Body
  const body = $("#np-body");
  body.innerHTML = `
    ${profile.bio ? sectionAbout(profile.bio) : ""}
    ${profile.skills ? sectionSkills(profile.skills) : ""}

    ${endorsements?.length ? sectionEndorsements(endorsements.slice(0, 3)) : ""}

    ${
      connectionsList?.length
        ? sectionConnectionsList(
            connectionsList,
            isSelf ? "My Connections" : "Mutual Connections",
            isSelf ? "fas fa-users" : "fas fa-user-friends",
            isSelf
          )
        : ""
    }

    ${
      projectsList?.length
        ? sectionProjectsList(
            projectsList,
            isSelf ? "My Projects" : "Shared Projects",
            "fas fa-project-diagram"
          )
        : ""
    }

    <div class="np-spacer"></div>
  `;

  // Action bar
  const actionbar = $("#np-actionbar");
  actionbar.innerHTML = isSelf
    ? `
      <button class="np-btn np-btn-primary np-btn-full" id="np-edit-profile">
        <i class="fas fa-edit"></i>
        <span>Edit Profile</span>
      </button>
    `
    : `
      <div class="np-btn-grid">
        <button class="np-btn np-btn-primary" id="np-message">
          <i class="fas fa-comment"></i><span>Message</span>
        </button>

        ${
          connectionStatus === "accepted"
            ? `<button class="np-btn np-btn-ghost" id="np-endorse"><i class="fas fa-star"></i><span>Endorse</span></button>`
            : connectionStatus === "pending"
              ? `<button class="np-btn np-btn-warn" id="np-withdraw"><i class="fas fa-times-circle"></i><span>Withdraw</span></button>`
              : `<button class="np-btn np-btn-ghost" id="np-connect"><i class="fas fa-user-plus"></i><span>Connect</span></button>`
        }
      </div>

      ${
        connectionStatus === "accepted"
          ? `<button class="np-btn np-btn-success np-btn-full" id="np-invite"><i class="fas fa-plus-circle"></i><span>Invite to Project</span></button>`
          : ""
      }
    `;

  // Wire actions
  if (isSelf) {
    $("#np-edit-profile")?.addEventListener("click", () => {
      closeNodePanel();
      window.openProfileEditor?.();
    });
  } else {
    $("#np-message")?.addEventListener("click", () => window.sendMessage(profile.id));
    $("#np-connect")?.addEventListener("click", () => window.sendConnectionFromPanel(profile.id));
    $("#np-withdraw")?.addEventListener("click", () => window.withdrawConnectionFromPanel(profile.id));
    $("#np-endorse")?.addEventListener("click", () => window.endorseSkill(profile.id));
    $("#np-invite")?.addEventListener("click", () => window.inviteToProject(profile.id));
  }
}

function hydratePersonHeader(profile) {
  const title = $("#np-title");
  const subtitle = $("#np-subtitle");
  const avatarWrap = $("#np-avatar-wrap");
  const pillRow = $("#np-pill-row");
  const meta = $("#np-header-meta");

  const name = profile?.name || "Profile";
  title.textContent = name;

  subtitle.textContent = profile?.user_role ? profile.user_role : "";

  const initials = (profile?.name || "U")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join("");

  avatarWrap.innerHTML = profile?.image_url
    ? `<img class="np-avatar-img" src="${escapeAttr(profile.image_url)}" alt="${escapeAttr(name)}" />`
    : `<div class="np-avatar-fallback">${escapeHtml(initials || "U")}</div>`;

  pillRow.innerHTML = profile?.availability
    ? `<span class="np-pill np-pill-online"><i class="fas fa-circle"></i>${escapeHtml(profile.availability)}</span>`
    : "";

  // Meta line
  const connCount = Number(profile?.connection_count || 0);
  const projCount = profile?.projects_created ? Number(profile.projects_created) : null;

  meta.innerHTML = `
    <div class="np-meta-row">
      <div class="np-meta-item"><i class="fas fa-users"></i><span>${connCount} connections</span></div>
      ${projCount != null ? `<div class="np-meta-item"><i class="fas fa-lightbulb"></i><span>${projCount} projects</span></div>` : ""}
    </div>
  `;
}

// -----------------------------
// PROJECT PANEL
// -----------------------------
async function renderProjectPanel(nodeData) {
  const { data: project, error } = await supabase
    .from("projects")
    .select(
      `
      *,
      creator:community!projects_creator_id_fkey(name, image_url),
      project_members(
        id,
        user_id,
        role,
        user:community(id, name, image_url)
      )
    `
    )
    .eq("id", nodeData.id)
    .single();

  if (error || !project) throw error || new Error("Project not found");

  const members = project.project_members || [];
  const activeMembers = members.filter((m) => m.role !== "pending");
  const pendingRequests = members.filter((m) => m.role === "pending");

  const isCreator = !!(currentUserProfile?.id && project.creator_id === currentUserProfile.id);
  const isMember = !!(currentUserProfile?.id && activeMembers.some((m) => (m.user?.id || m.user_id) === currentUserProfile.id));
  const hasPendingRequest = !!(currentUserProfile?.id && pendingRequests.some((m) => (m.user?.id || m.user_id) === currentUserProfile.id));

  // Header
  hydrateProjectHeader(project, activeMembers.length, pendingRequests.length, isCreator);

  // Body
  const body = $("#np-body");

  body.innerHTML = `
    ${sectionProjectDescription(project.description)}
    ${sectionProjectSkills(project.required_skills)}
    ${sectionTeamMembers(activeMembers)}
    ${project.creator ? sectionCreator(project.creator) : ""}

    <div class="np-spacer"></div>
  `;

  // Action bar
  const actionbar = $("#np-actionbar");

  if (isCreator) {
    actionbar.innerHTML = `
      <button class="np-btn np-btn-project np-btn-full" id="np-proj-edit"><i class="fas fa-edit"></i><span>Edit Project</span></button>
      ${
        pendingRequests.length
          ? `<button class="np-btn np-btn-warn np-btn-full" id="np-proj-requests"><i class="fas fa-user-clock"></i><span>Manage Requests (${pendingRequests.length})</span></button>`
          : ""
      }
      <button class="np-btn np-btn-ghost np-btn-full np-btn-project-outline" id="np-proj-view"><i class="fas fa-eye"></i><span>View Full Details</span></button>
    `;
    $("#np-proj-edit")?.addEventListener("click", () => window.editProjectFromPanel(project.id));
    $("#np-proj-requests")?.addEventListener("click", () => window.manageProjectRequests(project.id));
    $("#np-proj-view")?.addEventListener("click", () => window.viewProjectDetails(project.id));
    return;
  }

  if (isMember) {
    actionbar.innerHTML = `
      <div class="np-banner np-banner-success"><i class="fas fa-check-circle"></i><span>You’re a member of this project</span></div>
      <button class="np-btn np-btn-ghost np-btn-full np-btn-project-outline" id="np-proj-view"><i class="fas fa-eye"></i><span>View Full Details</span></button>
    `;
    $("#np-proj-view")?.addEventListener("click", () => window.viewProjectDetails(project.id));
    return;
  }

  if (hasPendingRequest) {
    actionbar.innerHTML = `
      <div class="np-banner np-banner-warn"><i class="fas fa-clock"></i><span>Join request pending approval</span></div>
      <button class="np-btn np-btn-ghost np-btn-full np-btn-project-outline" id="np-proj-view"><i class="fas fa-eye"></i><span>View Full Details</span></button>
    `;
    $("#np-proj-view")?.addEventListener("click", () => window.viewProjectDetails(project.id));
    return;
  }

  actionbar.innerHTML = `
    <button class="np-btn np-btn-project np-btn-full" id="np-proj-join"><i class="fas fa-plus-circle"></i><span>Request to Join</span></button>
    <button class="np-btn np-btn-ghost np-btn-full np-btn-project-outline" id="np-proj-view"><i class="fas fa-eye"></i><span>View Full Details</span></button>
  `;

  $("#np-proj-join")?.addEventListener("click", () => window.joinProjectFromPanel(project.id));
  $("#np-proj-view")?.addEventListener("click", () => window.viewProjectDetails(project.id));
}

function hydrateProjectHeader(project, activeCount, pendingCount, isCreator) {
  const title = $("#np-title");
  const subtitle = $("#np-subtitle");
  const avatarWrap = $("#np-avatar-wrap");
  const pillRow = $("#np-pill-row");
  const meta = $("#np-header-meta");

  title.textContent = project?.title || "Project";
  subtitle.textContent = isCreator ? "Your project" : "";

  avatarWrap.innerHTML = `
    <div class="np-project-icon">
      <i class="fas fa-lightbulb"></i>
    </div>
  `;

  pillRow.innerHTML = project?.status
    ? `<span class="np-pill np-pill-project">${escapeHtml(project.status)}</span>`
    : "";

  meta.innerHTML = `
    <div class="np-meta-row">
      <div class="np-meta-item"><i class="fas fa-users"></i><span>${activeCount} member${activeCount === 1 ? "" : "s"}</span></div>
      ${pendingCount && isCreator ? `<div class="np-meta-item np-meta-warn"><i class="fas fa-clock"></i><span>${pendingCount} pending</span></div>` : ""}
      <div class="np-meta-item"><i class="fas fa-eye"></i><span>${Number(project?.view_count || 0)} views</span></div>
    </div>
  `;
}

// -----------------------------
// Sections (HTML builders)
// -----------------------------
function sectionAbout(bio) {
  return `
    <section class="np-section">
      <div class="np-section-title"><i class="fas fa-user"></i><span>About</span></div>
      <div class="np-text">${escapeHtml(bio)}</div>
    </section>
  `;
}

function sectionSkills(skillsCsv) {
  const skills = String(skillsCsv)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return `
    <section class="np-section">
      <div class="np-section-title"><i class="fas fa-code"></i><span>Skills</span></div>
      <div class="np-chip-row">
        ${skills.map((s) => `<span class="np-chip">${escapeHtml(s)}</span>`).join("")}
      </div>
    </section>
  `;
}

function sectionEndorsements(list) {
  return `
    <section class="np-section">
      <div class="np-section-title"><i class="fas fa-star"></i><span>Top Endorsements</span></div>
      <div class="np-card-list">
        ${list
          .map(
            (e) => `
          <div class="np-card">
            <div class="np-card-strong">${escapeHtml(e.skill || "")}</div>
            <div class="np-card-sub">Endorsed by ${escapeHtml(e.endorser?.name || "Unknown")}</div>
          </div>
        `
          )
          .join("")}
      </div>
    </section>
  `;
}

function sectionConnectionsList(list, title, iconClass, clickable) {
  return `
    <section class="np-section">
      <div class="np-section-title">
        <i class="${iconClass}"></i>
        <span>${escapeHtml(title)} (${list.length})</span>
      </div>

      <div class="np-pillgrid">
        ${list.slice(0, 8).map((p) => personPill(p, clickable)).join("")}
        ${list.length > 8 ? `<div class="np-more">+${list.length - 8} more</div>` : ""}
      </div>
    </section>
  `;
}

function personPill(profile, clickable) {
  const initials = (profile?.name || "U")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join("");

  const attrs = clickable ? `role="button" tabindex="0" data-open-profile="${escapeAttr(profile.id)}"` : "";
  const img = profile?.image_url
    ? `<img class="np-mini-avatar" src="${escapeAttr(profile.image_url)}" alt="${escapeAttr(profile.name || "")}">`
    : `<div class="np-mini-fallback">${escapeHtml(initials || "U")}</div>`;

  // If clickable, allow tap to open that node panel (if your graph uses same node schema)
  // This is optional and safe; it won't throw if openNodePanel isn't used elsewhere.
  return `
    <div class="np-person-pill" ${attrs}>
      ${img}
      <span class="np-person-name">${escapeHtml(profile?.name || "")}</span>
    </div>
  `;
}

function sectionProjectsList(list, title, iconClass) {
  return `
    <section class="np-section">
      <div class="np-section-title"><i class="${iconClass}"></i><span>${escapeHtml(title)}</span></div>
      <div class="np-card-list">
        ${list
          .slice(0, 8)
          .map(
            (p) => `
          <div class="np-card np-card-project">
            <div class="np-card-strong">${escapeHtml(p?.title || p?.name || "Untitled")}</div>
          </div>
        `
          )
          .join("")}
      </div>
    </section>
  `;
}

function sectionProjectDescription(desc) {
  return `
    <section class="np-section np-project-accent">
      <div class="np-section-title np-project-title"><i class="fas fa-info-circle"></i><span>Description</span></div>
      <div class="np-text">${escapeHtml(desc || "No description provided")}</div>
    </section>
  `;
}

function sectionProjectSkills(requiredSkills) {
  const skills = Array.isArray(requiredSkills)
    ? requiredSkills.filter(Boolean)
    : String(requiredSkills || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

  if (!skills.length) return "";

  return `
    <section class="np-section np-project-accent">
      <div class="np-section-title np-project-title"><i class="fas fa-code"></i><span>Required Skills</span></div>
      <div class="np-chip-row">
        ${skills.map((s) => `<span class="np-chip np-chip-project">${escapeHtml(s)}</span>`).join("")}
      </div>
    </section>
  `;
}

function sectionTeamMembers(members) {
  if (!members?.length) return "";

  return `
    <section class="np-section np-project-accent">
      <div class="np-section-title np-project-title"><i class="fas fa-users"></i><span>Team Members</span></div>
      <div class="np-pillgrid">
        ${members
          .slice(0, 12)
          .map((m) => {
            const u = m.user || {};
            return personPill(
              { id: u.id || m.user_id, name: u.name || "Member", image_url: u.image_url || "" },
              false
            );
          })
          .join("")}
      </div>
    </section>
  `;
}

function sectionCreator(creator) {
  const initials = (creator?.name || "C")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join("");

  const img = creator?.image_url
    ? `<img class="np-creator-avatar" src="${escapeAttr(creator.image_url)}" alt="${escapeAttr(creator.name || "")}">`
    : `<div class="np-creator-fallback">${escapeHtml(initials || "C")}</div>`;

  return `
    <section class="np-section np-project-accent">
      <div class="np-section-title np-project-title"><i class="fas fa-user-circle"></i><span>Created By</span></div>
      <div class="np-creator-card">
        ${img}
        <div class="np-creator-meta">
          <div class="np-creator-name">${escapeHtml(creator?.name || "")}</div>
          <div class="np-creator-sub">Project Creator</div>
        </div>
      </div>
    </section>
  `;
}

// -----------------------------
// Data helpers (connections/projects)
// -----------------------------
async function getMutualConnections(userId) {
  if (!currentUserProfile?.id) return [];

  try {
    const { data: myConnections } = await supabase
      .from("connections")
      .select("from_user_id, to_user_id")
      .or(`from_user_id.eq.${currentUserProfile.id},to_user_id.eq.${currentUserProfile.id}`)
      .eq("status", "accepted");

    const { data: theirConnections } = await supabase
      .from("connections")
      .select("from_user_id, to_user_id")
      .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
      .eq("status", "accepted");

    const mySet = new Set();
    myConnections?.forEach((c) => {
      const other = c.from_user_id === currentUserProfile.id ? c.to_user_id : c.from_user_id;
      if (other) mySet.add(other);
    });

    const mutualIds = [];
    theirConnections?.forEach((c) => {
      const other = c.from_user_id === userId ? c.to_user_id : c.from_user_id;
      if (other && mySet.has(other)) mutualIds.push(other);
    });

    if (!mutualIds.length) return [];

    const { data: mutuals } = await supabase
      .from("community")
      .select("id, name, image_url")
      .in("id", mutualIds);

    return mutuals || [];
  } catch (e) {
    console.error("Error getting mutual connections:", e);
    return [];
  }
}

async function getMyConnections(selfCommunityId) {
  if (!selfCommunityId) return [];

  try {
    const { data: conns } = await supabase
      .from("connections")
      .select("from_user_id, to_user_id")
      .or(`from_user_id.eq.${selfCommunityId},to_user_id.eq.${selfCommunityId}`)
      .eq("status", "accepted");

    const ids = Array.from(
      new Set(
        (conns || [])
          .map((c) => (c.from_user_id === selfCommunityId ? c.to_user_id : c.from_user_id))
          .filter(Boolean)
      )
    );

    if (!ids.length) return [];

    const { data: profiles } = await supabase
      .from("community")
      .select("id, name, image_url")
      .in("id", ids);

    return profiles || [];
  } catch (e) {
    console.error("Error getting my connections:", e);
    return [];
  }
}

async function getSharedProjects(userId) {
  if (!currentUserProfile?.id) return [];

  try {
    const { data: myProjects } = await supabase
      .from("project_members")
      .select("project_id")
      .eq("user_id", currentUserProfile.id);

    const { data: theirProjects } = await supabase
      .from("project_members")
      .select("project_id, projects(id, title)")
      .eq("user_id", userId);

    const mySet = new Set((myProjects || []).map((p) => p.project_id).filter(Boolean));
    const shared = (theirProjects || []).filter((tp) => mySet.has(tp.project_id));

    return shared.map((s) => s.projects).filter(Boolean);
  } catch (e) {
    console.error("Error getting shared projects:", e);
    return [];
  }
}

async function getProjectsForUser(userId) {
  if (!userId) return [];

  try {
    const { data } = await supabase
      .from("project_members")
      .select("project_id, projects(id, title)")
      .eq("user_id", userId);

    return (data || []).map((d) => d.projects).filter(Boolean);
  } catch (e) {
    console.error("Error getting user projects:", e);
    return [];
  }
}

// -----------------------------
// ACTION HANDLERS (kept compatible with your existing globals)
// -----------------------------
window.sendConnectionFromPanel = async function (userId) {
  try {
    await window.sendConnectionRequest(userId);

    if (window.DailyEngagement) {
      try {
        await window.DailyEngagement.awardXP(
          window.DailyEngagement.XP_REWARDS.SEND_CONNECTION,
          "Sent connection request"
        );
        await window.DailyEngagement.updateQuestProgress("send_connection", 1);
      } catch (err) {
        console.warn("Failed to track connection request:", err);
      }
    }

    await loadNodeDetails(currentNodeData);
  } catch (e) {
    console.error("Error sending connection:", e);
    alert("Failed to send connection request");
  }
};

window.withdrawConnectionFromPanel = async function (userId) {
  try {
    if (!currentUserProfile?.id) {
      alert("Please log in to withdraw connection requests");
      return;
    }

    const confirmed = confirm(
      "⚠️ Withdraw this connection request?\n\nIf you proceed, you'll need to send a new request to connect again."
    );
    if (!confirmed) return;

    const { data: connections, error: findError } = await supabase
      .from("connections")
      .select("id, from_user_id")
      .or(
        `and(from_user_id.eq.${currentUserProfile.id},to_user_id.eq.${userId}),and(from_user_id.eq.${userId},to_user_id.eq.${currentUserProfile.id})`
      )
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1);

    if (findError) throw findError;
    if (!connections?.length) {
      alert("No pending connection request found");
      return;
    }

    const connection = connections[0];
    if (connection.from_user_id !== currentUserProfile.id) {
      alert("You can only withdraw requests that you sent");
      return;
    }

    const { error: delErr } = await supabase.from("connections").delete().eq("id", connection.id);
    if (delErr) throw delErr;

    showToast("✓ Connection request withdrawn", "info");
    await loadNodeDetails(currentNodeData);
  } catch (e) {
    console.error("Error withdrawing connection:", e);
    alert("Failed to withdraw connection request: " + (e?.message || e));
  }
};

window.sendMessage = async function (userId) {
  try {
    console.log("📨 Opening message for user:", userId);
    closeNodePanel();

    const messagesModal = document.getElementById("messages-modal");
    if (messagesModal) messagesModal.classList.add("active");

    await new Promise((r) => setTimeout(r, 300));

    if (window.MessagingModule) {
      if (typeof window.MessagingModule.init === "function") await window.MessagingModule.init();
      if (typeof window.MessagingModule.startConversation === "function") {
        await window.MessagingModule.startConversation(userId);
        console.log("✅ Started conversation with user:", userId);
      }
    } else {
      console.error("MessagingModule not available");
    }
  } catch (e) {
    console.error("Error starting conversation:", e);
    alert("Failed to start conversation: " + (e?.message || e));
  }
};

window.endorseSkill = async function (userId) {
  try {
    const { data: profile } = await supabase
      .from("community")
      .select("name, skills")
      .eq("id", userId)
      .single();

    if (!profile?.skills) {
      alert("No skills to endorse");
      return;
    }

    const skills = String(profile.skills)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const modal = ensureModal("np-modal", "np-endorse-modal");
    modal.querySelector(".np-modal-title").innerHTML = `<i class="fas fa-star"></i> Endorse ${escapeHtml(profile.name)}`;
    modal.querySelector(".np-modal-sub").textContent = "Select a skill to endorse:";

    const list = modal.querySelector(".np-modal-body");
    list.innerHTML = `
      <div class="np-modal-list">
        ${skills
          .map(
            (skill) => `
          <button class="np-choice" data-skill="${escapeAttr(skill)}">
            <div class="np-choice-title">${escapeHtml(skill)}</div>
            <div class="np-choice-sub">Click to endorse</div>
          </button>
        `
          )
          .join("")}
      </div>
    `;

    list.querySelectorAll("[data-skill]").forEach((btn) => {
      btn.addEventListener("click", () =>
        window.confirmEndorsement(userId, btn.getAttribute("data-skill"), profile.name, btn)
      );
    });

    openModal(modal);
  } catch (e) {
    console.error("Error showing endorsement modal:", e);
    alert("Failed to load skills");
  }
};

window.confirmEndorsement = async function (userId, skill, userName, buttonEl) {
  try {
    if (buttonEl) {
      buttonEl.disabled = true;
      buttonEl.classList.add("is-busy");
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      alert("Please log in to endorse");
      return;
    }

    const { data: endorserProfile } = await supabase
      .from("community")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!endorserProfile?.id) {
      alert("Profile not found");
      return;
    }

    const { data: existing } = await supabase
      .from("endorsements")
      .select("id")
      .eq("endorser_community_id", endorserProfile.id)
      .eq("endorsed_community_id", userId)
      .eq("skill", skill)
      .maybeSingle();

    if (existing?.id) {
      alert("You already endorsed this skill!");
      return;
    }

    const { error } = await supabase.from("endorsements").insert({
      endorser_id: user.id,
      endorser_community_id: endorserProfile.id,
      endorsed_id: userId,
      endorsed_community_id: userId,
      skill
    });

    if (error) throw error;

    if (window.DailyEngagement) {
      try {
        await window.DailyEngagement.awardXP(
          window.DailyEngagement.XP_REWARDS.ENDORSE_SKILL,
          `Endorsed ${skill}`
        );
        await window.DailyEngagement.updateQuestProgress("endorse_skill", 1);
      } catch (err) {
        console.warn("Failed to track endorsement:", err);
      }
    }

    closeTopModal();
    showToast(`✨ You endorsed ${userName} for ${skill}!`, "success");
    if (currentNodeData) await loadNodeDetails(currentNodeData);
  } catch (e) {
    console.error("Error endorsing skill:", e);
    alert("Failed to endorse: " + (e?.message || e));
  } finally {
    if (buttonEl) {
      buttonEl.disabled = false;
      buttonEl.classList.remove("is-busy");
    }
  }
};

window.inviteToProject = async function (userId) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      alert("Please log in to invite to projects");
      return;
    }

    const { data: currentProfile } = await supabase
      .from("community")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!currentProfile?.id) {
      alert("Profile not found");
      return;
    }

    const { data: targetProfile } = await supabase
      .from("community")
      .select("name")
      .eq("id", userId)
      .single();

    const { data: projects } = await supabase
      .from("projects")
      .select("id, title, description, status")
      .eq("creator_id", currentProfile.id)
      .in("status", ["open", "active", "in-progress"]);

    if (!projects?.length) {
      alert("You need to create a project first!");
      return;
    }

    const { data: existingMemberships } = await supabase
      .from("project_members")
      .select("project_id")
      .eq("user_id", userId);

    const existingIds = new Set((existingMemberships || []).map((m) => m.project_id));
    const available = projects.filter((p) => !existingIds.has(p.id));

    if (!available.length) {
      alert(`${targetProfile?.name || "This user"} is already in all your active projects!`);
      return;
    }

    const modal = ensureModal("np-modal np-modal-project", "np-invite-modal");
    modal.querySelector(".np-modal-title").innerHTML =
      `<i class="fas fa-plus-circle"></i> Invite ${escapeHtml(targetProfile?.name || "User")} to Project`;
    modal.querySelector(".np-modal-sub").textContent = "Select a project to invite them to:";

    const body = modal.querySelector(".np-modal-body");
    body.innerHTML = `
      <div class="np-modal-list">
        ${available
          .map(
            (p) => `
          <button class="np-choice np-choice-project" data-project-id="${escapeAttr(p.id)}" data-project-title="${escapeAttr(p.title)}">
            <div class="np-choice-row">
              <div class="np-choice-title np-project-color">${escapeHtml(p.title)}</div>
              <div class="np-badge np-badge-project">${escapeHtml(p.status || "")}</div>
            </div>
            ${p.description ? `<div class="np-choice-sub">${escapeHtml(truncate(p.description, 110))}</div>` : ""}
          </button>
        `
          )
          .join("")}
      </div>
    `;

    body.querySelectorAll("[data-project-id]").forEach((btn) => {
      btn.addEventListener("click", () =>
        window.confirmProjectInvitation(
          userId,
          btn.getAttribute("data-project-id"),
          btn.getAttribute("data-project-title"),
          targetProfile?.name || "User",
          btn
        )
      );
    });

    openModal(modal);
  } catch (e) {
    console.error("Error showing project invitation modal:", e);
    alert("Failed to load projects: " + (e?.message || e));
  }
};

window.confirmProjectInvitation = async function (userId, projectId, projectTitle, userName, buttonEl) {
  try {
    if (buttonEl) {
      buttonEl.disabled = true;
      buttonEl.classList.add("is-busy");
    }

    const { error } = await supabase.from("project_members").insert({
      project_id: projectId,
      user_id: userId,
      role: "member"
    });

    if (error) throw error;

    closeTopModal();
    showToast(`🎉 ${userName} has been added to ${projectTitle}!`, "success");

    // Optional activity log (kept from your original behavior)
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        await supabase.from("activity_log").insert({
          auth_user_id: user.id,
          action_type: "project_member_added",
          details: { project_id: projectId, invited_user_id: userId, project_title: projectTitle }
        });
      }
    } catch (logErr) {
      console.warn("Activity log insert failed:", logErr);
    }
  } catch (e) {
    console.error("Error inviting to project:", e);
    alert("Failed to invite: " + (e?.message || e));
  } finally {
    if (buttonEl) {
      buttonEl.disabled = false;
      buttonEl.classList.remove("is-busy");
    }
  }
};

window.joinProjectFromPanel = async function (projectId) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      alert("Please log in to join a project");
      return;
    }

    if (!currentUserProfile?.id) {
      alert("Profile not loaded yet. Try again in a second.");
      return;
    }

    const { data: existingMember } = await supabase
      .from("project_members")
      .select("id, role")
      .eq("project_id", projectId)
      .eq("user_id", currentUserProfile.id)
      .maybeSingle();

    if (existingMember?.id) {
      showToast(existingMember.role === "pending" ? "Your join request is pending approval" : "You’re already a member!", "info");
      await loadNodeDetails(currentNodeData);
      return;
    }

    const { error } = await supabase.from("project_members").insert({
      project_id: projectId,
      user_id: currentUserProfile.id,
      role: "pending"
    });

    if (error) {
      if (error.code === "23505") {
        showToast("You already have a pending request!", "info");
        await loadNodeDetails(currentNodeData);
        return;
      }
      throw error;
    }

    showToast("Join request sent! Awaiting approval.", "success");
    await loadNodeDetails(currentNodeData);
  } catch (e) {
    console.error("Error sending join request:", e);
    alert("Failed to send join request: " + (e?.message || e));
  }
};

window.viewProjectDetails = function () {
  closeNodePanel();
  window.openProjectsModal?.();
};

// NOTE: Your original file contains a very large project editor + request manager.
// Keeping your existing functions callable. If you want those converted too,
// we can migrate them next in the same class-based style.
window.editProjectFromPanel = window.editProjectFromPanel || (async function () {
  alert("editProjectFromPanel() exists in your old file; re-add it here if you still need it.");
});
window.manageProjectRequests = window.manageProjectRequests || (async function () {
  alert("manageProjectRequests() exists in your old file; re-add it here if you still need it.");
});
window.approveJoinRequest = window.approveJoinRequest || (async function () {});
window.declineJoinRequest = window.declineJoinRequest || (async function () {});

// -----------------------------
// PROFILE EDITOR — keep hook used by panel
// (Minimal modal shell here; if you want your full editor re-added,
// we’ll port it as a separate module with these same classes.)
// -----------------------------
window.openProfileEditor = async function () {
  try {
    if (!supabase) supabase = window.supabase;
    if (!supabase) throw new Error("Supabase client not available on window.supabase");

    // Ensure profile
    if (!currentUserProfile?.id) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert("Please log in to edit your profile.");
        return;
      }
      const { data: profileRow, error } = await supabase
        .from("community")
        .select("*")
        .eq("user_id", user.id)
        .single();
      if (error) throw error;
      currentUserProfile = profileRow;
    }

    const modal = ensureModal("np-modal", "np-profile-editor");
    modal.querySelector(".np-modal-title").innerHTML = `<i class="fas fa-edit"></i> Edit Profile`;
    modal.querySelector(".np-modal-sub").textContent = "Update how you appear across the Synapse network.";

    const body = modal.querySelector(".np-modal-body");
    body.innerHTML = `
      <form class="np-form" id="np-profile-form">
        <label class="np-label">Name</label>
        <input class="np-input" name="name" value="${escapeAttr(currentUserProfile.name || "")}" required>

        <label class="np-label">Role</label>
        <input class="np-input" name="user_role" value="${escapeAttr(currentUserProfile.user_role || "")}" placeholder="e.g., Founder, Designer, Engineer">

        <label class="np-label">Availability</label>
        <input class="np-input" name="availability" value="${escapeAttr(currentUserProfile.availability || "")}" placeholder="e.g., Open to collab">

        <label class="np-label">Bio</label>
        <textarea class="np-textarea" name="bio" rows="4" placeholder="A short bio…">${escapeHtml(currentUserProfile.bio || "")}</textarea>

        <label class="np-label">Skills (comma-separated)</label>
        <input class="np-input" name="skills" value="${escapeAttr(currentUserProfile.skills || "")}" placeholder="e.g., JS, React, UX">

        <div class="np-form-row">
          <button class="np-btn np-btn-primary np-btn-full" type="submit">
            <i class="fas fa-save"></i><span>Save</span>
          </button>
        </div>
      </form>
    `;

    const form = modal.querySelector("#np-profile-form");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const fd = new FormData(form);
      const payload = {
        name: String(fd.get("name") || "").trim(),
        user_role: String(fd.get("user_role") || "").trim() || null,
        availability: String(fd.get("availability") || "").trim() || null,
        bio: String(fd.get("bio") || "").trim() || null,
        skills: String(fd.get("skills") || "").trim() || null
      };

      const { error } = await supabase.from("community").update(payload).eq("id", currentUserProfile.id);
      if (error) {
        alert("Save failed: " + error.message);
        return;
      }

      showToast("Profile updated!", "success");
      closeTopModal();

      // Refresh cached profile + reload panel if open
      currentUserProfile = { ...currentUserProfile, ...payload };
      window.dispatchEvent(new CustomEvent("profile-updated", { detail: { profile: currentUserProfile } }));
      if (currentNodeData) await loadNodeDetails(currentNodeData);
    });

    openModal(modal);
  } catch (e) {
    console.error("openProfileEditor failed:", e);
    alert("Could not open profile editor: " + (e?.message || e));
  }
};

// -----------------------------
// Modal helpers (class-based)
// -----------------------------
function ensureModal(className, id) {
  let modal = document.getElementById(id);
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = id;
  modal.className = `np-modal-overlay ${className}`;

  modal.innerHTML = `
    <div class="np-modal-card" role="dialog" aria-modal="true">
      <div class="np-modal-head">
        <div class="np-modal-head-left">
          <div class="np-modal-title"></div>
          <div class="np-modal-sub"></div>
        </div>
        <button class="np-icon-btn np-modal-close" type="button" aria-label="Close">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="np-modal-body"></div>
    </div>
  `;

  modal.querySelector(".np-modal-close")?.addEventListener("click", () => closeModal(modal));
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal(modal);
  });

  document.body.appendChild(modal);
  return modal;
}

function openModal(modal) {
  modal.classList.add("is-open");
  document.body.classList.add("np-noscroll");
}

function closeModal(modal) {
  modal.classList.remove("is-open");
  document.body.classList.remove("np-noscroll");
}

function closeTopModal() {
  const modals = Array.from(document.querySelectorAll(".np-modal-overlay.is-open"));
  const last = modals[modals.length - 1];
  if (last) closeModal(last);
}

// -----------------------------
// Toast (class-based)
// -----------------------------
function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `np-toast ${type === "success" ? "np-toast-success" : "np-toast-info"}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add("is-in"));

  setTimeout(() => {
    toast.classList.remove("is-in");
    setTimeout(() => toast.remove(), 220);
  }, 2600);
}

// -----------------------------
// Utilities
// -----------------------------
function $(id) {
  return panelElement?.querySelector(`#${id}`) || document.getElementById(id);
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(str) {
  return escapeHtml(str).replaceAll("`", "&#096;");
}

function truncate(s, n) {
  const t = String(s || "");
  if (t.length <= n) return t;
  return t.slice(0, n - 1) + "…";
}

// -----------------------------
// CSS injection (one-time)
// -----------------------------
function injectNodePanelStyles() {
  if (stylesInjected) return;
  stylesInjected = true;

  const style = document.createElement("style");
  style.id = "np-styles";
  style.textContent = `
    :root{
      --np-bg1: rgba(10,14,39,.98);
      --np-bg2: rgba(26,26,46,.98);
      --np-cyan: #00e0ff;
      --np-blue: #0080ff;
      --np-green:#00ff88;
      --np-warn:#ffaa00;
      --np-red:#ff6b6b;
      --np-muted:#a9b2c7;
      --np-white:#ffffff;
      --np-border: rgba(0,224,255,.35);
      --np-shadow: rgba(0,0,0,.55);
    }

    /* Panel shell */
    .np-panel{
      position: fixed;
      top:0; right:0;
      width: min(420px, 100vw);
      height: 100vh;
      transform: translateX(110%);
      transition: transform .28s ease;
      z-index: 2000;
      background: linear-gradient(135deg, var(--np-bg1), var(--np-bg2));
      border-left: 2px solid var(--np-border);
      box-shadow: -8px 0 36px var(--np-shadow);
      backdrop-filter: blur(10px);
    }
    .np-panel.np-open{ transform: translateX(0); }

    .np-shell{
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    /* Header */
    .np-header{
      position: sticky;
      top: 0;
      z-index: 3;
      padding: 18px 18px 12px;
      border-bottom: 1px solid rgba(255,255,255,.08);
      background: linear-gradient(135deg, var(--np-bg1), var(--np-bg2));
    }

    .np-close{
      position: absolute;
      top: 12px;
      right: 12px;
    }

    .np-icon-btn{
      width: 40px;
      height: 40px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,.18);
      background: rgba(255,255,255,.08);
      color: #fff;
      cursor: pointer;
      display: grid;
      place-items: center;
      transition: transform .15s ease, background .15s ease;
    }
    .np-icon-btn:hover{ transform: translateY(-1px); background: rgba(255,255,255,.12); }

    .np-header-main{
      display:flex;
      gap: 12px;
      align-items: center;
      padding-right: 48px;
    }

    .np-avatar-wrap{ width: 64px; height: 64px; flex: 0 0 auto; }
    .np-avatar-img{
      width: 64px; height: 64px;
      border-radius: 18px;
      object-fit: cover;
      border: 2px solid rgba(0,224,255,.55);
      display:block;
    }
    .np-avatar-fallback{
      width: 64px; height: 64px;
      border-radius: 18px;
      display:grid; place-items:center;
      font-weight: 800;
      background: linear-gradient(135deg, var(--np-cyan), var(--np-blue));
      border: 2px solid rgba(0,224,255,.55);
      color: #fff;
      font-size: 22px;
    }

    .np-project-icon{
      width: 64px; height: 64px;
      border-radius: 18px;
      display:grid; place-items:center;
      font-size: 26px;
      background: linear-gradient(135deg, var(--np-red), #ff8c8c);
      border: 2px solid rgba(255,107,107,.65);
      color:#fff;
    }

    .np-titleblock{ min-width: 0; }
    .np-title{
      color: var(--np-cyan);
      font-weight: 900;
      font-size: 18px;
      line-height: 1.15;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .np-subtitle{
      color: var(--np-muted);
      font-size: 13px;
      margin-top: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .np-pill-row{ margin-top: 8px; display:flex; gap: 8px; flex-wrap: wrap; }
    .np-pill{
      display:inline-flex;
      align-items:center;
      gap: 8px;
      padding: 6px 10px;
      border-radius: 999px;
      font-size: 12px;
      border: 1px solid rgba(255,255,255,.10);
      background: rgba(255,255,255,.06);
      color: #fff;
    }
    .np-pill i{ font-size: 8px; }
    .np-pill-online{
      border-color: rgba(0,255,136,.25);
      background: rgba(0,255,136,.12);
      color: var(--np-green);
    }
    .np-pill-project{
      border-color: rgba(255,107,107,.25);
      background: rgba(255,107,107,.12);
      color: var(--np-red);
    }

    .np-header-meta{ margin-top: 10px; }
    .np-meta-row{
      display:flex;
      gap: 14px;
      flex-wrap: wrap;
      color: rgba(255,255,255,.75);
      font-size: 12.5px;
    }
    .np-meta-item{
      display:inline-flex;
      gap: 8px;
      align-items:center;
    }
    .np-meta-warn{ color: var(--np-warn); }

    .np-collapse-btn{
      margin-top: 10px;
      width: 100%;
      border-radius: 14px;
      border: 1px solid rgba(255,255,255,.10);
      background: rgba(255,255,255,.05);
      color: rgba(255,255,255,.85);
      cursor: pointer;
      display:flex;
      gap: 10px;
      align-items:center;
      justify-content:center;
      padding: 10px 12px;
      font-weight: 800;
    }
    .np-collapse-btn:hover{ background: rgba(255,255,255,.08); }

    /* Body scroll */
    .np-body{
      flex: 1 1 auto;
      overflow: auto;
      padding: 14px 18px 18px;
    }

    .np-loading{
      padding: 26px 10px;
      text-align:center;
      color: var(--np-cyan);
      display:grid;
      gap: 10px;
      justify-items:center;
      font-weight: 800;
    }
    .np-error{
      padding: 26px 10px;
      text-align:center;
      color: #ff6666;
      display:grid;
      gap: 10px;
      justify-items:center;
      font-weight: 800;
    }

    /* Sections */
    .np-section{ margin: 16px 0; }
    .np-section-title{
      display:flex;
      gap: 10px;
      align-items:center;
      color: var(--np-cyan);
      font-weight: 900;
      font-size: 12.5px;
      letter-spacing: .08em;
      text-transform: uppercase;
      margin-bottom: 10px;
    }
    .np-project-accent .np-section-title{ color: var(--np-red); }
    .np-text{
      color: rgba(255,255,255,.85);
      line-height: 1.55;
      font-size: 14px;
    }

    .np-chip-row{ display:flex; flex-wrap: wrap; gap: 8px; }
    .np-chip{
      padding: 8px 10px;
      border-radius: 12px;
      font-size: 13px;
      border: 1px solid rgba(0,224,255,.25);
      background: rgba(0,224,255,.08);
      color: var(--np-cyan);
      font-weight: 700;
    }
    .np-chip-project{
      border-color: rgba(255,107,107,.25);
      background: rgba(255,107,107,.10);
      color: var(--np-red);
    }

    .np-card-list{ display:grid; gap: 10px; }
    .np-card{
      border-radius: 14px;
      border: 1px solid rgba(0,224,255,.18);
      background: rgba(0,224,255,.05);
      padding: 12px 12px;
    }
    .np-card-project{
      border-color: rgba(0,224,255,.12);
    }
    .np-project-accent .np-card{
      border-color: rgba(255,107,107,.18);
      background: rgba(255,107,107,.05);
    }
    .np-card-strong{ color: #fff; font-weight: 900; }
    .np-card-sub{ color: rgba(255,255,255,.65); font-size: 12.5px; margin-top: 2px; }

    .np-pillgrid{
      display:flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .np-person-pill{
      display:flex;
      align-items:center;
      gap: 10px;
      border-radius: 14px;
      border: 1px solid rgba(0,224,255,.18);
      background: rgba(0,224,255,.05);
      padding: 8px 10px;
      max-width: 100%;
    }
    .np-project-accent .np-person-pill{
      border-color: rgba(255,107,107,.18);
      background: rgba(255,107,107,.05);
    }
    .np-mini-avatar{
      width: 28px; height: 28px;
      border-radius: 10px;
      object-fit: cover;
      border: 1px solid rgba(255,255,255,.18);
    }
    .np-mini-fallback{
      width: 28px; height: 28px;
      border-radius: 10px;
      display:grid; place-items:center;
      font-weight: 900;
      font-size: 11px;
      color:#fff;
      background: linear-gradient(135deg, var(--np-cyan), var(--np-blue));
      border: 1px solid rgba(255,255,255,.18);
    }
    .np-person-name{
      color: #fff;
      font-weight: 800;
      font-size: 13px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 220px;
    }
    .np-more{ color: rgba(255,255,255,.65); font-weight: 800; padding: 10px 6px; }

    .np-creator-card{
      display:flex;
      align-items:center;
      gap: 12px;
      border-radius: 16px;
      border: 1px solid rgba(255,107,107,.18);
      background: rgba(255,107,107,.05);
      padding: 12px;
    }
    .np-creator-avatar{
      width: 44px; height: 44px;
      border-radius: 14px;
      object-fit: cover;
      border: 1px solid rgba(255,255,255,.18);
    }
    .np-creator-fallback{
      width: 44px; height: 44px;
      border-radius: 14px;
      display:grid; place-items:center;
      font-weight: 900;
      color:#fff;
      background: linear-gradient(135deg, var(--np-red), #ff8c8c);
      border: 1px solid rgba(255,255,255,.18);
    }
    .np-creator-name{ color:#fff; font-weight: 900; }
    .np-creator-sub{ color: rgba(255,255,255,.65); font-size: 12.5px; margin-top: 2px; }

    .np-spacer{ height: 18px; }

    /* Action bar */
    .np-actionbar{
      position: sticky;
      bottom: 0;
      z-index: 4;
      padding: 14px 18px 16px;
      border-top: 1px solid rgba(255,255,255,.08);
      background: linear-gradient(135deg, var(--np-bg1), var(--np-bg2));
    }
    .np-btn{
      border-radius: 14px;
      border: 1px solid rgba(255,255,255,.10);
      background: rgba(255,255,255,.06);
      color:#fff;
      cursor:pointer;
      font-weight: 900;
      display:inline-flex;
      gap: 10px;
      align-items:center;
      justify-content:center;
      padding: 12px 12px;
      transition: transform .12s ease, background .12s ease;
      user-select:none;
    }
    .np-btn:hover{ transform: translateY(-1px); background: rgba(255,255,255,.09); }
    .np-btn-full{ width:100%; }
    .np-btn-grid{ display:grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }

    .np-btn-primary{
      border: none;
      background: linear-gradient(135deg, var(--np-cyan), var(--np-blue));
    }
    .np-btn-ghost{
      border-color: rgba(0,224,255,.25);
      background: rgba(0,224,255,.08);
      color: var(--np-cyan);
    }
    .np-btn-success{
      border-color: rgba(0,255,136,.25);
      background: rgba(0,255,136,.10);
      color: var(--np-green);
    }
    .np-btn-warn{
      border-color: rgba(255,170,0,.35);
      background: rgba(255,170,0,.12);
      color: var(--np-warn);
    }

    .np-btn-project{
      border:none;
      background: linear-gradient(135deg, var(--np-red), #ff8c8c);
    }
    .np-btn-project-outline{
      border-color: rgba(255,107,107,.25);
      background: rgba(255,107,107,.08);
      color: var(--np-red);
    }

    .np-banner{
      display:flex;
      gap: 10px;
      align-items:center;
      justify-content:center;
      border-radius: 14px;
      padding: 12px;
      font-weight: 900;
      margin-bottom: 10px;
    }
    .np-banner-success{
      border: 1px solid rgba(0,255,136,.25);
      background: rgba(0,255,136,.10);
      color: var(--np-green);
    }
    .np-banner-warn{
      border: 1px solid rgba(255,170,0,.25);
      background: rgba(255,170,0,.10);
      color: var(--np-warn);
    }

    /* Modal */
    .np-noscroll{ overflow:hidden !important; }
    .np-modal-overlay{
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,.78);
      backdrop-filter: blur(6px);
      display: grid;
      place-items: center;
      z-index: 10000;
      opacity: 0;
      pointer-events: none;
      transition: opacity .18s ease;
      padding: 18px;
    }
    .np-modal-overlay.is-open{
      opacity: 1;
      pointer-events: auto;
    }
    .np-modal-card{
      width: min(680px, 94vw);
      max-height: 88vh;
      overflow: auto;
      border-radius: 18px;
      border: 2px solid rgba(0,224,255,.35);
      background: linear-gradient(135deg, var(--np-bg1), var(--np-bg2));
      box-shadow: 0 28px 90px rgba(0,224,255,.14);
      padding: 14px 14px 16px;
    }
    .np-modal-project .np-modal-card{
      border-color: rgba(255,107,107,.35);
      box-shadow: 0 28px 90px rgba(255,107,107,.12);
    }
    .np-modal-head{
      display:flex;
      justify-content: space-between;
      gap: 12px;
      align-items:flex-start;
      padding: 6px 6px 12px;
      border-bottom: 1px solid rgba(255,255,255,.08);
      margin-bottom: 12px;
    }
    .np-modal-title{
      color: var(--np-cyan);
      font-weight: 950;
      font-size: 16px;
    }
    .np-modal-project .np-modal-title{ color: var(--np-red); }
    .np-modal-sub{
      color: rgba(255,255,255,.70);
      font-size: 13px;
      margin-top: 4px;
      line-height: 1.35;
    }
    .np-modal-body{ padding: 6px; }

    .np-modal-list{ display:grid; gap: 10px; }
    .np-choice{
      width: 100%;
      text-align:left;
      border-radius: 14px;
      border: 1px solid rgba(0,224,255,.22);
      background: rgba(0,224,255,.06);
      color:#fff;
      padding: 12px 12px;
      cursor:pointer;
      transition: transform .12s ease, background .12s ease;
    }
    .np-choice:hover{ transform: translateY(-1px); background: rgba(0,224,255,.09); }
    .np-choice-project{
      border-color: rgba(255,107,107,.22);
      background: rgba(255,107,107,.06);
    }
    .np-choice-row{
      display:flex;
      align-items:flex-start;
      justify-content: space-between;
      gap: 12px;
    }
    .np-choice-title{ font-weight: 950; }
    .np-choice-sub{ color: rgba(255,255,255,.65); font-size: 13px; margin-top: 4px; line-height: 1.35; }
    .np-project-color{ color: var(--np-red); }

    .np-badge{
      border-radius: 999px;
      padding: 6px 10px;
      font-size: 11px;
      font-weight: 900;
      border: 1px solid rgba(255,255,255,.10);
      background: rgba(255,255,255,.06);
      color: rgba(255,255,255,.80);
      white-space: nowrap;
    }
    .np-badge-project{
      border-color: rgba(255,107,107,.25);
      background: rgba(255,107,107,.12);
      color: var(--np-red);
    }

    .np-form{ display:grid; gap: 10px; }
    .np-label{ color: rgba(255,255,255,.85); font-weight: 900; font-size: 13px; margin-top: 8px; }
    .np-input, .np-textarea{
      width: 100%;
      border-radius: 14px;
      border: 1px solid rgba(255,255,255,.12);
      background: rgba(255,255,255,.06);
      color: #fff;
      padding: 12px 12px;
      outline: none;
      font-family: inherit;
    }
    .np-input:focus, .np-textarea:focus{
      border-color: rgba(0,224,255,.55);
      box-shadow: 0 0 0 3px rgba(0,224,255,.16);
    }
    .np-form-row{ margin-top: 8px; }

    .is-busy{ opacity: .6; pointer-events:none; }

    /* Toast */
    .np-toast{
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 12000;
      border-radius: 14px;
      padding: 12px 14px;
      font-weight: 950;
      color:#fff;
      transform: translateY(14px);
      opacity: 0;
      transition: transform .18s ease, opacity .18s ease;
      box-shadow: 0 10px 30px rgba(0,0,0,.35);
    }
    .np-toast.is-in{ transform: translateY(0); opacity: 1; }
    .np-toast-success{ background: linear-gradient(135deg, var(--np-green), #00cc70); }
    .np-toast-info{ background: linear-gradient(135deg, var(--np-cyan), var(--np-blue)); }

    /* Header collapse behavior */
    .np-panel.np-header-collapsed .np-avatar-wrap{ width: 44px; height: 44px; }
    .np-panel.np-header-collapsed .np-avatar-img,
    .np-panel.np-header-collapsed .np-avatar-fallback,
    .np-panel.np-header-collapsed .np-project-icon{
      width: 44px; height: 44px;
      border-radius: 14px;
      font-size: 16px;
    }
    .np-panel.np-header-collapsed .np-pill-row{ display:none; }
    .np-panel.np-header-collapsed .np-header-meta{ display:none; }
    .np-panel.np-header-collapsed .np-header{ padding-bottom: 10px; }

    /* Very small widths */
    @media (max-width: 420px){
      .np-btn-grid{ grid-template-columns: 1fr; }
      .np-person-name{ max-width: 160px; }
    }

    /* Very short heights: header auto-collapses via JS, but tighten even more */
    @media (max-height: 640px){
      .np-header{ padding-top: 14px; }
      .np-body{ padding-top: 10px; }
      .np-collapse-btn{ padding: 9px 10px; }
    }
  `;

  document.head.appendChild(style);
}
