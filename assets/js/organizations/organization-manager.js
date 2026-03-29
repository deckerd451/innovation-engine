// ================================================================
// CharlestonHacks Innovation Engine — ORGANIZATION MANAGER
// File: /assets/js/organizations/organization-manager.js
// ================================================================
// Handles CRUD operations for organizations, members, and followers
//
// Features:
// ✅ Organization creation, update, deletion
// ✅ Member management (add, remove, update roles)
// ✅ Follow/unfollow organizations
// ✅ Organization search and filtering
// ✅ Type-safe database operations
//
// Exports:
//  - initOrganizationManager(supabaseClient)
//  - createOrganization(organizationData)
//  - updateOrganization(id, updates)
//  - deleteOrganization(id)
//  - getOrganization(idOrSlug)
//  - getOrganizations(filters)
//  - followOrganization(organizationId)
//  - unfollowOrganization(organizationId)
//  - addMember(organizationId, communityId, role, permissions)
//  - removeMember(organizationId, communityId)
//  - updateMemberRole(organizationId, communityId, role, permissions)
//  - getOrganizationMembers(organizationId)
//  - isUserMember(organizationId)
//  - canUserEdit(organizationId)
// ================================================================

/* global console */

// ========================
// TOAST NOTIFICATION SYSTEM
// ========================
function showToast(message, type = "info") {
  if (typeof document === "undefined") return;

  const toast = document.createElement("div");
  toast.className = `organization-toast toast-${type}`;
  toast.innerHTML = `
    <i class="fas fa-${
      type === "success"
        ? "check-circle"
        : type === "error"
        ? "exclamation-circle"
        : "info-circle"
    }"></i>
    <span>${message}</span>
  `;

  toast.style.cssText = `
    position: fixed;
    bottom: 2rem;
    right: 2rem;
    background: ${
      type === "error" ? "#f44336" : type === "success" ? "#4caf50" : "#00e0ff"
    };
    color: #fff;
    padding: 1rem 1.5rem;
    border-radius: 8px;
    font-weight: 600;
    z-index: 10000;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    animation: slideInRight 0.3s ease;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    min-width: 260px;
  `;

  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = "slideOutRight 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ========================
// MODULE STATE
// ========================
let supabase = null;
let currentUserId = null; // auth.user.id
let currentUserCommunityId = null; // community.id

// ========================
// DIAGNOSTIC LOGGER
// ========================
// Structured logger that makes "disappearing record" issues obvious in the
// browser console. Each log includes a timestamp and a structured payload so
// you can grep the console for [OrgManager] to see the full operation trail.
function orgLog(level, event, payload = {}) {
  const ts = new Date().toISOString();
  const style =
    level === "error"
      ? "color:#f44336;font-weight:bold"
      : level === "warn"
      ? "color:#ff9800;font-weight:bold"
      : "color:#00e0ff";
  console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](
    `%c[OrgManager ${ts}] ${event}`,
    style,
    payload
  );
}

// ========================
// INIT / CURRENT USER
// ========================
export async function initOrganizationManager(supabaseClient) {
  supabase = supabaseClient;
  await refreshCurrentUser();

  orgLog("log", "initialized", { currentUserId, currentUserCommunityId });
  if (!currentUserCommunityId) {
    orgLog("warn", "no community profile found for authenticated user — org create/edit will be blocked", { currentUserId });
  }
  return { currentUserId, currentUserCommunityId };
}

export async function refreshCurrentUser() {
  try {
    if (!supabase?.auth?.getSession) return null;

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();
    if (sessionError || !session?.user) {
      orgLog("warn", "refreshCurrentUser: no active session", { sessionError });
      currentUserId = null;
      currentUserCommunityId = null;
      return null;
    }

    currentUserId = session.user.id;

    // Get community profile
    const { data: profile, error: profileError } = await supabase
      .from("community")
      .select("id")
      .eq("user_id", currentUserId)
      .single();

    if (profileError) {
      orgLog("error", "refreshCurrentUser: failed to fetch community profile", {
        userId: currentUserId,
        error: profileError,
      });
      currentUserCommunityId = null;
      return null;
    }

    if (!profile) {
      orgLog("warn", "refreshCurrentUser: authenticated user has no community profile — cannot create orgs", {
        userId: currentUserId,
      });
      currentUserCommunityId = null;
      return null;
    }

    currentUserCommunityId = profile.id;
    orgLog("log", "refreshCurrentUser: resolved", { currentUserId, currentUserCommunityId });
    return { currentUserId, currentUserCommunityId };
  } catch (error) {
    orgLog("error", "refreshCurrentUser: unexpected error", { error });
    return null;
  }
}

