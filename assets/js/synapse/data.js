// assets/js/synapse/data.js
console.log("✅ Synapse data module loaded:", new URL(import.meta.url).pathname);

import { getAllConnectionsForSynapse } from "../connections.js";
import { getAllProjectMembers } from "../projects.js";

// ID canonicalization cache to avoid repeated lookups
const communityIdCache = new Map();

/**
 * Resolve a user ID to its canonical community.id
 * Handles cases where connections may store auth.uid or other IDs
 * @param {string} id - The ID to resolve
 * @param {object} supabase - Supabase client
 * @param {Set} nodeIdSet - Set of known node IDs (community.id values)
 * @returns {Promise<string|null>} - Canonical community.id or null if not found
 */
async function resolveCommunityId(id, supabase, nodeIdSet) {
  if (!id) return null;
  
  // If already in cache, return cached value
  if (communityIdCache.has(id)) {
    return communityIdCache.get(id);
  }
  
  // If ID is already a known node, it's canonical
  if (nodeIdSet.has(id)) {
    communityIdCache.set(id, id);
    return id;
  }
  
  // Try to resolve via community table
  try {
    const { data, error } = await supabase
      .from('community')
      .select('id')
      .eq('id', id)
      .single();
    
    if (!error && data?.id) {
      communityIdCache.set(id, data.id);
      return data.id;
    }
  } catch (err) {
    // Silent fail - ID not found
  }
  
  // Mark as unresolvable
  communityIdCache.set(id, null);
  return null;
}

/**
 * Batch resolve multiple IDs to canonical community IDs
 * @param {Array<string>} ids - Array of IDs to resolve
 * @param {object} supabase - Supabase client
 * @param {Set} nodeIdSet - Set of known node IDs
 * @returns {Promise<Map<string, string>>} - Map of original ID to canonical ID
 */
async function batchResolveCommunityIds(ids, supabase, nodeIdSet) {
  const uniqueIds = [...new Set(ids)].filter(id => id && !communityIdCache.has(id) && !nodeIdSet.has(id));
  
  if (uniqueIds.length === 0) {
    // All IDs already cached or in nodeIdSet
    const result = new Map();
    ids.forEach(id => {
      if (nodeIdSet.has(id)) {
        result.set(id, id);
      } else if (communityIdCache.has(id)) {
        result.set(id, communityIdCache.get(id));
      }
    });
    return result;
  }
  
  // Batch query for uncached IDs
  try {
    const { data, error } = await supabase
      .from('community')
      .select('id')
      .in('id', uniqueIds);
    
    if (!error && data) {
      data.forEach(row => {
        communityIdCache.set(row.id, row.id);
      });
    }
  } catch (err) {
    console.warn('⚠️ Batch ID resolution failed:', err.message);
  }
  
  // Build result map
  const result = new Map();
  ids.forEach(id => {
    if (nodeIdSet.has(id)) {
      result.set(id, id);
    } else if (communityIdCache.has(id)) {
      result.set(id, communityIdCache.get(id));
    } else {
      result.set(id, null);
    }
  });
  
  return result;
}

export function parseSkills(skills) {
  if (!skills) return [];
  if (Array.isArray(skills)) return skills;
  if (typeof skills === "string") return skills.split(",").map(s => s.trim()).filter(Boolean);
  return [];
}

