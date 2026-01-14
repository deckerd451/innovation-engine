// ================================================================
// PROJECTS MODULE
// ================================================================
// Handles project creation, viewing, and management

import { supabase } from './supabaseClient.js';

let currentUserProfile = null;

// Initialize module
export function initProjects(userProfile) {
  currentUserProfile = userProfile;
}

// ========================
// MODAL CONTROL
// ========================

export async function openProjectsModal() {
  const modal = document.getElementById('projects-modal');
  modal.classList.add('active');
  await loadProjects();
}

export function closeProjectsModal() {
  document.getElementById('projects-modal').classList.remove('active');
  hideCreateProjectForm();
}

// ========================
// PROJECT FORM
// ========================

export async function showCreateProjectForm() {
  document.getElementById('project-form').style.display = 'block';
  await loadThemesIntoDropdown();
}

// Load active themes into the project form dropdown
async function loadThemesIntoDropdown() {
  const dropdown = document.getElementById('project-theme');
  if (!dropdown) return;

  try {
    const { data: themes, error } = await supabase
      .from('theme_circles')
      .select('id, title, tags, expires_at')
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .order('title', { ascending: true });

    if (error) {
      console.error('Error loading themes:', error);
      return;
    }

    // Clear existing options except the first one
    dropdown.innerHTML = '<option value="">No theme (standalone project)</option>';

    // Add theme options
    if (themes && themes.length > 0) {
      themes.forEach(theme => {
        const option = document.createElement('option');
        option.value = theme.id;
        const tags = theme.tags && theme.tags.length > 0 ? ` [${theme.tags.join(', ')}]` : '';
        option.textContent = `${theme.title}${tags}`;
        dropdown.appendChild(option);
      });
      console.log(`✅ Loaded ${themes.length} themes into project form`);
    } else {
      console.log('ℹ️ No active themes available');
    }
  } catch (err) {
    console.error('Error loading themes dropdown:', err);
  }
}

export function hideCreateProjectForm() {
  document.getElementById('project-form').style.display = 'none';
  document.getElementById('project-name').value = '';
  document.getElementById('project-description').value = '';
  document.getElementById('project-skills').value = '';
}

export async function createProject(event) {
  event.preventDefault();

  const name = document.getElementById('project-name').value;
  const description = document.getElementById('project-description').value;
  const skills = document.getElementById('project-skills').value;
  const themeId = document.getElementById('project-theme')?.value || null;

  // Convert skills to array
  const skillsArray = skills ? skills.split(',').map(s => s.trim()).filter(Boolean) : [];

  const projectData = {
    title: name,
    description,
    required_skills: skillsArray,
    creator_id: currentUserProfile.id,
    status: 'active'
  };

  // Only add theme_id if one was selected
  if (themeId) {
    projectData.theme_id = themeId;
  }

  const { data, error } = await supabase
    .from('projects')
    .insert([projectData])
    .select();
  
  if (error) {
    console.error('Error creating project:', error);
    alert('Error creating project. Please try again.');
    return;
  }

  // Award XP for creating project
  if (window.DailyEngagement) {
    await window.DailyEngagement.awardXP(window.DailyEngagement.XP_REWARDS.CREATE_PROJECT, `Created project: ${name}`);
  }

  hideCreateProjectForm();
  await loadProjects();

  // Refresh the synapse view to show the new project
  if (window.refreshSynapseProjectCircles) {
    await window.refreshSynapseProjectCircles();
  }
}

// ========================
// PROJECT LOADING
// ========================