// ========================
// HELPER FUNCTIONS
// ========================

// Generate URL-friendly slug from organization name
function generateSlug(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove special characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Replace multiple hyphens with single hyphen
    .substring(0, 50); // Limit length
}

// Validate organization data
function validateOrganizationData(data) {
  const errors = [];

  if (!data.name || data.name.trim().length < 2) {
    errors.push("Organization name must be at least 2 characters");
  }

  if (data.size && !["startup", "small", "medium", "large", "enterprise"].includes(data.size)) {
    errors.push("Invalid organization size");
  }

  return errors;
}

// ========================
// ORGANIZATION CRUD
// ========================

/**
 * Create a new organization.
 *
 * Design notes:
 * - created_by is always set to currentUserCommunityId; never left null.
 * - The DB trigger fn_auto_create_org_owner() provides a server-side fallback
 *   that creates the owner member row atomically, so even if the JS addMember
 *   call below fails (e.g. network error), the row won't be orphaned.
 * - All errors are thrown so callers can surface them; toast is advisory only.
 *
 * @param {Object} organizationData - Organization details
 * @returns {Promise<Object>} Created organization
 */
export async function createOrganization(organizationData) {
  // Ensure session is current before doing anything
  if (!currentUserId || !currentUserCommunityId) {
    await refreshCurrentUser();
  }

  if (!currentUserId) {
    const err = new Error("User must be authenticated to create an organization");
    orgLog("error", "createOrganization: blocked — no authenticated user");
    showToast(err.message, "error");
    throw err;
  }

  if (!currentUserCommunityId) {
    const err = new Error(
      "Your profile is not fully set up yet. Please complete onboarding before creating an organization."
    );
    orgLog("error", "createOrganization: blocked — authenticated user has no community profile", {
      userId: currentUserId,
    });
    showToast(err.message, "error");
    throw err;
  }

  orgLog("log", "createOrganization: starting", { name: organizationData.name, createdBy: currentUserCommunityId });

  try {
    // Validate data
    const errors = validateOrganizationData(organizationData);
    if (errors.length > 0) {
      throw new Error(errors.join(", "));
    }

    // Generate a unique slug
    let slug = organizationData.slug || generateSlug(organizationData.name);

    // Check if slug already exists and append suffix if needed
    const { data: existingOrg } = await supabase
      .from("organizations")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (existingOrg) {
      let suffix = 2;
      let uniqueSlug = `${slug}-${suffix}`;
      while (true) {
        const { data: check } = await supabase
          .from("organizations")
          .select("id")
          .eq("slug", uniqueSlug)
          .maybeSingle();
        if (!check) break;
        suffix++;
        uniqueSlug = `${slug}-${suffix}`;
        if (suffix > 20) throw new Error("Could not generate a unique slug");
      }
      slug = uniqueSlug;
    }

    // Strip slug from input so it cannot be overridden with the unresolved value
    const { slug: _inputSlug, ...rest } = organizationData;

    // Insert with created_by explicitly set — never rely on DB default being null
    const { data: organization, error: insertError } = await supabase
      .from("organizations")
      .insert({
        ...rest,
        slug,
        created_by: currentUserCommunityId,
        status: "active",
      })
      .select()
      .single();

    if (insertError) {
      orgLog("error", "createOrganization: INSERT failed", { error: insertError });
      throw insertError;
    }

    orgLog("log", "createOrganization: org row created", {
      id: organization.id,
      slug: organization.slug,
      created_by: organization.created_by,
    });

    // Sanity-check: created_by should never be null at this point.
    // If it is, something is wrong with the session or trigger.
    if (!organization.created_by) {
      orgLog("warn", "createOrganization: org was saved but created_by is null — DB trigger may have failed", {
        orgId: organization.id,
        userId: currentUserId,
        communityId: currentUserCommunityId,
      });
    }

    // Add creator as owner in organization_members.
    // The DB trigger fn_auto_create_org_owner() does this too, so this call is
    // redundant on success — but the ON CONFLICT DO NOTHING on the trigger means
    // a double-insert is safe. We still call it here to get the member record
    // returned and to surface errors if the trigger somehow didn't fire.
    try {
      await addMember(organization.id, currentUserCommunityId, "owner", {
        can_post_opportunities: true,
        can_manage_members: true,
        can_edit_profile: true,
      });
      orgLog("log", "createOrganization: owner member row confirmed", { orgId: organization.id });
    } catch (memberError) {
      // The org row exists. The DB trigger should have created the member row.
      // Log loudly but do not fail the whole operation — the user's org was saved.
      orgLog("warn", "createOrganization: addMember call failed (DB trigger should have created member row)", {
        orgId: organization.id,
        communityId: currentUserCommunityId,
        error: memberError,
      });
    }

    showToast("Organization created successfully!", "success");
    return organization;
  } catch (error) {
    orgLog("error", "createOrganization: failed", { name: organizationData.name, error });
    showToast(error.message || "Failed to create organization", "error");
    throw error;
  }
}