export async function loadSynapseData({ supabase, currentUserCommunityId, showFullCommunity = false }) {
  console.log("🔄 Loading synapse data with new theme-centric model...");
  console.log("🔍 showFullCommunity (Discovery Mode):", showFullCommunity);

  // Load all data first (exclude hidden users)
  // ✅ EGRESS OPTIMIZATION: Only fetch fields needed for synapse visualization
  const { data: allMembers, error } = await supabase
    .from("community")
    .select("id, name, image_url, skills, interests, bio, availability, x, y, connection_count")
    .or("is_hidden.is.null,is_hidden.eq.false") // Only show non-hidden users
    .order("created_at", { ascending: false })
    .limit(500); // Add limit to prevent excessive data fetching
  if (error) throw error;

  // Discovery Mode: Show ALL users (no filtering)
  let members = allMembers;
  if (showFullCommunity) {
    // Discovery Mode: Show everyone in the community
    console.log("🌐 Discovery Mode: Loading ALL community members...");
    members = allMembers || [];
    console.log(`📊 Discovery Mode: Showing all ${members.length} members`);
  } else {
    // My Network Mode (deprecated but keeping for reference)
    console.log(`📊 My Network: Loading all ${members?.length || 0} members for filtering`);
  }

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

  // Load organizations
  const { data: organizations, error: orgsError } = await supabase
    .from('organizations')
    .select('id, name, slug, description, website, industry, size, location, logo_url, verified');

  if (orgsError) {
    console.warn('⚠️ Error loading organizations:', orgsError);
  }

  // Load organization members (to link people to orgs)
  // Note: This table may not exist or have RLS policies that block access
  let orgMembers = [];
  try {
    const { data: orgMembersData, error: orgMembersError } = await supabase
      .from('organization_members')
      .select('organization_id, community_id, role');

    if (orgMembersError) {
      // 500 errors often mean table doesn't exist or RLS issue
      if (orgMembersError.code === 'PGRST116' || orgMembersError.message?.includes('does not exist')) {
        console.warn('⚠️ organization_members table does not exist - skipping org membership loading');
      } else {
        console.warn('⚠️ Error loading organization members:', orgMembersError.message || orgMembersError);
      }
    } else {
      orgMembers = orgMembersData || [];
    }
  } catch (err) {
    console.warn('⚠️ Exception loading organization members:', err.message);
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
  // Note: getAllConnectionsForSynapse uses module-level supabase from connections.js
  // Make sure connections.js is initialized before calling this
  const connectionsData = await getAllConnectionsForSynapse();
  
  console.log("🔍 DEBUG: Connections loaded:", {
    count: connectionsData?.length || 0,
    sample: connectionsData?.[0],
    currentUser: currentUserCommunityId
  });

  console.log("📊 Raw data loaded:", {
    members: members?.length || 0,
    projects: projects?.length || 0,
    themes: themes?.length || 0,
    organizations: organizations?.length || 0,
    orgMembers: orgMembers?.length || 0,
    themeParticipants: themeParticipants?.length || 0,
    connections: connectionsData?.length || 0,
    projectMembers: projectMembersData?.length || 0
  });

  // Debug: Log projects and their theme associations
  if (projects && projects.length > 0) {
    console.log("🔍 Projects with themes:");
    const projectsWithThemes = projects.filter(p => p.theme_id);
    const projectsWithoutThemes = projects.filter(p => !p.theme_id);
    console.log(`  ✅ ${projectsWithThemes.length} projects WITH theme_id`);
    console.log(`  ⚠️  ${projectsWithoutThemes.length} projects WITHOUT theme_id (won't appear in synapse)`);
    if (projectsWithThemes.length > 0) {
      console.log("  Sample project with theme:", projectsWithThemes[0]);
    }
    if (projectsWithoutThemes.length > 0) {
      console.log("  Sample project without theme:", projectsWithoutThemes[0]);
    }
  }

  // Debug: Log current user's project memberships
  if (currentUserCommunityId && projectMembersData && projectMembersData.length > 0) {
    const userProjectMemberships = projectMembersData.filter(pm => pm.user_id === currentUserCommunityId);
    console.log(`🔍 Current user (${currentUserCommunityId}) has ${userProjectMemberships.length} project memberships:`);
    userProjectMemberships.forEach(pm => {
      console.log(`  - Project: ${pm.project?.title || pm.project_id}, Role: ${pm.role}`);
    });
  } else if (currentUserCommunityId) {
    console.warn(`⚠️ Current user (${currentUserCommunityId}) has NO project memberships in database`);
  }

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

    // Debug: Log themes with projects
    const themesWithProjects = themeNodes.filter(t => t.projects && t.projects.length > 0);
    console.log(`  📦 ${themesWithProjects.length} themes have projects:`);
    themesWithProjects.forEach(t => {
      console.log(`    - ${t.title}: ${t.projects.length} projects`, t.projects.map(p => p.title));
    });
  }

  // 2. Create project nodes (projects are standalone entities that belong to themes)
  if (projects?.length) {
    const projectNodes = projects
      // Include ALL projects, even those without theme_id
      .map(project => ({
        id: project.id,
        type: 'project',
        name: project.title,
        title: project.title,
        description: project.description,
        theme_id: project.theme_id,
        status: project.status || 'active',
        required_skills: project.required_skills || [],
        tags: project.tags || [],
        team_size: project.team_size || 0,
        creator_id: project.creator_id,
        created_at: project.created_at,
        view_count: project.view_count || 0,
        // Position will be calculated by layout algorithm
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight
      }));

    nodes = [...nodes, ...projectNodes];
    console.log("💡 Created project nodes:", projectNodes.length);
    
    if (projectNodes.length > 0) {
      console.log("  Sample project node:", projectNodes[0]);
    }
  }

  // 3. Create people nodes (people connect to themes, not directly to projects)
  if (members?.length) {
    let filteredMembers = members;
    
    // Filter members based on theme participation AND direct connections (including pending)
    if (!showFullCommunity && currentUserCommunityId) {
      console.log("🔍 Filtering members for My Network mode:");
      console.log("  - Current user ID:", currentUserCommunityId);
      console.log("  - Total members before filter:", members.length);
      console.log("  - Connections available:", connectionsData?.length || 0);
      console.log("  - Theme participants available:", themeParticipants?.length || 0);
      
      if (connectionsData && connectionsData.length > 0) {
        console.log("  - Sample connection:", connectionsData[0]);
        console.log("  - All connections:", connectionsData);
      } else {
        console.warn("  ⚠️ NO CONNECTIONS DATA - users won't see connected people!");
      }

      filteredMembers = members.filter(member => {
        if (member.id === currentUserCommunityId) return true;

        // Check if there's an ACCEPTED or PENDING direct connection
        const hasConnection = (connectionsData || []).some(conn => {
          const match = (conn.from_user_id === currentUserCommunityId && conn.to_user_id === member.id) ||
                        (conn.to_user_id === currentUserCommunityId && conn.from_user_id === member.id);

          // Count both accepted AND pending connections
          const status = String(conn.status || "").toLowerCase();
          const isActiveConnection = status === "accepted" || status === "pending";

          if (match && isActiveConnection) {
            console.log("  🎯 Found connection!", {
              memberName: member.name,
              memberId: member.id,
              status: conn.status,
              from: conn.from_user_id,
              to: conn.to_user_id
            });
          }

          return match && isActiveConnection;
        });

        if (hasConnection) {
          console.log("  ✅ Including user due to connection:", member.name, member.id);
          return true;
        }

        // Show people who participate in the same themes as the current user
        const userThemes = (themeParticipants || [])
          .filter(tp => tp.community_id === currentUserCommunityId)
          .map(tp => tp.theme_id);

        const memberThemes = (themeParticipants || [])
          .filter(tp => tp.community_id === member.id)
          .map(tp => tp.theme_id);

        const hasSharedTheme = userThemes.some(themeId => memberThemes.includes(themeId));
        
        if (hasSharedTheme) {
          console.log("  ✅ Including user due to shared theme:", member.name, member.id);
        }

        // Show if they share at least one theme
        return hasSharedTheme;
      });
      
      console.log("  📊 After filtering: " + filteredMembers.length + " members will be shown");
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

      // Check if this person is connected to the current user (accepted or pending)
      const connectionToCurrentUser = (connectionsData || []).find(conn => {
        return (conn.from_user_id === currentUserCommunityId && conn.to_user_id === member.id) ||
               (conn.to_user_id === currentUserCommunityId && conn.from_user_id === member.id);
      });
      
      const connectionStatus = connectionToCurrentUser ? String(connectionToCurrentUser.status || "").toLowerCase() : null;
      const isConnectedToCurrentUser = connectionStatus === "accepted" || connectionStatus === "pending";

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
        shouldShowImage: isCurrentUser || userThemes.length > 0 || isConnectedToCurrentUser, // Show image if current user, has themes, or is connected
        themes: userThemes, // Themes they participate in
        themeParticipations: userThemeParticipations, // Full participation data
        projects: projectIds, // Projects they're involved in
        projectDetails: userProjects,
        isConnectedToCurrentUser // Add this for debugging
      };
    });

    nodes = [...nodes, ...peopleNodes];
    console.log("👥 Created people nodes:", peopleNodes.length);

    // Debug: Log image visibility stats
    const peopleWithImages = peopleNodes.filter(p => p.shouldShowImage);
    const connectedPeople = peopleNodes.filter(p => p.isConnectedToCurrentUser);
    console.log("🖼️ Image visibility stats:");
    console.log(`  - Total people: ${peopleNodes.length}`);
    console.log(`  - Should show images: ${peopleWithImages.length}`);
    console.log(`  - Connected to current user: ${connectedPeople.length}`);
    console.log(`  - People with image URLs: ${peopleNodes.filter(p => p.image_url).length}`);

    // Debug: Log current user's node data
    const currentUserNode = peopleNodes.find(p => p.id === currentUserCommunityId);
    if (currentUserNode) {
      console.log("🔍 Current user node data:");
      console.log(`  - Name: ${currentUserNode.name}`);
      console.log(`  - Themes: ${currentUserNode.themes.length}`, currentUserNode.themes);
      console.log(`  - Projects: ${currentUserNode.projects.length}`, currentUserNode.projects);
      console.log(`  - Project details:`, currentUserNode.projectDetails);
    }
  }

  // 3b. Create organization nodes
  if (organizations?.length) {
    const orgNodes = organizations.map(org => {
      const memberCount = (orgMembers || []).filter(m => m.organization_id === org.id).length;
      return {
        id: `org:${org.id}`,
        org_id: org.id,
        type: 'organization',
        name: org.name,
        description: org.description,
        website: org.website,
        industry: org.industry,
        size: org.size,
        location: org.location,
        logo_url: org.logo_url,
        verified: org.verified,
        slug: org.slug,
        member_count: memberCount,
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight
      };
    });

    nodes = [...nodes, ...orgNodes];
    console.log("🏢 Created organization nodes:", orgNodes.length);
  }

  // 3c. Create org membership links (people → organizations)
  if (orgMembers?.length) {
    const orgLinks = orgMembers
      .filter(om => {
        const orgNodeId = `org:${om.organization_id}`;
        const userNodeExists = nodes.some(n => n.id === om.community_id);
        const orgNodeExists = nodes.some(n => n.id === orgNodeId);
        return userNodeExists && orgNodeExists;
      })
      .map(om => ({
        id: `org-member-${om.organization_id}-${om.community_id}`,
        source: om.community_id,
        target: `org:${om.organization_id}`,
        status: "org-member",
        type: "organization",
        role: om.role
      }));

    links = [...links, ...orgLinks];
    console.log("🏢 Created organization membership links:", orgLinks.length);
  }

  // 4. Create links: People → Themes (primary connection model)
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

  // 5. Add person-to-person connection links (for accepted and pending connections)
  console.log("🔍 Debug connections:", {
    connectionsCount: connectionsData?.length || 0,
    connections: connectionsData,
    nodeIds: nodes.filter(n => n.type === 'person').map(n => n.id)
  });

  if (connectionsData?.length) {
    // Build set of known node IDs for fast lookup
    const nodeIdSet = new Set(nodes.filter(n => n.type === 'person').map(n => n.id));
    
    // Collect all unique endpoint IDs from connections
    const allEndpointIds = new Set();
    connectionsData.forEach(conn => {
      if (conn.from_user_id) allEndpointIds.add(conn.from_user_id);
      if (conn.to_user_id) allEndpointIds.add(conn.to_user_id);
    });
    
    // Batch resolve IDs to canonical community IDs
    const idResolutionMap = await batchResolveCommunityIds([...allEndpointIds], supabase, nodeIdSet);
    
    // Track orphans to avoid duplicate logging
    const orphanLog = new Set();
    const isDebugMode = window.log?.isDebugMode?.() || window.__DEBUG_SYNAPSE__;
    
    const connectionLinks = connectionsData
      .filter(conn => {
        const status = String(conn.status || "").toLowerCase();

        // ✅ Only draw links that belong on the graph
        if (status !== "pending" && status !== "accepted") {
          if (isDebugMode) {
            console.log("⚠️ Skipping connection with status:", status, conn);
          }
          return false;
        }

        // Resolve IDs to canonical community IDs
        const fromId = idResolutionMap.get(conn.from_user_id) || conn.from_user_id;
        const toId = idResolutionMap.get(conn.to_user_id) || conn.to_user_id;
        
        // Only show connections involving users in the graph
        const user1Exists = nodeIdSet.has(fromId);
        const user2Exists = nodeIdSet.has(toId);

        if (!user1Exists || !user2Exists) {
          // Only log each unique orphan once and only in debug mode
          const orphanKey = `${fromId}->${toId}:${status}`;
          if (isDebugMode && !orphanLog.has(orphanKey)) {
            orphanLog.add(orphanKey);
            console.log("⚠️ Filtering out connection (user not in graph):", {
              from_user: conn.from_user_id,
              from_user_canonical: fromId,
              from_user_exists: user1Exists,
              to_user: conn.to_user_id,
              to_user_canonical: toId,
              to_user_exists: user2Exists,
              status: conn.status
            });
          }
        }

        return user1Exists && user2Exists;
      })
      .map(conn => {
        // Use canonical IDs for source/target
        const fromId = idResolutionMap.get(conn.from_user_id) || conn.from_user_id;
        const toId = idResolutionMap.get(conn.to_user_id) || conn.to_user_id;
        
        return {
          // ✅ Use row id to avoid collisions across time for same pair
          id: `connection:${conn.id}`,
          source: fromId,
          target: toId,
          status: String(conn.status || "").toLowerCase(), // pending | accepted
          type: "connection",
          created_at: conn.created_at
        };
      });


    links = [...links, ...connectionLinks];
    console.log("🤝 Created connection links:", connectionLinks.length, connectionLinks);
  } else {
    console.warn("⚠️ No connections data loaded from database");
  }

  // 5. Add project-member links (people → projects with dotted lines for pending)
  if (projectMembersData?.length) {
    const projectMemberLinks = projectMembersData
      .filter(pm => {
        const userNodeExists = nodes.some(n => n.id === pm.user_id);
        const projectNodeExists = nodes.some(n => n.id === pm.project_id);
        return userNodeExists && projectNodeExists;
      })
      .map(pm => ({
        id: `project-member-${pm.project_id}-${pm.user_id}`,
        source: pm.user_id, // Person
        target: pm.project_id, // Project
        status: pm.role === 'pending' ? 'pending' : 'accepted', // Dotted line for pending, solid for accepted
        type: "project-member",
        role: pm.role
      }));

    links = [...links, ...projectMemberLinks];
    console.log("💼 Created project-member links:", projectMemberLinks.length);
  }

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
    projects: nodes.filter(n => n.type === 'project').length,
    people: nodes.filter(n => n.type === 'person').length,
    organizations: nodes.filter(n => n.type === 'organization').length,
    themeConnections: links.filter(l => l.type === 'theme').length,
    orgConnections: links.filter(l => l.type === 'organization').length
  });

  return {
    nodes,
    links,
    connectionsData: connectionsData || [], // Person-to-person connections
    projectMembersData,
    projects: projects || [],
    themes: themes || [],
    organizations: organizations || []
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

// ============================================================================
// ADMIN AUDIT UTILITIES
// ============================================================================

/**
 * Audit connections to identify orphans and fixable issues
 * @returns {Promise<object>} Audit report
 */
async function auditConnections() {
  console.log("🔍 Starting connection audit...");
  
  if (!window.supabase) {
    console.error("❌ Supabase client not available");
    return { error: "Supabase not initialized" };
  }
  
  // Load all connections
  const { data: connections, error: connError } = await window.supabase
    .from('connections')
    .select('*')
    .limit(1000);
  
  if (connError) {
    console.error("❌ Error loading connections:", connError);
    return { error: connError.message };
  }
  
  // Load all community members
  const { data: community, error: commError } = await window.supabase
    .from('community')
    .select('id, name, email')
    .limit(1000);
  
  if (commError) {
    console.error("❌ Error loading community:", commError);
    return { error: commError.message };
  }
  
  const communityIdSet = new Set(community.map(c => c.id));
  const communityMap = new Map(community.map(c => [c.id, c]));
  
  // Analyze connections
  const orphans = [];
  const fixable = [];
  const valid = [];
  
  for (const conn of connections) {
    const fromExists = communityIdSet.has(conn.from_user_id);
    const toExists = communityIdSet.has(conn.to_user_id);
    
    if (fromExists && toExists) {
      valid.push(conn);
    } else {
      const orphan = {
        id: conn.id,
        from_user_id: conn.from_user_id,
        to_user_id: conn.to_user_id,
        status: conn.status,
        from_exists: fromExists,
        to_exists: toExists,
        from_name: communityMap.get(conn.from_user_id)?.name || 'NOT FOUND',
        to_name: communityMap.get(conn.to_user_id)?.name || 'NOT FOUND'
      };
      
      orphans.push(orphan);
      
      // Check if fixable (could resolve via auth.uid lookup, etc.)
      // For now, mark as potentially fixable if one side exists
      if (fromExists || toExists) {
        fixable.push(orphan);
      }
    }
  }
  
  const report = {
    total: connections.length,
    valid: valid.length,
    orphans: orphans.length,
    fixable: fixable.length,
    orphanSamples: orphans.slice(0, 10),
    fixableSamples: fixable.slice(0, 10)
  };
  
  console.log("📊 Connection Audit Report:");
  console.log(`  Total connections: ${report.total}`);
  console.log(`  Valid connections: ${report.valid} (${(report.valid/report.total*100).toFixed(1)}%)`);
  console.log(`  Orphan connections: ${report.orphans} (${(report.orphans/report.total*100).toFixed(1)}%)`);
  console.log(`  Potentially fixable: ${report.fixable}`);
  
  if (orphans.length > 0) {
    console.log("\n⚠️ Sample orphan connections:");
    console.table(report.orphanSamples);
  }
  
  return report;
}

/**
 * Repair connections by updating to canonical community IDs
 * @param {object} options - Repair options
 * @param {boolean} options.dryRun - If true, only report what would be fixed (default: true)
 * @returns {Promise<object>} Repair report
 */
async function repairConnections({ dryRun = true } = {}) {
  console.log(`🔧 Starting connection repair (${dryRun ? 'DRY RUN' : 'LIVE MODE'})...`);
  
  if (!window.supabase) {
    console.error("❌ Supabase client not available");
    return { error: "Supabase not initialized" };
  }
  
  // First run audit to identify issues
  const audit = await auditConnections();
  
  if (audit.error) {
    return audit;
  }
  
  if (audit.fixable === 0) {
    console.log("✅ No fixable connections found");
    return { ...audit, repaired: 0 };
  }
  
  console.log(`\n🔧 Found ${audit.fixable} potentially fixable connections`);
  
  if (dryRun) {
    console.log("ℹ️ DRY RUN MODE - No changes will be made");
    console.log("ℹ️ To apply fixes, call: repairConnections({ dryRun: false })");
    return { ...audit, repaired: 0, dryRun: true };
  }
  
  // TODO: Implement actual repair logic
  // This would involve:
  // 1. Attempting to resolve orphan IDs via auth.uid lookups
  // 2. Updating connection rows with canonical community IDs
  // 3. Logging all changes for audit trail
  
  console.warn("⚠️ Live repair not yet implemented - only dry run available");
  console.warn("⚠️ Manual intervention required for orphan connections");
  
  return { ...audit, repaired: 0, message: "Live repair not yet implemented" };
}

// Export audit utilities to window for console access
if (typeof window !== 'undefined') {
  window.auditConnections = auditConnections;
  window.repairConnections = repairConnections;
  console.log("✅ Admin audit utilities available: window.auditConnections(), window.repairConnections()");
}

export { auditConnections, repairConnections };
