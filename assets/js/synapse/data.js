// assets/js/synapse/data.js

import { getAllConnectionsForSynapse } from "../connections.js";
import { getAllProjectMembers } from "../projects.js";

export function parseSkills(skills) {
  if (!skills) return [];
  if (Array.isArray(skills)) return skills;
  if (typeof skills === "string") return skills.split(",").map(s => s.trim()).filter(Boolean);
  return [];
}

export async function loadSynapseData({ supabase, currentUserCommunityId, showFullCommunity = false }) {
  // Community members
  // If showFullCommunity is false (default), we filter to only show connected people
  const { data: members, error } = await supabase
    .from("community")
    .select("id, name, email, image_url, skills, interests, bio, availability, x, y, connection_count")
    .order("created_at", { ascending: false });
  if (error) throw error;

  // Connections & projects
  const connectionsData = await getAllConnectionsForSynapse();
  const projectMembersData = await getAllProjectMembers();

  const { data: projects, error: projectsError } = await supabase
    .from("projects")
    .select("id, title, description, status, creator_id, required_skills, tags, upvote_count, created_at, theme_id")
    .in("status", ["open", "active", "in-progress"])
    .order("created_at", { ascending: false });

  if (projectsError) {
    // non-fatal
    console.warn("⚠️ Error loading projects:", projectsError);
  }

  // Load theme circles (active only, not expired)
  // Add error handling to prevent synapse initialization failure
  let themes = [];
  try {
    const { data: themeData, error: themesError } = await supabase
      .from('theme_circles')
      .select('*')
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString());

    if (themesError) {
      console.warn('⚠️ Error loading themes:', themesError);
      // Continue without themes rather than failing
      themes = [];
    } else {
      themes = themeData || [];
    }
  } catch (error) {
    console.warn('⚠️ Theme table may not exist yet:', error);
    themes = [];
  }

  // Load theme participants
  let themeParticipants = [];
  try {
    const { data: participantData, error: themeParticipantsError } = await supabase
      .from('theme_participants')
      .select('theme_id, community_id, signals, engagement_level');

    if (themeParticipantsError) {
      console.warn('⚠️ Error loading theme participants:', themeParticipantsError);
      themeParticipants = [];
    } else {
      themeParticipants = participantData || [];
    }
  } catch (error) {
    console.warn('⚠️ Theme participants table may not exist yet:', error);
    themeParticipants = [];
  }

  // Filter members if not showing full community
  let filteredMembers = members || [];
  if (!showFullCommunity && currentUserCommunityId) {
    // Only show: current user + people with connections
    filteredMembers = (members || []).filter(member => {
      if (member.id === currentUserCommunityId) return true;

      const hasConnection = connectionsData.some(conn =>
        ((conn.from_user_id === currentUserCommunityId && conn.to_user_id === member.id) ||
        (conn.to_user_id === currentUserCommunityId && conn.from_user_id === member.id)) &&
        (conn.status === 'accepted' || conn.status === 'active' || conn.status === 'connected')
      );

      return hasConnection;
    });
  }

  let nodes = filteredMembers.map((member) => {
    const isCurrentUser = member.id === currentUserCommunityId;

    const hasConnection = connectionsData.some(conn =>
      (conn.from_user_id === currentUserCommunityId && conn.to_user_id === member.id) ||
      (conn.to_user_id === currentUserCommunityId && conn.from_user_id === member.id)
    );

    const userProjects = projectMembersData.filter(pm => pm.user_id === member.id);
    const projectIds = userProjects.map(pm => pm.project_id);

    // Get themes this person participates in
    const userThemes = (themeParticipants || [])
      .filter(tp => tp.community_id === member.id)
      .map(tp => tp.theme_id);

    return {
      id: member.id,
      type: "person",
      name: member.name || "Anonymous",
      email: member.email,
      image_url: member.image_url,
      skills: parseSkills(member.skills),
      interests: member.interests || [],
      bio: member.bio,
      availability: member.availability || "Available",
      connection_count: member.connection_count || 0,
      x: member.x || Math.random() * window.innerWidth,
      y: member.y || Math.random() * window.innerHeight,
      isCurrentUser,
      shouldShowImage: isCurrentUser || hasConnection,
      projects: projectIds,
      projectDetails: userProjects,
      themes: userThemes // Track theme participation
    };
  });

  if (projects?.length) {
    let filteredProjects = projects;

    // Filter projects if not showing full community
    if (!showFullCommunity && currentUserCommunityId) {
      // Only show projects the user is a member of
      const userProjectIds = projectMembersData
        .filter(pm => pm.user_id === currentUserCommunityId)
        .map(pm => pm.project_id);

      filteredProjects = projects.filter(project => userProjectIds.includes(project.id));
    }

    const projectNodes = filteredProjects.map(project => {
      const teamMembers = projectMembersData.filter(pm => pm.project_id === project.id);

      // Per yellow instructions: Position projects near their theme circle
      let initialX = Math.random() * window.innerWidth;
      let initialY = Math.random() * window.innerHeight;

      if (project.theme_id) {
        // Find the theme node to position project near it
        const themeNodeId = `theme:${project.theme_id}`;
        const existingThemeNode = nodes.find(n => n.id === themeNodeId);

        if (existingThemeNode && existingThemeNode.x && existingThemeNode.y) {
          // Position project in UPPER HALF of the theme well
          // Theme radius is 70-90px, position projects in upper portion
          // Angle range: -120° to -60° (upper arc)
          const angle = (-120 + Math.random() * 60) * (Math.PI / 180);
          const distance = 20 + Math.random() * 35; // 20-55px from center
          initialX = existingThemeNode.x + Math.cos(angle) * distance;
          initialY = existingThemeNode.y + Math.sin(angle) * distance;
        }
      }

      return {
        id: project.id,
        type: "project",
        name: project.title,
        title: project.title,
        description: project.description,
        status: project.status,
        creator_id: project.creator_id,
        required_skills: project.required_skills || [],
        tags: project.tags || [],
        upvote_count: project.upvote_count || 0,
        theme_id: project.theme_id || null,  // Include theme assignment
        team_size: teamMembers.length,
        team_members: teamMembers,
        x: initialX,
        y: initialY
      };
    });
    nodes = [...nodes, ...projectNodes];
  }

  // Create theme nodes
  if (themes?.length) {
    // NOTE: Always show all active themes, regardless of showFullCommunity setting
    // Themes are organizational structures that need to be visible for discovery
    // and navigation. We just highlight user participation differently.
    const filteredThemes = themes;

    const themeNodes = filteredThemes
      .map(theme => {
        // Check if user is participating and get their engagement level
        const userParticipation = (themeParticipants || []).find(
          tp => tp.theme_id === theme.id && tp.community_id === currentUserCommunityId
        );

        // Count total participants for this theme
        const participantCount = (themeParticipants || []).filter(
          tp => tp.theme_id === theme.id
        ).length;

        return {
          id: `theme:${theme.id}`,
          theme_id: theme.id,
          type: 'theme',
          name: theme.title,
          title: theme.title,
          description: theme.description,
          tags: theme.tags || [],
          created_at: theme.created_at,
          expires_at: theme.expires_at,
          activity_score: theme.activity_score || 0,
          participant_count: participantCount,
          origin_type: theme.origin_type,
          last_activity_at: theme.last_activity_at,
          cta_text: theme.cta_text,
          cta_link: theme.cta_link,
          user_engagement_level: userParticipation?.engagement_level || null,
          user_is_participant: !!userParticipation,
          x: theme.x || (window.innerWidth * 0.5 + (Math.random() * 120 - 60)),
          y: theme.y || (window.innerHeight * 0.5 + (Math.random() * 120 - 60))
        };
      })
      // Filter themes based on admin status and participation
      .filter(theme => {
        // Always show if user is participating
        if (theme.user_is_participant) return true;

        // Check if user is admin (admins can see all themes)
        const isAdmin = typeof window.isAdminUser === 'function' && window.isAdminUser();
        if (isAdmin) return true;

        // Non-admin users only see themes with at least 1 participant
        return theme.participant_count > 0;
      });
    nodes = [...nodes, ...themeNodes];
  }

  // Links
  let links = connectionsData.map(conn => ({
    id: conn.id,
    source: conn.from_user_id,
    target: conn.to_user_id,
    status: conn.status,
    type: conn.type || "manual"
  })).filter(l => nodes.some(n => n.id === l.source) && nodes.some(n => n.id === l.target));

  // Project-member links
  projectMembersData.forEach(pm => {
    if (nodes.some(n => n.id === pm.project_id) && nodes.some(n => n.id === pm.user_id)) {
      links.push({
        id: `project-member-${pm.project_id}-${pm.user_id}`,
        source: pm.project_id,
        target: pm.user_id,
        status: "project-member",
        type: "project"
      });
    }
  });

  // Theme-participant links
  (themeParticipants || []).forEach(tp => {
    const themeNodeId = `theme:${tp.theme_id}`;
    const userNodeExists = nodes.some(n => n.id === tp.community_id);
    const themeNodeExists = nodes.some(n => n.id === themeNodeId);

    if (userNodeExists && themeNodeExists) {
      links.push({
        id: `theme-participant-${tp.theme_id}-${tp.community_id}`,
        source: themeNodeId,
        target: tp.community_id,
        status: "theme-participant",
        type: "theme",
        signals: tp.signals || "interested",
        engagement_level: tp.engagement_level || "observer"
      });
    }
  });

  // Suggested links (current-user only)
  ({ links, nodes } = addSuggestedLinks({ links, nodes, currentUserCommunityId }));

  return { nodes, links, connectionsData, projectMembersData, projects: projects || [], themes: themes || [] };
}

function addSuggestedLinks({ links, nodes, currentUserCommunityId }) {
  const existingPairs = new Set(
    links.map(l => [toId(l.source), toId(l.target)].sort().join("-"))
  );

  const me = nodes.find(n => n.type === "person" && n.id === currentUserCommunityId);
  if (!me) return { links, nodes };

  for (const other of nodes) {
    if (other.type !== "person") continue;
    if (other.id === me.id) continue;

    const pairKey = [me.id, other.id].sort().join("-");
    if (existingPairs.has(pairKey)) continue;

    const sharedSkills = (me.skills || []).filter(s =>
      (other.skills || []).map(sk => String(sk).toLowerCase()).includes(String(s).toLowerCase())
    );

    if (sharedSkills.length >= 2) {
      links.push({
        id: `suggested-${pairKey}`,
        source: me.id,
        target: other.id,
        status: "suggested",
        type: "auto",
        sharedSkills
      });
      other.isSuggested = true;
    }
  }

  return { links, nodes };
}

function toId(v) {
  return typeof v === "object" && v?.id ? v.id : v;
}
