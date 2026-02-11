// ================================================================
// ADMIN PEOPLE MANAGEMENT SERVICE
// ================================================================
// Handles all data operations for people management in the admin panel
// Uses Supabase RLS - all operations are admin-gated at the database level

console.log('%c👥 Admin People Service Loading...', 'color:#00e0ff; font-weight: bold');

/**
 * List people with filtering, search, pagination, and sorting
 * @param {Object} options - Query options
 * @param {string} options.search - Search term for name/email
 * @param {string} options.role - Filter by user_role (Member, Admin, etc.)
 * @param {boolean} options.hidden - Filter by is_hidden
 * @param {boolean} options.disabled - Filter by is_disabled
 * @param {boolean} options.claimed - Filter by user_id (null = unclaimed)
 * @param {number} options.page - Page number (0-indexed)
 * @param {number} options.pageSize - Items per page
 * @param {string} options.sortKey - Column to sort by
 * @param {string} options.sortDir - Sort direction ('asc' or 'desc')
 * @returns {Promise<{data: Array, count: number, error: any}>}
 */
export async function listPeople({
  search = '',
  role = null,
  hidden = null,
  disabled = null,
  claimed = null,
  page = 0,
  pageSize = 50,
  sortKey = 'created_at',
  sortDir = 'desc'
} = {}) {
  try {
    const supabase = window.supabase;
    if (!supabase) throw new Error('Supabase not available');

    // Build query - fetch only list columns for performance
    let query = supabase
      .from('community')
      .select(`
        id,
        name,
        email,
        user_role,
        is_hidden,
        is_disabled,
        user_id,
        created_at,
        last_login,
        image_url,
        image_path,
        avatar_storage_path
      `, { count: 'exact' });

    // Apply filters
    if (search && search.trim()) {
      const searchTerm = search.trim();
      query = query.or(`name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`);
    }

    if (role) {
      query = query.eq('user_role', role);
    }

    if (hidden !== null) {
      query = query.eq('is_hidden', hidden);
    }

    if (disabled !== null) {
      query = query.eq('is_disabled', disabled);
    }

    if (claimed !== null) {
      if (claimed) {
        query = query.not('user_id', 'is', null);
      } else {
        query = query.is('user_id', null);
      }
    }

    // Apply sorting
    query = query.order(sortKey, { ascending: sortDir === 'asc' });

    // Apply pagination
    const from = page * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data, count, error } = await query;

    if (error) throw error;

    return { data: data || [], count: count || 0, error: null };

  } catch (error) {
    console.error('❌ Error listing people:', error);
    return { data: [], count: 0, error };
  }
}

/**
 * Get full person details by ID
 * @param {string} id - Person ID
 * @returns {Promise<{data: Object|null, error: any}>}
 */
export async function getPerson(id) {
  try {
    const supabase = window.supabase;
    if (!supabase) throw new Error('Supabase not available');

    const { data, error } = await supabase
      .from('community')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    return { data, error: null };

  } catch (error) {
    console.error('❌ Error getting person:', error);
    return { data: null, error };
  }
}

/**
 * Update person profile
 * @param {string} id - Person ID
 * @param {Object} patch - Fields to update
 * @returns {Promise<{data: Object|null, error: any}>}
 */
export async function updatePerson(id, patch) {
  try {
    const supabase = window.supabase;
    if (!supabase) throw new Error('Supabase not available');

    // Clean up the patch data
    const updateData = { ...patch };
    
    // Handle array fields - convert to proper arrays
    const arrayFields = ['skills', 'interests'];
    arrayFields.forEach(field => {
      if (field in updateData) {
        const value = updateData[field];
        if (value === '' || value === null) {
          updateData[field] = null;
        } else if (Array.isArray(value)) {
          // Already an array, keep it
          updateData[field] = value;
        } else if (typeof value === 'string') {
          // Convert comma-separated string to array
          updateData[field] = value.split(',').map(s => s.trim()).filter(s => s);
        }
      }
    });
    
    // Handle empty strings for text fields - convert to null
    const textFields = ['bio', 'availability', 'image_url', 'image_path', 'avatar_storage_path'];
    textFields.forEach(field => {
      if (field in updateData && updateData[field] === '') {
        updateData[field] = null;
      }
    });

    // Add updated_at timestamp
    updateData.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('community')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return { data, error: null };

  } catch (error) {
    console.error('❌ Error updating person:', error);
    return { data: null, error };
  }
}

