// ================================================================
// CharlestonHacks Innovation Engine — OPPORTUNITIES MANAGER
// File: /assets/js/organizations/opportunities.js
// ================================================================
// Manages job, internship, volunteer, and other opportunities
// posted by organizations
//
// Features:
// ✅ Create, update, delete opportunities
// ✅ Browse and filter opportunities
// ✅ Track views and applications
// ✅ Associate opportunities with themes/projects
// ✅ Skills-based matching
//
// Exports:
//  - initOpportunityManager(supabaseClient)
//  - createOpportunity(opportunityData)
//  - updateOpportunity(id, updates)
//  - deleteOpportunity(id)
//  - getOpportunity(id)
//  - getOpportunities(filters)
//  - getOpportunitiesByOrganization(organizationId)
//  - incrementViewCount(id)
//  - incrementApplicationCount(id)
// ================================================================

/* global console */

// ========================
// TOAST NOTIFICATION SYSTEM
// ========================
function showToast(message, type = "info") {
  if (typeof document === "undefined") return;

  const toast = document.createElement("div");
  toast.className = `opportunity-toast toast-${type}`;
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
// INIT / CURRENT USER
// ========================
export async function initOpportunityManager(supabaseClient) {
  supabase = supabaseClient;
  await refreshCurrentUser();

  console.log("%c✓ Opportunity Manager initialized", "color: #0f0");
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

    if (profileError || !profile) {
      currentUserCommunityId = null;
      return null;
    }

    currentUserCommunityId = profile.id;
    return { currentUserId, currentUserCommunityId };
  } catch (error) {
    console.error("Error refreshing current user:", error);
    return null;
  }
}

// ========================
// HELPER FUNCTIONS
// ========================

// Validate opportunity data
function validateOpportunityData(data) {
  const errors = [];

  if (!data.title || data.title.trim().length < 3) {
    errors.push("Title must be at least 3 characters");
  }

  if (!data.description || data.description.trim().length < 20) {
    errors.push("Description must be at least 20 characters");
  }

  if (!data.type || !["job", "internship", "volunteer", "contract", "mentorship"].includes(data.type)) {
    errors.push("Invalid opportunity type");
  }

  if (data.experience_level && !["entry", "mid", "senior", "any"].includes(data.experience_level)) {
    errors.push("Invalid experience level");
  }

  if (data.commitment && !["full-time", "part-time", "flexible", "one-time"].includes(data.commitment)) {
    errors.push("Invalid commitment type");
  }

  if (data.compensation_type && !["paid", "unpaid", "stipend", "equity"].includes(data.compensation_type)) {
    errors.push("Invalid compensation type");
  }

  return errors;
}

// ========================
// OPPORTUNITY CRUD
// ========================

/**
 * Create a new opportunity
 * @param {Object} opportunityData - Opportunity details
 * @returns {Promise<Object>} Created opportunity
 */
export async function createOpportunity(opportunityData) {
  try {
    if (!currentUserId || !currentUserCommunityId) {
      throw new Error("User must be authenticated to create opportunities");
    }

    // Validate data
    const errors = validateOpportunityData(opportunityData);
    if (errors.length > 0) {
      throw new Error(errors.join(", "));
    }

    // Check if user has permission to post opportunities for this organization
    const { data: member } = await supabase
      .from("organization_members")
      .select("can_post_opportunities")
      .eq("organization_id", opportunityData.organization_id)
      .eq("community_id", currentUserCommunityId)
      .single();

    if (!member || !member.can_post_opportunities) {
      throw new Error("You don't have permission to post opportunities for this organization");
    }

    // Create opportunity
    const { data: opportunity, error } = await supabase
      .from("opportunities")
      .insert({
        ...opportunityData,
        posted_by: currentUserCommunityId,
        status: opportunityData.status || "open",
        view_count: 0,
        application_count: 0,
      })
      .select()
      .single();

    if (error) throw error;

    showToast("Opportunity posted successfully!", "success");
    return opportunity;
  } catch (error) {
    console.error("Error creating opportunity:", error);
    showToast(error.message || "Failed to create opportunity", "error");
    throw error;
  }
}

/**
 * Update an existing opportunity
 * @param {String} id - Opportunity ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated opportunity
 */