/**
 * Update an existing organization
 * @param {String} id - Organization ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated organization
 */
export async function updateOrganization(id, updates) {
  try {
    if (!currentUserId || !currentUserCommunityId) {
      throw new Error("User must be authenticated");
    }

    // Check permissions
    const canEdit = await canUserEdit(id);
    if (!canEdit) {
      throw new Error("You don't have permission to edit this organization");
    }

    // Update slug if name changed
    if (updates.name && !updates.slug) {
      updates.slug = generateSlug(updates.name);
    }

    const { data: organization, error } = await supabase
      .from("organizations")
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    showToast("Organization updated successfully!", "success");
    return organization;
  } catch (error) {
    console.error("Error updating organization:", error);
    showToast(error.message || "Failed to update organization", "error");
    throw error;
  }
}

/**
 * Delete an organization
 * @param {String} id - Organization ID
 * @returns {Promise<Boolean>} Success status
 */
export async function deleteOrganization(id) {
  try {
    if (!currentUserId || !currentUserCommunityId) {
      throw new Error("User must be authenticated");
    }

    // Check if user is owner
    const { data: member } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", id)
      .eq("community_id", currentUserCommunityId)
      .single();

    if (!member || member.role !== "owner") {
      throw new Error("Only organization owners can delete organizations");
    }

    // Soft delete (set status to inactive)
    const { error } = await supabase
      .from("organizations")
      .update({ status: "inactive", updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) throw error;

    showToast("Organization deleted successfully!", "success");
    return true;
  } catch (error) {
    console.error("Error deleting organization:", error);
    showToast(error.message || "Failed to delete organization", "error");
    throw error;
  }
}

/**
 * Get a single organization by ID or slug
 * @param {String} idOrSlug - Organization ID or slug
 * @returns {Promise<Object>} Organization data
 */
export async function getOrganization(idOrSlug) {
  try {
    // Try to get by ID first
    let query = supabase
      .from("organizations")
      .select(`
        *,
        organization_members (
          id,
          community_id,
          role,
          title,
          bio,
          community (
            id,
            name,
            profile_pic
          )
        ),
        organization_followers (count)
      `)
      .eq("status", "active");

    // Check if idOrSlug looks like a UUID
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug)) {
      query = query.eq("id", idOrSlug);
    } else {
      query = query.eq("slug", idOrSlug);
    }

    const { data: organization, error } = await query.single();

    if (error) throw error;

    return organization;
  } catch (error) {
    console.error("Error fetching organization:", error);
    throw error;
  }
}

/**
 * Get multiple organizations with optional filtering
 * @param {Object} filters - Filter options
 * @returns {Promise<Array>} Array of organizations
 */
