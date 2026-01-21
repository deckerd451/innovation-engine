// ================================================================
// ENHANCED TEAM BUILDER SYSTEM
// ================================================================
// Advanced team formation, collaboration tools, and team management

console.log("%c🤝 Enhanced Team Builder Loading...", "color:#0ff; font-weight: bold; font-size: 16px");

let supabase = null;
let currentUserProfile = null;

// Team formation algorithms
const TEAM_ALGORITHMS = {
  SKILL_COVERAGE: { weight: 0.4, name: 'Skill Coverage' },
  COLLABORATION_FIT: { weight: 0.25, name: 'Collaboration Compatibility' },
  EXPERIENCE_BALANCE: { weight: 0.2, name: 'Experience Balance' },
  AVAILABILITY_MATCH: { weight: 0.1, name: 'Availability Alignment' },
  NETWORK_STRENGTH: { weight: 0.05, name: 'Network Connections' }
};

// Team roles and their characteristics
const TEAM_ROLES = {
  LEADER: {
    id: 'leader',
    name: 'Team Leader',
    icon: 'fas fa-crown',
    description: 'Guides project direction and coordinates team efforts',
    skills: ['Leadership', 'Project Management', 'Communication'],
    maxCount: 1
  },
  TECHNICAL_LEAD: {
    id: 'tech_lead',
    name: 'Technical Lead',
    icon: 'fas fa-code',
    description: 'Oversees technical architecture and development',
    skills: ['Architecture', 'Senior Development', 'Code Review'],
    maxCount: 1
  },
  DEVELOPER: {
    id: 'developer',
    name: 'Developer',
    icon: 'fas fa-laptop-code',
    description: 'Implements features and builds core functionality',
    skills: ['Programming', 'Development', 'Implementation'],
    maxCount: -1 // unlimited
  },
  DESIGNER: {
    id: 'designer',
    name: 'Designer',
    icon: 'fas fa-palette',
    description: 'Creates user experience and visual design',
    skills: ['UI/UX Design', 'Visual Design', 'Prototyping'],
    maxCount: 2
  },
  PRODUCT_MANAGER: {
    id: 'product_manager',
    name: 'Product Manager',
    icon: 'fas fa-chart-line',
    description: 'Defines requirements and manages product strategy',
    skills: ['Product Management', 'Strategy', 'Requirements'],
    maxCount: 1
  },
  RESEARCHER: {
    id: 'researcher',
    name: 'Researcher',
    icon: 'fas fa-search',
    description: 'Conducts research and validates assumptions',
    skills: ['Research', 'Analysis', 'User Research'],
    maxCount: 2
  }
};

// Initialize enhanced team builder
export function initEnhancedTeamBuilder() {
  supabase = window.supabase;
  
  // Listen for profile loaded
  window.addEventListener('profile-loaded', (e) => {
    currentUserProfile = e.detail.profile;
  });

  // Expose functions globally
  window.openTeamBuilder = openTeamBuilder;
  window.closeTeamBuilder = closeTeamBuilder;
  window.buildOptimalTeam = buildOptimalTeam;
  window.inviteTeamMembers = inviteTeamMembers;
  window.createTeamFromSuggestions = createTeamFromSuggestions;
  window.analyzeTeamCompatibility = analyzeTeamCompatibility;
  window.createProjectInTheme = createProjectInTheme;

  console.log('✅ Enhanced team builder initialized');
}

// Create project in specific theme (integration with theme system)
window.createProjectInTheme = async function(themeId, themeName) {
  console.log('🎯 Creating project in theme via team builder:', { themeId, themeName });
  
  // Pre-fill team builder with theme information
  const prefilledData = {
    themeId: themeId,
    themeName: themeName,
    projectName: `New ${themeName} Project`
  };
  
  await openTeamBuilder(null, prefilledData);
};