export async function updateOpportunity(id, updates) {
  try {
    if (!currentUserId || !currentUserCommunityId) {
      throw new Error("User must be authenticated");
    }

    // Get the opportunity to check organization
    const { data: existingOpp } = await supabase
      .from("opportunities")
      .select("organization_id")
      .eq("id", id)
      .single();

    if (!existingOpp) {
      throw new Error("Opportunity not found");
    }

    // Check if user has permission
    const { data: member } = await supabase
      .from("organization_members")
      .select("can_post_opportunities")
      .eq("organization_id", existingOpp.organization_id)
      .eq("community_id", currentUserCommunityId)
      .single();

    if (!member || !member.can_post_opportunities) {
      throw new Error("You don't have permission to edit this opportunity");
    }

    const { data: opportunity, error } = await supabase
      .from("opportunities")
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    showToast("Opportunity updated successfully!", "success");
    return opportunity;
  } catch (error) {
    console.error("Error updating opportunity:", error);
    showToast(error.message || "Failed to update opportunity", "error");
    throw error;
  }
}

/**
 * Delete an opportunity
 * @param {String} id - Opportunity ID
 * @returns {Promise<Boolean>} Success status
 */
export async function deleteOpportunity(id) {
  try {
    if (!currentUserId || !currentUserCommunityId) {
      throw new Error("User must be authenticated");
    }

    // Get the opportunity to check organization
    const { data: existingOpp } = await supabase
      .from("opportunities")
      .select("organization_id")
      .eq("id", id)
      .single();

    if (!existingOpp) {
      throw new Error("Opportunity not found");
    }

    // Check if user has permission
    const { data: member } = await supabase
      .from("organization_members")
      .select("can_post_opportunities")
      .eq("organization_id", existingOpp.organization_id)
      .eq("community_id", currentUserCommunityId)
      .single();

    if (!member || !member.can_post_opportunities) {
      throw new Error("You don't have permission to delete this opportunity");
    }

    // Soft delete (set status to closed)
    const { error } = await supabase
      .from("opportunities")
      .update({
        status: "closed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) throw error;

    showToast("Opportunity deleted successfully!", "success");
    return true;
  } catch (error) {
    console.error("Error deleting opportunity:", error);
    showToast(error.message || "Failed to delete opportunity", "error");
    throw error;
  }
}

/**
 * Get a single opportunity by ID
 * @param {String} id - Opportunity ID
 * @returns {Promise<Object>} Opportunity data
 */
export async function getOpportunity(id) {
  try {
    const { data: opportunity, error } = await supabase
      .from("opportunities")
      .select(`
        *,
        organizations (
          id,
          name,
          slug,
          logo_url,
          verified
        ),
        theme_circles (
          id,
          title,
          description
        ),
        projects (
          id,
          title,
          description
        )
      `)
      .eq("id", id)
      .single();

    if (error) throw error;

    return opportunity;
  } catch (error) {
    console.error("Error fetching opportunity:", error);
    throw error;
  }
}

/**
 * Get multiple opportunities with optional filtering
 * @param {Object} filters - Filter options
 * @returns {Promise<Array>} Array of opportunities
 */
export async function getOpportunities(filters = {}) {
  try {
    let query = supabase
      .from("opportunities")
      .select(`
        *,
        organizations (
          id,
          name,
          slug,
          logo_url,
          verified
        )
      `)
      .eq("status", "open")
      .or("expires_at.is.null,expires_at.gt." + new Date().toISOString());

    // Apply filters
    if (filters.type) {
      query = query.eq("type", filters.type);
    }

    if (filters.experience_level) {
      query = query.eq("experience_level", filters.experience_level);
    }

    if (filters.commitment) {
      query = query.eq("commitment", filters.commitment);
    }

    if (filters.remote_ok !== undefined) {
      query = query.eq("remote_ok", filters.remote_ok);
    }

    if (filters.compensation_type) {
      query = query.eq("compensation_type", filters.compensation_type);
    }

    if (filters.location) {
      query = query.ilike("location", `%${filters.location}%`);
    }

    if (filters.required_skills && filters.required_skills.length > 0) {
      query = query.overlaps("required_skills", filters.required_skills);
    }

    if (filters.theme_id) {
      query = query.eq("theme_id", filters.theme_id);
    }

    if (filters.project_id) {
      query = query.eq("project_id", filters.project_id);
    }

    if (filters.search) {
      query = query.or(
        `title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`
      );
    }

    // Sorting
    const sortBy = filters.sortBy || "created_at";
    const sortOrder = filters.sortOrder || "desc";
    query = query.order(sortBy, { ascending: sortOrder === "asc" });

    // Pagination
    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    if (filters.offset) {
      query = query.range(
        filters.offset,
        filters.offset + (filters.limit || 10) - 1
      );
    }

    const { data: opportunities, error } = await query;

    if (error) throw error;

    return opportunities || [];
  } catch (error) {
    console.error("Error fetching opportunities:", error);
    return [];
  }
}

/**
 * Get all opportunities for a specific organization
 * @param {String} organizationId - Organization ID
 * @returns {Promise<Array>} Array of opportunities
 */
export async function getOpportunitiesByOrganization(organizationId) {
  try {
    const { data: opportunities, error } = await supabase
      .from("opportunities")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("status", "open")
      .or("expires_at.is.null,expires_at.gt." + new Date().toISOString())
      .order("created_at", { ascending: false });

    if (error) throw error;

    return opportunities || [];
  } catch (error) {
    console.error("Error fetching organization opportunities:", error);
    return [];
  }
}

/**
 * Increment view count for an opportunity
 * @param {String} id - Opportunity ID
 * @returns {Promise<Boolean>} Success status
 */
export async function incrementViewCount(id) {
  try {
    const { error } = await supabase.rpc("increment_opportunity_views", {
      opportunity_id: id,
    });

    // If RPC doesn't exist, use a regular update
    if (error && error.code === "42883") {
      const { error: updateError } = await supabase
        .from("opportunities")
        .update({ view_count: supabase.raw("view_count + 1") })
        .eq("id", id);

      if (updateError) throw updateError;
    } else if (error) {
      throw error;
    }

    return true;
  } catch (error) {
    console.error("Error incrementing view count:", error);
    return false;
  }
}

/**
 * Increment application count for an opportunity
 * @param {String} id - Opportunity ID
 * @returns {Promise<Boolean>} Success status
 */
export async function incrementApplicationCount(id) {
  try {
    const { error } = await supabase.rpc("increment_opportunity_applications", {
      opportunity_id: id,
    });

    // If RPC doesn't exist, use a regular update
    if (error && error.code === "42883") {
      const { error: updateError } = await supabase
        .from("opportunities")
        .update({ application_count: supabase.raw("application_count + 1") })
        .eq("id", id);

      if (updateError) throw updateError;
    } else if (error) {
      throw error;
    }

    return true;
  } catch (error) {
    console.error("Error incrementing application count:", error);
    return false;
  }
}

/**
 * Get recommended opportunities for current user based on skills
 * @returns {Promise<Array>} Array of recommended opportunities
 */
export async function getRecommendedOpportunities() {
  try {
    if (!currentUserCommunityId) {
      return await getOpportunities({ limit: 10 });
    }

    // Get user's skills
    const { data: profile } = await supabase
      .from("community")
      .select("skills")
      .eq("id", currentUserCommunityId)
      .single();

    if (!profile || !profile.skills || profile.skills.length === 0) {
      return await getOpportunities({ limit: 10 });
    }

    // Find opportunities that match user's skills
    const { data: opportunities, error } = await supabase
      .from("opportunities")
      .select(`
        *,
        organizations (
          id,
          name,
          slug,
          logo_url,
          verified
        )
      `)
      .eq("status", "open")
      .or("expires_at.is.null,expires_at.gt." + new Date().toISOString())
      .overlaps("required_skills", profile.skills)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) throw error;

    return opportunities || [];
  } catch (error) {
    console.error("Error fetching recommended opportunities:", error);
    return [];
  }
}

// ========================
// EXPORTS
// ========================

// Make functions available globally for legacy compatibility
if (typeof window !== "undefined") {
  window.OpportunityManager = {
    init: initOpportunityManager,
    refreshCurrentUser,
    createOpportunity,
    updateOpportunity,
    deleteOpportunity,
    getOpportunity,
    getOpportunities,
    getOpportunitiesByOrganization,
    incrementViewCount,
    incrementApplicationCount,
    getRecommendedOpportunities,
  };
}