export async function getOrganizations(filters = {}) {
  try {
    let query = supabase
      .from("active_organizations_summary")
      .select("*");

    // Apply filters
    if (filters.industry) {
      query = query.contains("industry", [filters.industry]);
    }

    if (filters.size) {
      query = query.eq("size", filters.size);
    }

    if (filters.location) {
      query = query.ilike("location", `%${filters.location}%`);
    }

    if (filters.verified !== undefined) {
      query = query.eq("verified", filters.verified);
    }

    if (filters.search) {
      query = query.or(
        `name.ilike.%${filters.search}%,description.ilike.%${filters.search}%`
      );
    }

    // Sorting
    const sortBy = filters.sortBy || "follower_count";
    const sortOrder = filters.sortOrder || "desc";
    query = query.order(sortBy, { ascending: sortOrder === "asc" });

    // Pagination
    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    if (filters.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1);
    }

    const { data: organizations, error } = await query;

    if (error) throw error;

    return organizations || [];
  } catch (error) {
    console.error("Error fetching organizations:", error);
    return [];
  }
}

// ========================
// FOLLOWERS
// ========================

/**
 * Follow an organization
 * @param {String} organizationId - Organization ID
 * @returns {Promise<Boolean>} Success status
 */
export async function followOrganization(organizationId) {
  try {
    if (!currentUserId || !currentUserCommunityId) {
      throw new Error("User must be authenticated to follow organizations");
    }

    const { error } = await supabase
      .from("organization_followers")
      .insert({
        organization_id: organizationId,
        community_id: currentUserCommunityId,
      });

    if (error) {
      // Check if already following
      if (error.code === "23505") {
        showToast("You're already following this organization", "info");
        return true;
      }
      throw error;
    }

    showToast("Now following organization!", "success");
    return true;
  } catch (error) {
    console.error("Error following organization:", error);
    showToast(error.message || "Failed to follow organization", "error");
    throw error;
  }
}

/**
 * Unfollow an organization
 * @param {String} organizationId - Organization ID
 * @returns {Promise<Boolean>} Success status
 */
export async function unfollowOrganization(organizationId) {
  try {
    if (!currentUserId || !currentUserCommunityId) {
      throw new Error("User must be authenticated");
    }

    const { error } = await supabase
      .from("organization_followers")
      .delete()
      .eq("organization_id", organizationId)
      .eq("community_id", currentUserCommunityId);

    if (error) throw error;

    showToast("Unfollowed organization", "success");
    return true;
  } catch (error) {
    console.error("Error unfollowing organization:", error);
    showToast(error.message || "Failed to unfollow organization", "error");
    throw error;
  }
}

/**
 * Check if current user is following an organization
 * @param {String} organizationId - Organization ID
 * @returns {Promise<Boolean>} Following status
 */
export async function isFollowing(organizationId) {
  try {
    if (!currentUserCommunityId) return false;

    const { data, error } = await supabase
      .from("organization_followers")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("community_id", currentUserCommunityId)
      .single();

    if (error && error.code !== "PGRST116") throw error;

    return !!data;
  } catch (error) {
    console.error("Error checking following status:", error);
    return false;
  }
}

// ========================
// MEMBERS
// ========================

/**
 * Add a member to an organization
 * @param {String} organizationId - Organization ID
 * @param {String} communityId - Community member ID
 * @param {String} role - Member role (owner, admin, member, representative)
 * @param {Object} permissions - Permission flags
 * @returns {Promise<Object>} Created member record
 */
export async function addMember(organizationId, communityId, role = "member", permissions = {}) {
  try {
    const { data: member, error } = await supabase
      .from("organization_members")
      .insert({
        organization_id: organizationId,
        community_id: communityId,
        role,
        can_post_opportunities: permissions.can_post_opportunities || false,
        can_manage_members: permissions.can_manage_members || false,
        can_edit_profile: permissions.can_edit_profile || false,
        status: "active",
      })
      .select()
      .single();

    if (error) throw error;

    return member;
  } catch (error) {
    console.error("Error adding member:", error);
    throw error;
  }
}

