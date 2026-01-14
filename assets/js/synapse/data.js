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
  console.log("🔄 Loading synapse data with new theme-centric model...");

  // Load all data first
  const { data: members, error } = await supabase
    .from("community")
    .select("id, name, email, image_url, skills, interests, bio, availability, x, y, connection_count")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const { data: projects, error: projectsError } = await supabase
    .from("projects")
    .select("id, title, description, status, creator_id, required_skills, tags, upvote_count, created_at, theme_id")
    .in("status", ["open", "active", "in-progress"])
    .order("created_at", { ascending: false });

  if (projectsError) {
    console.warn("⚠️ Error loading projects:", projectsError);
  }

  // Load theme circles (active only, not expired)
  const { data: themes, error: themesError } = await supabase
    .from('theme_circles')
    .select('*')
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString());

  if (themesError) {
    console.warn('⚠️ Error loading themes:', themesError);
  }

  // Load theme participants (people connected to themes)
  const { data: themeParticipants, error: themeParticipantsError } = await supabase
    .from('theme_participants')
    .select('theme_id, community_id, signals, engagement_level');

  if (themeParticipantsError) {
    console.warn('⚠️ Error loading theme participants:', themeParticipantsError);
  }

  // Load project members (for seeding themes with projects)
  const projectMembersData = await getAllProjectMembers();

  // Load person-to-person connections
  const connectionsData = await getAllConnectionsForSynapse();

  console.log("📊 Raw data loaded:", {
    members: members?.length || 0,
    projects: projects?.length || 0,
    themes: themes?.length || 0,
    themeParticipants: themeParticipants?.length || 0,
    connections: connectionsData?.length || 0,
    projectMembers: projectMembersData?.length || 0
  });

  // NEW MODEL: Reorganize data around themes as primary containers
  
  // 1. Create theme nodes first (themes are the primary organizing structure)
  let nodes = [];
  let links = [];

  if (themes?.length) {
    // Seed themes with their projects
    const themeNodes = themes.map(theme => {
      // Find projects that belong to this theme
      const themeProjects = (projects || []).filter(p => p.theme_id === theme.id);
      
      // Count people participating in this theme
      const participantCount = (themeParticipants || []).filter(
        tp => tp.theme_id === theme.id
      ).length;

      // Check if current user participates in this theme
      const userParticipation = (themeParticipants || []).find(
        tp => tp.theme_id === theme.id && tp.community_id === currentUserCommunityId
      );

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
        project_count: themeProjects.length,
        projects: themeProjects, // Embed projects within themes
        origin_type: theme.origin_type,
        last_activity_at: theme.last_activity_at,
        cta_text: theme.cta_text,
        cta_link: theme.cta_link,
        user_engagement_level: userParticipation?.engagement_level || null,
        user_is_participant: !!userParticipation,
        x: theme.x || (window.innerWidth * 0.5 + (Math.random() * 120 - 60)),
        y: theme.y || (window.innerHeight * 0.5 + (Math.random() * 120 - 60))
      };
    });

    nodes = [...nodes, ...themeNodes];
    console.log("🎯 Created theme nodes:", themeNodes.length);
  }

  // 2. Create people nodes (people connect to themes, not directly to projects)
  if (members?.length) {
    let filteredMembers = members;
    
    // Filter members based on theme participation AND direct connections
    if (!showFullCommunity && currentUserCommunityId) {
      console.log("🔍 Filtering members. Current user ID:", currentUserCommunityId);
      console.log("🔍 Connections available:", connectionsData?.length || 0);
      if (connectionsData && connectionsData.length > 0) {
        console.log("🔍 Sample connection:", connectionsData[0]);
        console.log("🔍 Connection field names:", Object.keys(connectionsData[0]));
      }

      filteredMembers = members.filter(member => {
        if (member.id === currentUserCommunityId) return true;

        // Check if there's an ACCEPTED direct connection
        const hasAcceptedConnection = (connectionsData || []).some(conn => {
          const match = (conn.from_user_id === currentUserCommunityId && conn.to_user_id === member.id) ||
                        (conn.to_user_id === currentUserCommunityId && conn.from_user_id === member.id);

          // Only count accepted connections
          const isAccepted = String(conn.status || "").toLowerCase() === "accepted";

          if (match && isAccepted) {
            console.log("🎯 Found accepted connection!", {
              conn,
              currentUser: currentUserCommunityId,
              member: member.id,
              memberName: member.name,
              status: conn.status
            });
          }

          return match && isAccepted;
        });

        if (hasAcceptedConnection) {
          console.log("✅ Including user due to accepted connection:", member.name, member.id);
          return true;
        }

        // Show people who participate in the same themes as the current user
        const userThemes = (themeParticipants || [])
          .filter(tp => tp.community_id === currentUserCommunityId)
          .map(tp => tp.theme_id);

        const memberThemes = (themeParticipants || [])
          .filter(tp => tp.community_id === member.id)
          .map(tp => tp.theme_id);

        // Show if they share at least one theme
        return userThemes.some(themeId => memberThemes.includes(themeId));
      });
    }

    const peopleNodes = filteredMembers.map((member) => {
      const isCurrentUser = member.id === currentUserCommunityId;

      // Get themes this person participates in
      const userThemeParticipations = (themeParticipants || [])
        .filter(tp => tp.community_id === member.id);
      
      const userThemes = userThemeParticipations.map(tp => tp.theme_id);

      // Get projects this person is involved in (through project membership)
      const userProjects = projectMembersData.filter(pm => pm.user_id === member.id);
      const projectIds = userProjects.map(pm => pm.project_id);

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
        shouldShowImage: isCurrentUser || userThemes.length > 0, // Show image if they participate in themes
        themes: userThemes, // Themes they participate in
        themeParticipations: userThemeParticipations, // Full participation data
        projects: projectIds, // Projects they're involved in
        projectDetails: userProjects
      };
    });

    nodes = [...nodes, ...peopleNodes];
    console.log("👥 Created people nodes:", peopleNodes.length);
  }

  // 3. Create links: People → Themes (primary connection model)
  if (themeParticipants?.length) {
    const themeLinks = themeParticipants
      .filter(tp => {
        const themeNodeId = `theme:${tp.theme_id}`;
        const userNodeExists = nodes.some(n => n.id === tp.community_id);
        const themeNodeExists = nodes.some(n => n.id === themeNodeId);
        return userNodeExists && themeNodeExists;
      })
      .map(tp => ({
        id: `theme-participant-${tp.theme_id}-${tp.community_id}`,
        source: tp.community_id, // Person
        target: `theme:${tp.theme_id}`, // Theme
        status: "theme-participant",
        type: "theme",
        signals: tp.signals || "interested",
        engagement_level: tp.engagement_level || "observer"
      }));

    links = [...links, ...themeLinks];
    console.log("🔗 Created theme participation links:", themeLinks.length);
  }

  // 4. Add person-to-person connection links (for accepted and pending connections)
  console.log("🔍 Debug connections:", {
    connectionsCount: connectionsData?.length || 0,
    connections: connectionsData,
    nodeIds: nodes.filter(n => n.type === 'person').map(n => n.id)
  });

  if (connectionsData?.length) {
    const connectionLinks = connectionsData
      .filter(conn => {
        // Only show connections involving users in the graph
        const user1Exists = nodes.some(n => n.id === conn.from_user_id);
        const user2Exists = nodes.some(n => n.id === conn.to_user_id);

        if (!user1Exists || !user2Exists) {
          console.log("⚠️ Filtering out connection:", {
            from_user: conn.from_user_id,
            from_user_exists: user1Exists,
            to_user: conn.to_user_id,
            to_user_exists: user2Exists,
            status: conn.status
          });
        }

        return user1Exists && user2Exists;
      })
      .map(conn => ({
        id: `connection-${conn.from_user_id}-${conn.to_user_id}`,
        source: conn.from_user_id,
        target: conn.to_user_id,
        status: conn.status, // 'accepted' or 'pending'
        type: "connection",
        created_at: conn.created_at
      }));

    links = [...links, ...connectionLinks];
    console.log("🤝 Created connection links:", connectionLinks.length);
  } else {
    console.warn("⚠️ No connections data loaded from database");
  }

  // 5. NO direct project-member links (projects are embedded within themes)
  // Projects are now visual sub-elements of themes, not separate connected nodes

  // 6. Add suggested theme connections for discovery
  if (currentUserCommunityId) {
    const currentUser = nodes.find(n => n.id === currentUserCommunityId);
    if (currentUser) {
      const userSkills = currentUser.skills || [];
      const userThemes = currentUser.themes || [];

      // Suggest themes based on skills and interests
      const suggestedThemes = nodes
        .filter(n => n.type === 'theme' && !userThemes.includes(n.theme_id))
        .filter(theme => {
          // Suggest if theme has projects requiring user's skills
          const themeProjects = theme.projects || [];
          return themeProjects.some(project => {
            const requiredSkills = project.required_skills || [];
            return requiredSkills.some(skill => 
              userSkills.some(userSkill => 
                String(userSkill).toLowerCase().includes(String(skill).toLowerCase())
              )
            );
          });
        })
        .slice(0, 3); // Limit suggestions

      const suggestionLinks = suggestedThemes.map(theme => ({
        id: `suggested-theme-${currentUserCommunityId}-${theme.theme_id}`,
        source: currentUserCommunityId,
        target: theme.id,
        status: "suggested",
        type: "theme-suggestion"
      }));

      links = [...links, ...suggestionLinks];
      console.log("💡 Created theme suggestions:", suggestionLinks.length);
    }
  }

  console.log("✅ New synapse model loaded:", {
    totalNodes: nodes.length,
    totalLinks: links.length,
    themes: nodes.filter(n => n.type === 'theme').length,
    people: nodes.filter(n => n.type === 'person').length,
    themeConnections: links.filter(l => l.type === 'theme').length
  });

  return {
    nodes,
    links,
    connectionsData: connectionsData || [], // Person-to-person connections
    projectMembersData,
    projects: projects || [],
    themes: themes || []
  };
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