/**
 * Set person role with guardrails
 * @param {string} id - Person ID
 * @param {string} user_role - New role (Member, Admin, etc.)
 * @returns {Promise<{data: Object|null, error: any}>}
 */
export async function setRole(id, user_role) {
  try {
    const supabase = window.supabase;
    if (!supabase) throw new Error('Supabase not available');

    // Check if this is a demotion from Admin
    const { data: currentPerson } = await supabase
      .from('community')
      .select('user_role, name, email')
      .eq('id', id)
      .single();

    if (currentPerson?.user_role === 'Admin' && user_role !== 'Admin') {
      // Check if this is the last admin
      const { count: adminCount } = await supabase
        .from('community')
        .select('*', { count: 'exact', head: true })
        .eq('user_role', 'Admin')
        .eq('is_disabled', false);

      if (adminCount <= 1) {
        throw new Error('Cannot demote the last remaining Admin');
      }
    }

    return await updatePerson(id, { user_role });

  } catch (error) {
    console.error('❌ Error setting role:', error);
    return { data: null, error };
  }
}

/**
 * Set person hidden status
 * @param {string} id - Person ID
 * @param {boolean} is_hidden - Hidden status
 * @returns {Promise<{data: Object|null, error: any}>}
 */
export async function setHidden(id, is_hidden) {
  return await updatePerson(id, { is_hidden });
}

/**
 * Set person disabled status
 * @param {string} id - Person ID
 * @param {boolean} is_disabled - Disabled status
 * @returns {Promise<{data: Object|null, error: any}>}
 */
export async function setDisabled(id, is_disabled) {
  return await updatePerson(id, { is_disabled });
}

/**
 * Bulk update multiple people
 * @param {Array<string>} ids - Array of person IDs
 * @param {Object} patch - Fields to update
 * @returns {Promise<{success: number, failed: number, errors: Array}>}
 */
export async function bulkUpdate(ids, patch) {
  const results = {
    success: 0,
    failed: 0,
    errors: []
  };

  for (const id of ids) {
    const { error } = await updatePerson(id, patch);
    if (error) {
      results.failed++;
      results.errors.push({ id, error: error.message });
    } else {
      results.success++;
    }
  }

  return results;
}

/**
 * Delete person (optional - use with caution)
 * @param {string} id - Person ID
 * @returns {Promise<{success: boolean, error: any}>}
 */
export async function deletePerson(id) {
  try {
    const supabase = window.supabase;
    if (!supabase) throw new Error('Supabase not available');

    // Check if this is an admin
    const { data: person } = await supabase
      .from('community')
      .select('user_role')
      .eq('id', id)
      .single();

    if (person?.user_role === 'Admin') {
      // Check if this is the last admin
      const { count: adminCount } = await supabase
        .from('community')
        .select('*', { count: 'exact', head: true })
        .eq('user_role', 'Admin')
        .eq('is_disabled', false);

      if (adminCount <= 1) {
        throw new Error('Cannot delete the last remaining Admin');
      }
    }

    const { error } = await supabase
      .from('community')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return { success: true, error: null };

  } catch (error) {
    console.error('❌ Error deleting person:', error);
    return { success: false, error };
  }
}

/**
 * Create new person (invite)
 * @param {Object} data - Person data
 * @param {string} data.email - Email (required)
 * @param {string} data.name - Name (optional)
 * @returns {Promise<{data: Object|null, error: any}>}
 */
export async function createPerson({ email, name = null }) {
  try {
    const supabase = window.supabase;
    if (!supabase) throw new Error('Supabase not available');

    // Check if email already exists
    const { data: existing } = await supabase
      .from('community')
      .select('id, name, email')
      .eq('email', email)
      .maybeSingle();

    if (existing) {
      throw new Error(`User already exists: ${existing.name || email}`);
    }

    // Create new community profile
    const { data, error } = await supabase
      .from('community')
      .insert({
        email,
        name: name || email.split('@')[0],
        user_role: 'Member',
        profile_completed: false,
        is_hidden: false,
        is_disabled: false
      })
      .select()
      .single();

    if (error) throw error;

    return { data, error: null };

  } catch (error) {
    console.error('❌ Error creating person:', error);
    return { data: null, error };
  }
}

console.log('✅ Admin People Service Loaded');
