// assets/js/synapse/data.js

import { getAllConnectionsForSynapse } from "../connections.js";
import { getAllProjectMembers } from "../projects.js";

export function parseSkills(skills) {
  if (!skills) return [];
  if (Array.isArray(skills)) return skills;
  if (typeof skills === "string") return skills.split(",").map(s => s.trim()).filter(Boolean);
  return [];
}

export async function loadSynapseData({ supabase, currentUserCommunityId }) {
  // Community members
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
    .select("id, title, description, status, creator_id, required_skills, tags, upvote_count, created_at")
    .in("status", ["open", "active", "in-progress"])
    .order("created_at", { ascending: false });

  if (projectsError) {
    // non-fatal
    console.warn("⚠️ Error loading projects:", projectsError);
  }

  let nodes = (members || []).map((member) => {
    const isCurrentUser = member.id === currentUserCommunityId;

    const hasConnection = connectionsData.some(conn =>
      (conn.from_user_id === currentUserCommunityId && conn.to_user_id === member.id) ||
      (conn.to_user_id === currentUserCommunityId && conn.from_user_id === member.id)
    );

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
      shouldShowImage: isCurrentUser || hasConnection,
      projects: projectIds,
      projectDetails: userProjects
    };
  });

  if (projects?.length) {
    const projectNodes = projects.map(project => {
      const teamMembers = projectMembersData.filter(pm => pm.project_id === project.id);
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
        team_size: teamMembers.length,
        team_members: teamMembers,
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight
      };
    });
    nodes = [...nodes, ...projectNodes];
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

  // Suggested links (current-user only)
  ({ links, nodes } = addSuggestedLinks({ links, nodes, currentUserCommunityId }));

  return { nodes, links, connectionsData, projectMembersData, projects: projects || [] };
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