/**
 * Remove a member from an organization
 * @param {String} organizationId - Organization ID
 * @param {String} communityId - Community member ID
 * @returns {Promise<Boolean>} Success status
 */
export async function removeMember(organizationId, communityId) {
  try {
    if (!currentUserId || !currentUserCommunityId) {
      throw new Error("User must be authenticated");
    }

    // Check permissions
    const canManage = await canUserManageMembers(organizationId);
    if (!canManage) {
      throw new Error("You don't have permission to manage members");
    }

    const { error } = await supabase
      .from("organization_members")
      .delete()
      .eq("organization_id", organizationId)
      .eq("community_id", communityId);

    if (error) throw error;

    showToast("Member removed successfully!", "success");
    return true;
  } catch (error) {
    console.error("Error removing member:", error);
    showToast(error.message || "Failed to remove member", "error");
    throw error;
  }
}

/**
 * Update a member's role and permissions
 * @param {String} organizationId - Organization ID
 * @param {String} communityId - Community member ID
 * @param {String} role - New role
 * @param {Object} permissions - New permissions
 * @returns {Promise<Object>} Updated member record
 */
export async function updateMemberRole(organizationId, communityId, role, permissions = {}) {
  try {
    if (!currentUserId || !currentUserCommunityId) {
      throw new Error("User must be authenticated");
    }

    // Check permissions
    const canManage = await canUserManageMembers(organizationId);
    if (!canManage) {
      throw new Error("You don't have permission to manage members");
    }

    const { data: member, error } = await supabase
      .from("organization_members")
      .update({
        role,
        can_post_opportunities: permissions.can_post_opportunities,
        can_manage_members: permissions.can_manage_members,
        can_edit_profile: permissions.can_edit_profile,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", organizationId)
      .eq("community_id", communityId)
      .select()
      .single();

    if (error) throw error;

    showToast("Member role updated successfully!", "success");
    return member;
  } catch (error) {
    console.error("Error updating member role:", error);
    showToast(error.message || "Failed to update member role", "error");
    throw error;
  }
}

/**
 * Get all members of an organization
 * @param {String} organizationId - Organization ID
 * @returns {Promise<Array>} Array of members
 */
export async function getOrganizationMembers(organizationId) {
  try {
    const { data: members, error } = await supabase
      .from("organization_members")
      .select(`
        *,
        community (
          id,
          name,
          profile_pic,
          title,
          skills
        )
      `)
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .order("joined_at", { ascending: false });

    if (error) throw error;

    return members || [];
  } catch (error) {
    console.error("Error fetching organization members:", error);
    return [];
  }
}

/**
 * Check if current user is a member of an organization
 * @param {String} organizationId - Organization ID
 * @returns {Promise<Object|null>} Member record or null
 */
export async function isUserMember(organizationId) {
  try {
    if (!currentUserCommunityId) return null;

    const { data: member, error } = await supabase
      .from("organization_members")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("community_id", currentUserCommunityId)
      .eq("status", "active")
      .single();

    if (error && error.code !== "PGRST116") throw error;

    return member;
  } catch (error) {
    console.error("Error checking member status:", error);
    return null;
  }
}

/**
 * Check if current user can edit an organization
 * @param {String} organizationId - Organization ID
 * @returns {Promise<Boolean>} Permission status
 */
export async function canUserEdit(organizationId) {
  try {
    const member = await isUserMember(organizationId);
    return member && (member.role === "owner" || member.role === "admin" || member.can_edit_profile);
  } catch (error) {
    console.error("Error checking edit permission:", error);
    return false;
  }
}

/**
 * Check if current user can manage members
 * @param {String} organizationId - Organization ID
 * @returns {Promise<Boolean>} Permission status
 */
export async function canUserManageMembers(organizationId) {
  try {
    const member = await isUserMember(organizationId);
    return member && (member.role === "owner" || member.role === "admin" || member.can_manage_members);
  } catch (error) {
    console.error("Error checking member management permission:", error);
    return false;
  }
}

/**
 * Check if current user can post opportunities
 * @param {String} organizationId - Organization ID
 * @returns {Promise<Boolean>} Permission status
 */
export async function canUserPostOpportunities(organizationId) {
  try {
    const member = await isUserMember(organizationId);
    return member && member.can_post_opportunities;
  } catch (error) {
    console.error("Error checking opportunity posting permission:", error);
    return false;
  }
}

// ========================
// ORGANIZATION VIEWS
// ========================

/**
 * All active organizations (public discovery feed).
 * Uses the active_organizations_summary view which already filters status = 'active'.
 *
 * @param {Object} filters - Same filters accepted by getOrganizations()
 * @returns {Promise<Array>}
 */
export async function getAllActiveOrganizations(filters = {}) {
  orgLog("log", "getAllActiveOrganizations: fetching", filters);
  return getOrganizations(filters);
}

/**
 * Organizations created by the current user (created_by = my community id).
 *
 * Note: older rows may have created_by = null even though the user created them.
 * For those, use getMyMemberOrganizations() which relies on organization_members.
 *
 * @returns {Promise<Array>}
 */
export async function getMyOrganizations() {
  try {
    if (!currentUserCommunityId) {
      orgLog("warn", "getMyOrganizations: no community profile — returning empty");
      return [];
    }

    const { data, error } = await supabase
      .from("organizations")
      .select("*")
      .eq("created_by", currentUserCommunityId)
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (error) {
      orgLog("error", "getMyOrganizations: query failed", { error });
      throw error;
    }

    orgLog("log", "getMyOrganizations: result", { count: data?.length ?? 0, communityId: currentUserCommunityId });

    if (!data || data.length === 0) {
      orgLog("warn", "getMyOrganizations: no results — if you recently created an org check that created_by was set", {
        communityId: currentUserCommunityId,
      });
    }

    return data || [];
  } catch (error) {
    orgLog("error", "getMyOrganizations: unexpected error", { error });
    return [];
  }
}

/**
 * Organizations the current user belongs to via organization_members.
 * This is the authoritative "my orgs" query — it works even when created_by is null.
 *
 * @param {Object} options
 * @param {String} [options.role] - Filter to a specific role ('owner', 'admin', 'member', …)
 * @returns {Promise<Array>}
 */
export async function getMyMemberOrganizations({ role } = {}) {
  try {
    if (!currentUserCommunityId) {
      orgLog("warn", "getMyMemberOrganizations: no community profile — returning empty");
      return [];
    }

    let membersQuery = supabase
      .from("organization_members")
      .select(`
        role,
        title,
        joined_at,
        organization:organizations (
          id,
          name,
          slug,
          description,
          logo_url,
          industry,
          size,
          location,
          verified,
          status,
          follower_count,
          opportunity_count,
          created_by,
          created_at
        )
      `)
      .eq("community_id", currentUserCommunityId)
      .eq("status", "active");

    if (role) {
      membersQuery = membersQuery.eq("role", role);
    }

    const { data, error } = await membersQuery.order("joined_at", { ascending: false });

    if (error) {
      orgLog("error", "getMyMemberOrganizations: query failed", { error });
      throw error;
    }

    // Filter out any joined orgs that are no longer active, and flatten
    const activeOrgs = (data || [])
      .filter((m) => m.organization && m.organization.status === "active")
      .map((m) => ({ ...m.organization, memberRole: m.role, memberTitle: m.title, joinedAt: m.joined_at }));

    orgLog("log", "getMyMemberOrganizations: result", {
      count: activeOrgs.length,
      communityId: currentUserCommunityId,
      roleFilter: role ?? "all",
    });

    if (activeOrgs.length === 0) {
      orgLog("warn", "getMyMemberOrganizations: no results — check organization_members rows for this community_id", {
        communityId: currentUserCommunityId,
      });
    }

    return activeOrgs;
  } catch (error) {
    orgLog("error", "getMyMemberOrganizations: unexpected error", { error });
    return [];
  }
}

/**
 * Diagnostic: check why a specific org might not appear in the UI.
 * Logs a full visibility report to the browser console.
 * Call this from DevTools: OrganizationManager.diagnoseVisibility('<org-id>')
 *
 * @param {String} orgId - Organization UUID
 */
export async function diagnoseOrgVisibility(orgId) {
  orgLog("log", "diagnoseOrgVisibility: starting", { orgId });

  // 1. Raw fetch (bypasses any app-layer filters)
  const { data: rawOrg, error: rawError } = await supabase
    .from("organizations")
    .select("id, name, status, created_by, created_at")
    .eq("id", orgId)
    .maybeSingle();

  if (rawError) {
    orgLog("error", "diagnoseOrgVisibility: could not fetch org row — RLS may be blocking SELECT", {
      orgId,
      error: rawError,
    });
    return;
  }

  if (!rawOrg) {
    orgLog("error", "diagnoseOrgVisibility: org row not found — either wrong ID or RLS SELECT policy blocked it", {
      orgId,
    });
    return;
  }

  orgLog("log", "diagnoseOrgVisibility: org row found", rawOrg);

  if (rawOrg.status !== "active") {
    orgLog("warn", "diagnoseOrgVisibility: org is NOT active — it will be hidden by the SELECT policy", {
      orgId,
      status: rawOrg.status,
    });
  }

  if (!rawOrg.created_by) {
    orgLog("warn", "diagnoseOrgVisibility: created_by is null — org will not appear in getMyOrganizations()", { orgId });
  } else if (rawOrg.created_by !== currentUserCommunityId) {
    orgLog("warn", "diagnoseOrgVisibility: created_by does not match current user's community profile", {
      orgId,
      orgCreatedBy: rawOrg.created_by,
      currentUserCommunityId,
    });
  }

  // 2. Check organization_members
  const { data: memberRow, error: memberError } = await supabase
    .from("organization_members")
    .select("id, role, status, community_id")
    .eq("organization_id", orgId)
    .eq("community_id", currentUserCommunityId)
    .maybeSingle();

  if (memberError) {
    orgLog("error", "diagnoseOrgVisibility: could not query organization_members", { orgId, error: memberError });
  } else if (!memberRow) {
    orgLog("warn", "diagnoseOrgVisibility: no organization_members row for current user — org will not appear in getMyMemberOrganizations()", {
      orgId,
      communityId: currentUserCommunityId,
    });
  } else {
    orgLog("log", "diagnoseOrgVisibility: organization_members row found", memberRow);
    if (memberRow.status !== "active") {
      orgLog("warn", "diagnoseOrgVisibility: member row status is not active", { status: memberRow.status });
    }
  }

  // 3. Check view
  const { data: viewRow, error: viewError } = await supabase
    .from("active_organizations_summary")
    .select("id, name")
    .eq("id", orgId)
    .maybeSingle();

  if (viewError || !viewRow) {
    orgLog("warn", "diagnoseOrgVisibility: org is NOT in active_organizations_summary view", {
      orgId,
      viewError,
    });
  } else {
    orgLog("log", "diagnoseOrgVisibility: org IS in active_organizations_summary view — it will appear in getAllActiveOrganizations()", viewRow);
  }

  orgLog("log", "diagnoseOrgVisibility: complete", {
    orgId,
    sessionUserId: currentUserId,
    communityId: currentUserCommunityId,
  });
}

// ========================
// EXPORTS
// ========================

// Make functions available globally for legacy compatibility
if (typeof window !== "undefined") {
  window.OrganizationManager = {
    init: initOrganizationManager,
    refreshCurrentUser,
    createOrganization,
    updateOrganization,
    deleteOrganization,
    getOrganization,
    getOrganizations,
    // Three explicit view queries — use these in the UI instead of raw getOrganizations()
    getAllActiveOrganizations,
    getMyOrganizations,
    getMyMemberOrganizations,
    // Diagnostics — call from DevTools: OrganizationManager.diagnoseVisibility('<id>')
    diagnoseOrgVisibility,
    followOrganization,
    unfollowOrganization,
    isFollowing,
    addMember,
    removeMember,
    updateMemberRole,
    getOrganizationMembers,
    isUserMember,
    canUserEdit,
    canUserManageMembers,
    canUserPostOpportunities,
  };
}