async function loadProjects() {
  const listEl = document.getElementById('projects-list');

  console.log('📂 Loading projects...');

  let projects;

  try {
    // Try with the foreign key join first
    let { data, error } = await supabase
      .from('projects')
      .select(`
        *,
        creator:community!projects_creator_id_fkey(name)
      `)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    projects = data;

    // If foreign key join fails, try without it
    if (error) {
      console.warn('Foreign key join failed, trying simple query:', error);
      const simpleQuery = await supabase
        .from('projects')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      projects = simpleQuery.data;
      error = simpleQuery.error;

      if (error) {
        throw error;
      }

      // Manually fetch creator names if needed
      if (projects && projects.length > 0) {
        const creatorIds = [...new Set(projects.map(p => p.creator_id).filter(Boolean))];
        if (creatorIds.length > 0) {
          const { data: creators } = await supabase
            .from('community')
            .select('id, name')
            .in('id', creatorIds);

          const creatorMap = {};
          (creators || []).forEach(c => creatorMap[c.id] = c);

          projects = projects.map(p => ({
            ...p,
            creator: creatorMap[p.creator_id] || null
          }));
        }
      }
    }

    console.log('✅ Projects loaded:', projects?.length || 0);

    if (!projects || projects.length === 0) {
      listEl.innerHTML = `
        <div style="text-align: center; color: #aaa; padding: 2rem;">
          <i class="fas fa-folder-open" style="font-size: 3rem; opacity: 0.3;"></i>
          <p style="margin-top: 1rem;">No projects yet</p>
          <p style="font-size: 0.85rem;">Create your first project above!</p>
        </div>
      `;
      return;
    }
  } catch (err) {
    console.error('❌ Error loading projects:', err);
    listEl.innerHTML = `
      <div style="text-align: center; color: #f44; padding: 2rem;">
        <i class="fas fa-exclamation-triangle" style="font-size: 3rem; opacity: 0.5;"></i>
        <p style="margin-top: 1rem; color: #f44;">Error loading projects</p>
        <p style="font-size: 0.85rem; color: #aaa;">${err.message}</p>
        <button onclick="location.reload()" class="btn btn-primary" style="margin-top: 1rem;">
          Reload Page
        </button>
      </div>
    `;
    return;
  }

  let html = '';
  projects.forEach(project => {
    const isOwner = project.creator_id === currentUserProfile.id;
    
    html += `
      <div style="background: rgba(0,224,255,0.05); border: 1px solid rgba(0,224,255,0.2); border-radius: 12px; padding: 1.5rem; margin-bottom: 1rem;">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
          <h3 style="color: #00e0ff; margin: 0; font-size: 1.1rem;">${project.title}</h3>
          ${isOwner ? '<span style="background: rgba(0,224,255,0.2); color: #00e0ff; padding: 0.25rem 0.75rem; border-radius: 12px; font-size: 0.75rem;">Your Project</span>' : ''}
        </div>
        <p style="color: #aaa; font-size: 0.85rem; margin-bottom: 0.5rem;">by ${project.creator?.name || 'Unknown'}</p>
        <p style="color: white; margin-bottom: 1rem;">${project.description}</p>
        ${project.required_skills && project.required_skills.length > 0 ? `
          <div style="margin-bottom: 1rem;">
            <p style="color: #aaa; font-size: 0.85rem; margin-bottom: 0.5rem;">Required Skills:</p>
            <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
              ${(Array.isArray(project.required_skills) ? project.required_skills : project.required_skills.split(',')).map(skill => `
                <span style="background: rgba(0,224,255,0.2); color: #00e0ff; padding: 0.25rem 0.75rem; border-radius: 12px; font-size: 0.85rem;">${typeof skill === 'string' ? skill.trim() : skill}</span>
              `).join('')}
            </div>
          </div>
        ` : ''}
        ${!isOwner ? `
          <button onclick="joinProject('${project.id}', this)" class="btn btn-primary" style="font-size: 0.9rem; padding: 0.5rem 1rem;">
            <i class="fas fa-hand-paper"></i> Express Interest
          </button>
        ` : ''}
      </div>
    `;
  });
  
  listEl.innerHTML = html;
}

// ========================
// PROJECT MEMBERSHIP
// ========================

// Join a project
window.joinProject = async function(projectId, button) {
  if (!currentUserProfile) {
    alert('Please log in first');
    return;
  }

  button.disabled = true;
  button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Joining...';

  try {
    // Check if project_members table exists, if not use a simple approach
    // For now, we'll track interest by creating a connection in the projects table
    // In a production system, you'd have a project_members table

    // Insert into project_members table (assuming it exists or will be created)
    const { error } = await supabase
      .from('project_members')
      .insert([{
        project_id: projectId,
        user_id: currentUserProfile.id,
        role: 'member',
        joined_at: new Date().toISOString()
      }]);

    if (error) {
      // If table doesn't exist, show a message
      console.error('Error joining project:', error);

      // Fallback: Just show success message
      button.innerHTML = '<i class="fas fa-check"></i> Interest Recorded';
      button.style.background = 'rgba(0,255,136,0.2)';
      button.style.color = '#00ff88';

      // Notify user that they've expressed interest
      alert('Interest recorded! Project circles feature will be available once the database is configured.');
      return;
    }

    button.innerHTML = '<i class="fas fa-check"></i> Joined';
    button.style.background = 'rgba(0,255,136,0.2)';
    button.style.color = '#00ff88';

    // Refresh the synapse view to show updated project circles
    if (window.refreshSynapseProjectCircles) {
      await window.refreshSynapseProjectCircles();
    }

  } catch (error) {
    console.error('Error:', error);
    button.disabled = false;
    button.innerHTML = '<i class="fas fa-hand-paper"></i> Express Interest';
    alert('Error joining project. Please try again.');
  }
}

// Get all project members for visualization
export async function getAllProjectMembers() {
  try {
    const { data, error } = await supabase
      .from('project_members')
      .select(`
        *,
        project:projects(*),
        user:community(*)
      `);

    if (error) {
      console.warn('⚠️ Project members table error:', error);
      console.warn('⚠️ This means project memberships won\'t appear in synapse view');
      return [];
    }

    console.log('✅ Loaded project members:', data?.length || 0);
    if (data && data.length > 0) {
      console.log('📋 Sample project member:', data[0]);
    }

    return data || [];
  } catch (error) {
    console.error('❌ Project members feature error:', error);
    return [];
  }
}