// Open team builder modal
export async function openTeamBuilder(projectId = null, prefilledData = null) {
  console.log('🤝 Opening enhanced team builder...');

  // Remove existing modal if present
  const existing = document.getElementById('team-builder-modal');
  if (existing) existing.remove();

  // Create modal
  const modal = document.createElement('div');
  modal.id = 'team-builder-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    padding: 1rem;
  `;

  modal.innerHTML = `
    <div class="team-builder-container" style="
      background: linear-gradient(135deg, rgba(10, 14, 39, 0.98), rgba(26, 26, 46, 0.98));
      border: 2px solid rgba(0, 224, 255, 0.5);
      border-radius: 16px;
      backdrop-filter: blur(10px);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.7);
      max-width: 1200px;
      width: 100%;
      max-height: 90vh;
      overflow: hidden;
      position: relative;
      display: flex;
      flex-direction: column;
    ">
      <!-- Header -->
      <div class="team-builder-header" style="
        padding: 2rem 2rem 1rem;
        border-bottom: 1px solid rgba(0, 224, 255, 0.2);
        flex-shrink: 0;
      ">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <h2 style="color: #00e0ff; margin: 0 0 0.5rem 0; font-size: 1.75rem;">
              <i class="fas fa-users-cog"></i> Team Builder
            </h2>
            <p style="color: rgba(255, 255, 255, 0.7); margin: 0; font-size: 1rem;">
              Build optimal teams using AI-powered matching and collaboration analysis
            </p>
          </div>
          <button onclick="closeTeamBuilder()" style="
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            color: white;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 1.2rem;
            transition: all 0.2s;
          ">
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>

      <!-- Team Builder Steps -->
      <div class="team-builder-content" style="
        flex: 1;
        overflow-y: auto;
        padding: 2rem;
      ">
        <!-- Step 1: Project Requirements -->
        <div id="step-requirements" class="team-step active">
          <h3 style="color: #00e0ff; margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.5rem;">
            <span class="step-number">1</span>
            <i class="fas fa-clipboard-list"></i>
            Define Project Requirements
          </h3>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 2rem;">
            <!-- Project Info -->
            <div>
              <label style="display: block; color: rgba(255, 255, 255, 0.8); margin-bottom: 0.5rem; font-weight: 600;">
                Project Name
              </label>
              <input type="text" id="team-project-name" placeholder="Enter project name" style="
                width: 100%;
                padding: 0.875rem;
                background: rgba(0, 224, 255, 0.05);
                border: 2px solid rgba(0, 224, 255, 0.3);
                border-radius: 8px;
                color: white;
                font-size: 1rem;
              ">
            </div>

            <div>
              <label style="display: block; color: rgba(255, 255, 255, 0.8); margin-bottom: 0.5rem; font-weight: 600;">
                Team Size
              </label>
              <select id="team-size-select" style="
                width: 100%;
                padding: 0.875rem;
                background: rgba(0, 224, 255, 0.05);
                border: 2px solid rgba(0, 224, 255, 0.3);
                border-radius: 8px;
                color: white;
                font-size: 1rem;
              ">
                <option value="2">2 people (Pair)</option>
                <option value="3">3 people (Small team)</option>
                <option value="4" selected>4 people (Optimal)</option>
                <option value="5">5 people (Medium team)</option>
                <option value="6">6 people (Large team)</option>
                <option value="8">8 people (Full team)</option>
              </select>
            </div>
          </div>

          <!-- Theme Selection -->
          <div style="margin-bottom: 2rem;">
            <label style="display: block; color: rgba(255, 255, 255, 0.8); margin-bottom: 0.5rem; font-weight: 600;">
              Theme (Optional)
            </label>
            <select id="team-theme-select" style="
              width: 100%;
              padding: 0.875rem;
              background: rgba(0, 224, 255, 0.05);
              border: 2px solid rgba(0, 224, 255, 0.3);
              border-radius: 8px;
              color: white;
              font-size: 1rem;
            ">
              <option value="">No theme (standalone project)</option>
            </select>
          </div>

          <!-- Required Skills -->
          <div style="margin-bottom: 2rem;">
            <label style="display: block; color: rgba(255, 255, 255, 0.8); margin-bottom: 0.5rem; font-weight: 600;">
              Required Skills
            </label>
            <div id="required-skills-container" style="
              min-height: 60px;
              background: rgba(0, 224, 255, 0.05);
              border: 2px solid rgba(0, 224, 255, 0.3);
              border-radius: 8px;
              padding: 0.75rem;
              margin-bottom: 0.75rem;
              display: flex;
              flex-wrap: wrap;
              gap: 0.5rem;
              align-items: center;
            ">
              <span id="skills-placeholder" style="color: rgba(255, 255, 255, 0.5); font-style: italic;">
                Add skills needed for this project
              </span>
            </div>
            <div style="display: flex; gap: 0.5rem; margin-bottom: 0.75rem;">
              <input type="text" id="skill-input" placeholder="Type a skill and press Enter" style="
                flex: 1;
                padding: 0.75rem;
                background: rgba(0, 224, 255, 0.05);
                border: 1px solid rgba(0, 224, 255, 0.3);
                border-radius: 6px;
                color: white;
                font-size: 0.9rem;
              ">
              <button type="button" onclick="addRequiredSkill()" style="
                padding: 0.75rem 1rem;
                background: rgba(0, 224, 255, 0.2);
                border: 1px solid rgba(0, 224, 255, 0.4);
                border-radius: 6px;
                color: #00e0ff;
                cursor: pointer;
                font-weight: 600;
              ">
                <i class="fas fa-plus"></i> Add
              </button>
            </div>
          </div>

          <!-- Team Roles -->
          <div style="margin-bottom: 2rem;">
            <label style="display: block; color: rgba(255, 255, 255, 0.8); margin-bottom: 1rem; font-weight: 600;">
              Desired Team Roles
            </label>
            <div id="team-roles-grid" style="
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
              gap: 1rem;
            ">
              ${Object.values(TEAM_ROLES).map(role => `
                <div class="role-card" data-role-id="${role.id}" style="
                  background: rgba(0, 224, 255, 0.05);
                  border: 2px solid rgba(0, 224, 255, 0.2);
                  border-radius: 8px;
                  padding: 1rem;
                  cursor: pointer;
                  transition: all 0.2s;
                ">
                  <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
                    <i class="${role.icon}" style="color: #00e0ff; font-size: 1.2rem;"></i>
                    <h4 style="color: #00e0ff; margin: 0; font-size: 1rem;">${role.name}</h4>
                  </div>
                  <p style="color: rgba(255, 255, 255, 0.7); margin: 0 0 0.5rem 0; font-size: 0.85rem; line-height: 1.4;">
                    ${role.description}
                  </p>
                  <div style="font-size: 0.75rem; color: rgba(255, 255, 255, 0.5);">
                    Skills: ${role.skills.join(', ')}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <div style="text-align: right;">
            <button onclick="proceedToTeamGeneration()" style="
              padding: 0.875rem 2rem;
              background: linear-gradient(135deg, rgba(0, 224, 255, 0.3), rgba(0, 224, 255, 0.2));
              border: 2px solid rgba(0, 224, 255, 0.5);
              border-radius: 8px;
              color: #00e0ff;
              cursor: pointer;
              font-weight: 700;
              font-size: 1rem;
            ">
              <i class="fas fa-arrow-right"></i> Generate Team Suggestions
            </button>
          </div>
        </div>

        <!-- Step 2: Team Suggestions -->
        <div id="step-suggestions" class="team-step" style="display: none;">
          <h3 style="color: #00e0ff; margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.5rem;">
            <span class="step-number">2</span>
            <i class="fas fa-users"></i>
            Team Suggestions
          </h3>

          <div id="team-suggestions-content">
            <!-- Team suggestions will be populated here -->
          </div>

          <div style="display: flex; gap: 1rem; justify-content: space-between; margin-top: 2rem;">
            <button onclick="goBackToRequirements()" style="
              padding: 0.875rem 1.5rem;
              background: rgba(255, 255, 255, 0.1);
              border: 1px solid rgba(255, 255, 255, 0.2);
              border-radius: 8px;
              color: white;
              cursor: pointer;
              font-weight: 600;
            ">
              <i class="fas fa-arrow-left"></i> Back
            </button>
            <button onclick="proceedToTeamReview()" style="
              padding: 0.875rem 2rem;
              background: linear-gradient(135deg, rgba(0, 224, 255, 0.3), rgba(0, 224, 255, 0.2));
              border: 2px solid rgba(0, 224, 255, 0.5);
              border-radius: 8px;
              color: #00e0ff;
              cursor: pointer;
              font-weight: 700;
              font-size: 1rem;
            ">
              <i class="fas fa-arrow-right"></i> Review Selected Team
            </button>
          </div>
        </div>

        <!-- Step 3: Team Review -->
        <div id="step-review" class="team-step" style="display: none;">
          <h3 style="color: #00e0ff; margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.5rem;">
            <span class="step-number">3</span>
            <i class="fas fa-check-circle"></i>
            Review & Invite Team
          </h3>

          <div id="team-review-content">
            <!-- Team review will be populated here -->
          </div>

          <div style="display: flex; gap: 1rem; justify-content: space-between; margin-top: 2rem;">
            <button onclick="goBackToSuggestions()" style="
              padding: 0.875rem 1.5rem;
              background: rgba(255, 255, 255, 0.1);
              border: 1px solid rgba(255, 255, 255, 0.2);
              border-radius: 8px;
              color: white;
              cursor: pointer;
              font-weight: 600;
            ">
              <i class="fas fa-arrow-left"></i> Back
            </button>
            <button onclick="createTeamAndInvite()" style="
              padding: 0.875rem 2rem;
              background: linear-gradient(135deg, rgba(0, 255, 136, 0.3), rgba(0, 255, 136, 0.2));
              border: 2px solid rgba(0, 255, 136, 0.5);
              border-radius: 8px;
              color: #00ff88;
              cursor: pointer;
              font-weight: 700;
              font-size: 1rem;
            ">
              <i class="fas fa-paper-plane"></i> Send Invitations
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Add styles
  const style = document.createElement('style');
  style.textContent = `
    .role-card.selected {
      border-color: rgba(0, 224, 255, 0.6) !important;
      background: rgba(0, 224, 255, 0.1) !important;
      box-shadow: 0 0 15px rgba(0, 224, 255, 0.2);
    }

    .role-card:hover {
      border-color: rgba(0, 224, 255, 0.4) !important;
      background: rgba(0, 224, 255, 0.08) !important;
    }

    .step-number {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      background: rgba(0, 224, 255, 0.2);
      border: 1px solid rgba(0, 224, 255, 0.4);
      border-radius: 50%;
      font-size: 1rem;
      font-weight: bold;
      margin-right: 0.75rem;
    }

    .skill-tag {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: rgba(0, 224, 255, 0.2);
      border: 1px solid rgba(0, 224, 255, 0.4);
      color: #00e0ff;
      padding: 0.5rem 0.75rem;
      border-radius: 20px;
      font-size: 0.85rem;
      font-weight: 600;
    }

    .team-suggestion-card {
      background: rgba(0, 224, 255, 0.05);
      border: 2px solid rgba(0, 224, 255, 0.2);
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 1rem;
      transition: all 0.3s;
      cursor: pointer;
    }

    .team-suggestion-card:hover {
      border-color: rgba(0, 224, 255, 0.4);
      background: rgba(0, 224, 255, 0.08);
    }

    .team-suggestion-card.selected {
      border-color: rgba(0, 224, 255, 0.6);
      background: rgba(0, 224, 255, 0.1);
      box-shadow: 0 0 20px rgba(0, 224, 255, 0.2);
    }

    .team-member-card {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      padding: 1rem;
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .member-avatar {
      width: 50px;
      height: 50px;
      border-radius: 50%;
      background: linear-gradient(135deg, #00e0ff, #0080ff);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      color: white;
      font-size: 1.2rem;
    }

    .compatibility-score {
      background: linear-gradient(135deg, rgba(0, 255, 136, 0.2), rgba(0, 255, 136, 0.1));
      border: 1px solid rgba(0, 255, 136, 0.4);
      color: #00ff88;
      padding: 0.25rem 0.75rem;
      border-radius: 12px;
      font-size: 0.8rem;
      font-weight: 600;
    }
  `;
  document.head.appendChild(style);

  document.body.appendChild(modal);

  // Setup event listeners
  setupTeamBuilderEventListeners();

  // Load themes into dropdown
  await loadThemesIntoTeamBuilder();

  // Pre-fill data if provided
  if (prefilledData) {
    populateTeamBuilderData(prefilledData);
  }

  console.log('✅ Enhanced team builder modal opened');
}

// Load themes into team builder dropdown
async function loadThemesIntoTeamBuilder() {
  const dropdown = document.getElementById('team-theme-select');
  if (!dropdown || !supabase) return;

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
      console.log(`✅ Loaded ${themes.length} themes into team builder`);
    }
  } catch (err) {
    console.error('Error loading themes for team builder:', err);
  }
}

// Populate team builder with pre-filled data
function populateTeamBuilderData(data) {
  if (!data) return;
  
  console.log('📝 Pre-filling team builder with data:', data);
  
  // Set project name
  if (data.projectName) {
    const nameInput = document.getElementById('team-project-name');
    if (nameInput) nameInput.value = data.projectName;
  }
  
  // Set theme selection
  if (data.themeId) {
    const themeSelect = document.getElementById('team-theme-select');
    if (themeSelect) {
      // Wait a bit for themes to load, then select
      setTimeout(() => {
        themeSelect.value = data.themeId;
      }, 500);
    }
  }
  
  // Set team size if provided
  if (data.teamSize) {
    const sizeSelect = document.getElementById('team-size-select');
    if (sizeSelect) sizeSelect.value = data.teamSize;
  }
  
  // Add pre-filled skills
  if (data.skills && Array.isArray(data.skills)) {
    data.skills.forEach(skill => {
      // Simulate adding each skill
      const skillInput = document.getElementById('skill-input');
      if (skillInput) {
        skillInput.value = skill;
        addRequiredSkill();
      }
    });
  }
}

// Setup team builder event listeners
function setupTeamBuilderEventListeners() {
  // Skill input
  const skillInput = document.getElementById('skill-input');
  if (skillInput) {
    skillInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addRequiredSkill();
      }
    });
  }

  // Role selection
  document.querySelectorAll('.role-card').forEach(card => {
    card.addEventListener('click', () => {
      card.classList.toggle('selected');
    });
  });

  // Close modal on backdrop click
  const modal = document.getElementById('team-builder-modal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeTeamBuilder();
      }
    });
  }
}

// Add required skill
window.addRequiredSkill = function() {
  const input = document.getElementById('skill-input');
  const container = document.getElementById('required-skills-container');
  const placeholder = document.getElementById('skills-placeholder');
  
  if (!input || !container) return;

  const skill = input.value.trim();
  if (!skill) return;

  // Check if skill already exists
  const existingSkills = Array.from(container.querySelectorAll('.skill-tag')).map(tag => 
    tag.textContent.replace('×', '').trim()
  );
  
  if (existingSkills.includes(skill)) {
    input.value = '';
    return;
  }

  // Hide placeholder
  if (placeholder) {
    placeholder.style.display = 'none';
  }

  // Create skill tag
  const skillTag = document.createElement('span');
  skillTag.className = 'skill-tag';
  skillTag.innerHTML = `
    ${skill}
    <button type="button" onclick="removeRequiredSkill('${skill}')" style="
      background: none;
      border: none;
      color: inherit;
      cursor: pointer;
      padding: 0;
      margin-left: 0.25rem;
      opacity: 0.7;
    ">
      <i class="fas fa-times"></i>
    </button>
  `;

  container.appendChild(skillTag);
  input.value = '';
};

// Remove required skill
window.removeRequiredSkill = function(skill) {
  const container = document.getElementById('required-skills-container');
  const placeholder = document.getElementById('skills-placeholder');
  
  if (!container) return;

  const skillTags = container.querySelectorAll('.skill-tag');
  skillTags.forEach(tag => {
    if (tag.textContent.trim().startsWith(skill)) {
      tag.remove();
    }
  });

  // Show placeholder if no skills
  const remainingSkills = container.querySelectorAll('.skill-tag');
  if (remainingSkills.length === 0 && placeholder) {
    placeholder.style.display = 'block';
  }
};

// Get selected skills
function getSelectedSkills() {
  const container = document.getElementById('required-skills-container');
  if (!container) return [];

  const skillTags = container.querySelectorAll('.skill-tag');
  return Array.from(skillTags).map(tag => {
    const text = tag.textContent.trim();
    return text.substring(0, text.length - 1).trim(); // Remove the 'x' button text
  });
}

// Get selected roles
function getSelectedRoles() {
  const selectedCards = document.querySelectorAll('.role-card.selected');
  return Array.from(selectedCards).map(card => card.dataset.roleId);
}

// Navigation functions
window.proceedToTeamGeneration = async function() {
  const projectName = document.getElementById('team-project-name')?.value.trim();
  const teamSize = parseInt(document.getElementById('team-size-select')?.value) || 4;
  const skills = getSelectedSkills();
  const roles = getSelectedRoles();

  if (!projectName) {
    alert('Please enter a project name');
    return;
  }

  if (skills.length === 0) {
    alert('Please add at least one required skill');
    return;
  }

  // Show loading and generate team suggestions
  document.getElementById('step-requirements').style.display = 'none';
  document.getElementById('step-suggestions').style.display = 'block';

  await generateTeamSuggestions({
    projectName,
    teamSize,
    skills,
    roles
  });
};

window.goBackToRequirements = function() {
  document.getElementById('step-suggestions').style.display = 'none';
  document.getElementById('step-requirements').style.display = 'block';
};

window.proceedToTeamReview = function() {
  const selectedTeam = getSelectedTeamSuggestion();
  if (!selectedTeam) {
    alert('Please select a team suggestion');
    return;
  }

  document.getElementById('step-suggestions').style.display = 'none';
  document.getElementById('step-review').style.display = 'block';

  renderTeamReview(selectedTeam);
};

window.goBackToSuggestions = function() {
  document.getElementById('step-review').style.display = 'none';
  document.getElementById('step-suggestions').style.display = 'block';
};

// Generate team suggestions
async function generateTeamSuggestions(requirements) {
  const content = document.getElementById('team-suggestions-content');
  
  content.innerHTML = `
    <div style="text-align: center; padding: 3rem; color: rgba(255, 255, 255, 0.6);">
      <i class="fas fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 1rem;"></i>
      <p>Analyzing community and generating optimal team suggestions...</p>
    </div>
  `;

  try {
    // Use enhanced team building algorithm
    const suggestions = await buildOptimalTeam(requirements);
    
    // Store suggestions globally for selection
    window.currentTeamSuggestions = suggestions;
    
    if (suggestions.length === 0) {
      content.innerHTML = `
        <div style="text-align: center; padding: 3rem; color: rgba(255, 255, 255, 0.6);">
          <i class="fas fa-users" style="font-size: 3rem; opacity: 0.3; margin-bottom: 1rem;"></i>
          <h3 style="color: rgba(255, 255, 255, 0.8); margin-bottom: 0.5rem;">No suitable teams found</h3>
          <p>Try adjusting your requirements or adding more skills</p>
        </div>
      `;
      return;
    }

    // Render team suggestions
    let html = `
      <div style="margin-bottom: 2rem;">
        <p style="color: rgba(255, 255, 255, 0.7);">
          Found ${suggestions.length} optimal team configuration${suggestions.length > 1 ? 's' : ''} based on your requirements.
          Select the team that best fits your project needs.
        </p>
      </div>
    `;

    suggestions.forEach((team, index) => {
      html += renderTeamSuggestionCard(team, index);
    });

    content.innerHTML = html;

  } catch (error) {
    console.error('Error generating team suggestions:', error);
    content.innerHTML = `
      <div style="text-align: center; padding: 3rem; color: #ff6666;">
        <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 1rem;"></i>
        <p>Failed to generate team suggestions. Please try again.</p>
      </div>
    `;
  }
}

// Build optimal team using enhanced algorithm
window.buildOptimalTeam = async function(requirements) {
  console.log('🤝 Building optimal team with requirements:', requirements);

  if (!supabase) return [];

  try {
    // Get all community members
    const { data: members, error } = await supabase
      .from('community')
      .select('*')
      .neq('id', currentUserProfile?.id || ''); // Exclude current user

    if (error) throw error;

    if (!members || members.length === 0) {
      console.warn('No community members found');
      return [];
    }

    // Process members and calculate compatibility scores
    const processedMembers = members.map(member => ({
      ...member,
      skills: parseSkills(member.skills || ''),
      compatibilityScore: calculateMemberCompatibility(member, requirements)
    }));

    // Generate multiple team configurations
    const teamSuggestions = [];
    const maxSuggestions = 3;

    for (let i = 0; i < maxSuggestions; i++) {
      const team = generateTeamConfiguration(processedMembers, requirements, i);
      if (team && team.members.length >= 2) {
        teamSuggestions.push(team);
      }
    }

    // Sort by overall team score
    teamSuggestions.sort((a, b) => b.overallScore - a.overallScore);

    console.log(`✅ Generated ${teamSuggestions.length} team suggestions`);
    return teamSuggestions;

  } catch (error) {
    console.error('Error building optimal team:', error);
    return [];
  }
};

// Calculate member compatibility with requirements
function calculateMemberCompatibility(member, requirements) {
  let score = 0;
  const memberSkills = parseSkills(member.skills || '');
  
  // Skill matching
  const skillMatches = requirements.skills.filter(reqSkill => 
    memberSkills.some(memberSkill => 
      memberSkill.toLowerCase().includes(reqSkill.toLowerCase()) ||
      reqSkill.toLowerCase().includes(memberSkill.toLowerCase())
    )
  );
  
  score += skillMatches.length * 20; // 20 points per skill match
  
  // Role matching
  if (requirements.roles.length > 0) {
    const memberRole = member.user_role?.toLowerCase() || '';
    const roleMatch = requirements.roles.some(roleId => {
      const role = TEAM_ROLES[roleId.toUpperCase()];
      return role && role.skills.some(skill => 
        memberSkills.some(memberSkill => 
          memberSkill.toLowerCase().includes(skill.toLowerCase())
        )
      );
    });
    
    if (roleMatch) score += 15;
  }
  
  // Availability bonus
  if (member.availability === 'Available') score += 10;
  else if (member.availability === 'Open to opportunities') score += 5;
  
  // Profile completeness
  if (member.bio && member.bio.length > 20) score += 5;
  if (member.image_url) score += 3;
  
  return score;
}

// Generate team configuration
function generateTeamConfiguration(members, requirements, variation = 0) {
  const teamSize = requirements.teamSize;
  const selectedMembers = [];
  const usedIds = new Set();
  
  // Sort members by compatibility (with some randomization for variation)
  const sortedMembers = [...members].sort((a, b) => {
    const scoreA = a.compatibilityScore + (Math.random() - 0.5) * variation * 10;
    const scoreB = b.compatibilityScore + (Math.random() - 0.5) * variation * 10;
    return scoreB - scoreA;
  });
  
  // Select team members ensuring skill coverage
  const requiredSkillsCovered = new Set();
  
  // First pass: prioritize skill coverage
  for (const member of sortedMembers) {
    if (selectedMembers.length >= teamSize) break;
    if (usedIds.has(member.id)) continue;
    
    const memberSkills = parseSkills(member.skills || '');
    const newSkillsCovered = requirements.skills.filter(reqSkill => 
      memberSkills.some(memberSkill => 
        memberSkill.toLowerCase().includes(reqSkill.toLowerCase())
      ) && !requiredSkillsCovered.has(reqSkill)
    );
    
    if (newSkillsCovered.length > 0 || selectedMembers.length === 0) {
      selectedMembers.push(member);
      usedIds.add(member.id);
      newSkillsCovered.forEach(skill => requiredSkillsCovered.add(skill));
    }
  }
  
  // Second pass: fill remaining slots with best candidates
  for (const member of sortedMembers) {
    if (selectedMembers.length >= teamSize) break;
    if (usedIds.has(member.id)) continue;
    
    selectedMembers.push(member);
    usedIds.add(member.id);
  }
  
  // Calculate team metrics
  const skillCoverage = (requiredSkillsCovered.size / requirements.skills.length) * 100;
  const avgCompatibility = selectedMembers.reduce((sum, m) => sum + m.compatibilityScore, 0) / selectedMembers.length;
  const overallScore = (skillCoverage * 0.6) + (avgCompatibility * 0.4);
  
  return {
    members: selectedMembers,
    skillCoverage,
    avgCompatibility,
    overallScore,
    coveredSkills: Array.from(requiredSkillsCovered),
    missingSkills: requirements.skills.filter(skill => !requiredSkillsCovered.has(skill))
  };
}

// Render team suggestion card
function renderTeamSuggestionCard(team, index) {
  return `
    <div class="team-suggestion-card" data-team-index="${index}" onclick="selectTeamSuggestion(${index})">
      <div style="display: flex; justify-content: between; align-items: center; margin-bottom: 1rem;">
        <h4 style="color: #00e0ff; margin: 0; font-size: 1.2rem;">
          Team Option ${index + 1}
        </h4>
        <div class="compatibility-score">
          ${Math.round(team.overallScore)}% Match
        </div>
      </div>
      
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1rem;">
        ${team.members.map(member => {
          const initials = member.name.split(' ').map(n => n[0]).join('').toUpperCase();
          return `
            <div class="team-member-card">
              <div class="member-avatar">${initials}</div>
              <div>
                <div style="color: #00e0ff; font-weight: 600;">${member.name}</div>
                <div style="color: rgba(255, 255, 255, 0.7); font-size: 0.85rem;">${member.user_role || 'Member'}</div>
                <div style="color: rgba(255, 255, 255, 0.6); font-size: 0.8rem;">${Math.round(member.compatibilityScore)}% fit</div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; font-size: 0.9rem;">
        <div>
          <strong style="color: rgba(255, 255, 255, 0.8);">Skill Coverage:</strong>
          <span style="color: #00ff88;">${Math.round(team.skillCoverage)}%</span>
        </div>
        <div>
          <strong style="color: rgba(255, 255, 255, 0.8);">Team Size:</strong>
          <span style="color: #00e0ff;">${team.members.length} members</span>
        </div>
      </div>
      
      ${team.missingSkills.length > 0 ? `
        <div style="margin-top: 0.75rem; padding: 0.75rem; background: rgba(255, 170, 0, 0.1); border: 1px solid rgba(255, 170, 0, 0.3); border-radius: 6px;">
          <div style="color: #ffaa00; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.25rem;">
            Missing Skills:
          </div>
          <div style="color: rgba(255, 255, 255, 0.7); font-size: 0.8rem;">
            ${team.missingSkills.join(', ')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

// Helper functions
function parseSkills(skillsString) {
  if (!skillsString) return [];
  if (Array.isArray(skillsString)) return skillsString;
  return skillsString.split(',').map(s => s.trim()).filter(Boolean);
}

// Global functions for team selection
window.selectTeamSuggestion = function(index) {
  // Remove previous selections
  document.querySelectorAll('.team-suggestion-card').forEach(card => {
    card.classList.remove('selected');
  });
  
  // Select current team
  const selectedCard = document.querySelector(`[data-team-index="${index}"]`);
  if (selectedCard) {
    selectedCard.classList.add('selected');
  }
};

function getSelectedTeamSuggestion() {
  const selectedCard = document.querySelector('.team-suggestion-card.selected');
  if (!selectedCard) return null;
  
  const index = parseInt(selectedCard.dataset.teamIndex);
  return window.currentTeamSuggestions?.[index] || null;
}

// Render team review
function renderTeamReview(team) {
  const content = document.getElementById('team-review-content');
  
  content.innerHTML = `
    <div style="margin-bottom: 2rem;">
      <div style="background: rgba(0, 255, 136, 0.1); border: 1px solid rgba(0, 255, 136, 0.3); border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem;">
        <h4 style="color: #00ff88; margin: 0 0 0.5rem 0;">
          <i class="fas fa-check-circle"></i> Team Selected
        </h4>
        <p style="color: rgba(255, 255, 255, 0.8); margin: 0;">
          ${Math.round(team.overallScore)}% compatibility match with ${Math.round(team.skillCoverage)}% skill coverage
        </p>
      </div>
      
      <h4 style="color: #00e0ff; margin-bottom: 1rem;">Team Members (${team.members.length})</h4>
      
      <div style="display: grid; gap: 1rem;">
        ${team.members.map(member => {
          const initials = member.name.split(' ').map(n => n[0]).join('').toUpperCase();
          const skills = parseSkills(member.skills || '');
          
          return `
            <div style="background: rgba(0, 224, 255, 0.05); border: 1px solid rgba(0, 224, 255, 0.2); border-radius: 8px; padding: 1.5rem;">
              <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem;">
                <div class="member-avatar" style="width: 60px; height: 60px; font-size: 1.5rem;">${initials}</div>
                <div>
                  <h5 style="color: #00e0ff; margin: 0 0 0.25rem 0; font-size: 1.1rem;">${member.name}</h5>
                  <div style="color: rgba(255, 255, 255, 0.7); margin-bottom: 0.25rem;">${member.user_role || 'Member'}</div>
                  <div style="color: rgba(255, 255, 255, 0.6); font-size: 0.85rem;">
                    ${member.availability || 'Available'} • ${Math.round(member.compatibilityScore)}% project fit
                  </div>
                </div>
              </div>
              
              ${member.bio ? `
                <p style="color: rgba(255, 255, 255, 0.8); margin-bottom: 1rem; font-size: 0.9rem; line-height: 1.4;">
                  ${member.bio}
                </p>
              ` : ''}
              
              ${skills.length > 0 ? `
                <div>
                  <div style="color: rgba(255, 255, 255, 0.6); font-size: 0.8rem; margin-bottom: 0.5rem;">Skills:</div>
                  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                    ${skills.slice(0, 6).map(skill => `
                      <span style="background: rgba(0, 224, 255, 0.15); border: 1px solid rgba(0, 224, 255, 0.3); color: #00e0ff; padding: 0.25rem 0.75rem; border-radius: 12px; font-size: 0.8rem;">
                        ${skill}
                      </span>
                    `).join('')}
                    ${skills.length > 6 ? `<span style="color: rgba(255, 255, 255, 0.6); font-size: 0.8rem;">+${skills.length - 6} more</span>` : ''}
                  </div>
                </div>
              ` : ''}
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

// Create team and send invitations
window.createTeamAndInvite = async function() {
  const selectedTeam = getSelectedTeamSuggestion();
  if (!selectedTeam) return;

  const projectName = document.getElementById('team-project-name')?.value.trim();
  const projectDescription = `Team project created with ${selectedTeam.members.length} members using AI-powered matching`;
  const requiredSkills = getSelectedSkills();
  const themeId = document.getElementById('team-theme-select')?.value || null;
  
  try {
    // Show loading state
    const button = event.target;
    const originalHTML = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
    button.disabled = true;

    console.log('🎉 Creating team project and sending invitations:', {
      projectName,
      teamMembers: selectedTeam.members.map(m => ({ id: m.id, name: m.name })),
      requiredSkills,
      themeId
    });

    // 1. Create the project
    const projectData = {
      title: projectName,
      description: projectDescription,
      required_skills: requiredSkills,
      creator_id: currentUserProfile.id,
      status: 'active',
      team_size: selectedTeam.members.length + 1 // +1 for creator
    };

    if (themeId) {
      projectData.theme_id = themeId;
    }

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .insert([projectData])
      .select()
      .single();

    if (projectError) throw projectError;

    console.log('✅ Project created:', project);

    // 2. Add creator as project member
    const { error: creatorError } = await supabase
      .from('project_members')
      .insert({
        project_id: project.id,
        user_id: currentUserProfile.id,
        role: 'creator'
      });

    if (creatorError) throw creatorError;

    // 3. Send invitations to team members
    const invitations = selectedTeam.members.map(member => ({
      project_id: project.id,
      user_id: member.id,
      role: 'pending'
    }));

    const { error: inviteError } = await supabase
      .from('project_members')
      .insert(invitations);

    if (inviteError) throw inviteError;

    console.log('✅ Team invitations sent to:', selectedTeam.members.length, 'members');

    // 4. Award XP for creating project with team
    if (window.DailyEngagement) {
      await window.DailyEngagement.awardXP(
        window.DailyEngagement.XP_REWARDS.CREATE_PROJECT * 2, // Double XP for team projects
        `Created team project: ${projectName} with ${selectedTeam.members.length} members`
      );
    }

    // 5. Show success notification
    if (window.showSynapseNotification) {
      window.showSynapseNotification(
        `Team project "${projectName}" created! Invitations sent to ${selectedTeam.members.length} members 🎉`, 
        'success'
      );
    } else {
      alert(`Team project "${projectName}" created! Invitations sent to ${selectedTeam.members.length} members`);
    }

    // 6. Refresh synapse view to show new project
    if (window.refreshSynapseProjectCircles) {
      await window.refreshSynapseProjectCircles();
    }

    // 7. Close modal
    closeTeamBuilder();

    // 8. Optionally open the project details
    if (window.openProjectDetails) {
      setTimeout(() => {
        window.openProjectDetails(project);
      }, 1000);
    }

  } catch (error) {
    console.error('Error creating team:', error);
    
    // Restore button state
    const button = event.target;
    button.innerHTML = originalHTML;
    button.disabled = false;
    
    if (window.showSynapseNotification) {
      window.showSynapseNotification('Failed to create team project. Please try again.', 'error');
    } else {
      alert('Failed to create team project. Please try again.');
    }
  }
};

// Close team builder modal
window.closeTeamBuilder = function() {
  const modal = document.getElementById('team-builder-modal');
  if (modal) {
    modal.remove();
  }
  console.log('🗑️ Team builder modal closed');
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initEnhancedTeamBuilder();
});

// Placeholder functions for future implementation
window.inviteTeamMembers = function(memberIds, projectId) {
  console.log('📧 Inviting team members:', { memberIds, projectId });
  // This would integrate with the invitation system
};

window.createTeamFromSuggestions = function(teamSuggestion) {
  console.log('👥 Creating team from suggestions:', teamSuggestion);
  // This would create a team based on AI suggestions
};

window.analyzeTeamCompatibility = function(teamMembers) {
  console.log('🔍 Analyzing team compatibility:', teamMembers);
  // This would analyze how well team members work together
  return { score: 85, factors: ['skill_match', 'experience_balance'] };
};

console.log('✅ Enhanced team builder ready');