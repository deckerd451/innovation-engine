// ================================================================
// ENHANCED PROJECT CREATION SYSTEM
// ================================================================
// Streamlined project creation with templates, smart suggestions, and better UX

console.log("%c🚀 Enhanced Project Creation Loading...", "color:#0ff; font-weight: bold; font-size: 16px");

let supabase = null;
let currentUserProfile = null;

// Project templates for quick start
const PROJECT_TEMPLATES = [
  {
    id: 'web-app',
    name: 'Web Application',
    icon: '🌐',
    description: 'Build a modern web application',
    suggestedSkills: ['JavaScript', 'React', 'Node.js', 'CSS', 'HTML'],
    defaultDescription: 'A modern web application with user authentication, responsive design, and real-time features.'
  },
  {
    id: 'mobile-app',
    name: 'Mobile App',
    icon: '📱',
    description: 'Create a mobile application',
    suggestedSkills: ['React Native', 'Flutter', 'Swift', 'Kotlin', 'UI/UX Design'],
    defaultDescription: 'A cross-platform mobile application with intuitive user interface and native performance.'
  },
  {
    id: 'ai-ml',
    name: 'AI/ML Project',
    icon: '🤖',
    description: 'Machine learning or AI solution',
    suggestedSkills: ['Python', 'TensorFlow', 'PyTorch', 'Data Science', 'Machine Learning'],
    defaultDescription: 'An AI-powered solution using machine learning algorithms to solve real-world problems.'
  },
  {
    id: 'blockchain',
    name: 'Blockchain/Web3',
    icon: '⛓️',
    description: 'Decentralized application or smart contract',
    suggestedSkills: ['Solidity', 'Web3.js', 'Ethereum', 'Smart Contracts', 'DeFi'],
    defaultDescription: 'A decentralized application built on blockchain technology with smart contract integration.'
  },
  {
    id: 'game-dev',
    name: 'Game Development',
    icon: '🎮',
    description: 'Video game or interactive experience',
    suggestedSkills: ['Unity', 'Unreal Engine', 'C#', 'C++', 'Game Design'],
    defaultDescription: 'An engaging game with immersive gameplay mechanics and polished user experience.'
  },
  {
    id: 'data-viz',
    name: 'Data Visualization',
    icon: '📊',
    description: 'Interactive data dashboard or visualization',
    suggestedSkills: ['D3.js', 'Python', 'Tableau', 'Data Analysis', 'Statistics'],
    defaultDescription: 'An interactive data visualization tool that transforms complex data into actionable insights.'
  },
  {
    id: 'iot',
    name: 'IoT Project',
    icon: '🔌',
    description: 'Internet of Things hardware/software',
    suggestedSkills: ['Arduino', 'Raspberry Pi', 'C++', 'Python', 'Hardware Design'],
    defaultDescription: 'An IoT solution connecting physical devices with cloud services for smart automation.'
  },
  {
    id: 'custom',
    name: 'Custom Project',
    icon: '✨',
    description: 'Start from scratch with your own idea',
    suggestedSkills: [],
    defaultDescription: ''
  }
];

// Common skills for suggestions
const SKILL_SUGGESTIONS = [
  // Programming Languages
  'JavaScript', 'Python', 'Java', 'C++', 'C#', 'TypeScript', 'Go', 'Rust', 'Swift', 'Kotlin',
  
  // Frontend
  'React', 'Vue.js', 'Angular', 'HTML', 'CSS', 'Sass', 'Tailwind CSS', 'Bootstrap',
  
  // Backend
  'Node.js', 'Express.js', 'Django', 'Flask', 'Spring Boot', 'ASP.NET', 'Ruby on Rails',
  
  // Mobile
  'React Native', 'Flutter', 'iOS Development', 'Android Development',
  
  // Database
  'PostgreSQL', 'MongoDB', 'MySQL', 'Redis', 'Firebase', 'Supabase',
  
  // Cloud & DevOps
  'AWS', 'Google Cloud', 'Azure', 'Docker', 'Kubernetes', 'CI/CD', 'DevOps',
  
  // AI/ML
  'Machine Learning', 'Deep Learning', 'TensorFlow', 'PyTorch', 'Data Science', 'NLP',
  
  // Design
  'UI/UX Design', 'Figma', 'Adobe Creative Suite', 'Sketch', 'Prototyping',
  
  // Other
  'Blockchain', 'Smart Contracts', 'Game Development', 'Unity', 'Unreal Engine', 'AR/VR'
];

// Initialize enhanced project creation
export function initEnhancedProjectCreation() {
  supabase = window.supabase;
  
  // Listen for profile loaded
  window.addEventListener('profile-loaded', (e) => {
    currentUserProfile = e.detail.profile;
  });

  // Expose enhanced functions globally
  window.showEnhancedProjectCreation = showEnhancedProjectCreation;
  window.selectProjectTemplate = selectProjectTemplate;
  window.addSkillToProject = addSkillToProject;
  window.removeSkillFromProject = removeSkillFromProject;
  window.createEnhancedProject = createEnhancedProject;

  console.log('✅ Enhanced project creation initialized');
}

// Show enhanced project creation modal
export async function showEnhancedProjectCreation(preselectedThemeId = null, preselectedThemeName = null) {
  console.log('🚀 Opening enhanced project creation modal');

  // Remove existing modal if present
  const existing = document.getElementById('enhanced-project-modal');
  if (existing) existing.remove();

  // Create modal
  const modal = document.createElement('div');
  modal.id = 'enhanced-project-modal';
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
    <div class="enhanced-project-container" style="
      background: linear-gradient(135deg, rgba(10, 14, 39, 0.98), rgba(26, 26, 46, 0.98));
      border: 2px solid rgba(0, 224, 255, 0.5);
      border-radius: 16px;
      backdrop-filter: blur(10px);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.7);
      max-width: 900px;
      width: 100%;
      max-height: 90vh;
      overflow-y: auto;
      position: relative;
    ">
      <!-- Header -->
      <div style="padding: 2rem 2rem 1rem; border-bottom: 1px solid rgba(0, 224, 255, 0.2);">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <h2 style="color: #00e0ff; margin: 0 0 0.5rem 0; font-size: 1.75rem;">
              <i class="fas fa-rocket"></i> Create New Project
            </h2>
            <p style="color: rgba(255, 255, 255, 0.7); margin: 0; font-size: 1rem;">
              Choose a template or start from scratch
            </p>
          </div>
          <button onclick="closeEnhancedProjectModal()" style="
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

      <!-- Content -->
      <div style="padding: 2rem;">
        <!-- Step 1: Template Selection -->
        <div id="template-selection-step" class="creation-step">
          <h3 style="color: #00e0ff; margin: 0 0 1.5rem 0; font-size: 1.3rem;">
            <span class="step-number">1</span> Choose a Template
          </h3>
          
          <div class="template-grid" style="
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 1rem;
            margin-bottom: 2rem;
          ">
            ${PROJECT_TEMPLATES.map(template => `
              <div class="template-card" data-template-id="${template.id}" style="
                background: rgba(0, 224, 255, 0.05);
                border: 2px solid rgba(0, 224, 255, 0.2);
                border-radius: 12px;
                padding: 1.5rem;
                cursor: pointer;
                transition: all 0.3s;
                position: relative;
              " onclick="selectProjectTemplate('${template.id}')">
                <div style="font-size: 2.5rem; margin-bottom: 0.75rem;">${template.icon}</div>
                <h4 style="color: #00e0ff; margin: 0 0 0.5rem 0; font-size: 1.1rem;">
                  ${template.name}
                </h4>
                <p style="color: rgba(255, 255, 255, 0.7); margin: 0; font-size: 0.9rem; line-height: 1.4;">
                  ${template.description}
                </p>
                ${template.suggestedSkills.length > 0 ? `
                  <div style="margin-top: 0.75rem;">
                    <div style="font-size: 0.75rem; color: rgba(255, 255, 255, 0.5); margin-bottom: 0.25rem;">
                      Suggested skills:
                    </div>
                    <div style="display: flex; flex-wrap: wrap; gap: 0.25rem;">
                      ${template.suggestedSkills.slice(0, 3).map(skill => `
                        <span style="
                          background: rgba(0, 224, 255, 0.15);
                          color: rgba(0, 224, 255, 0.8);
                          padding: 0.125rem 0.5rem;
                          border-radius: 8px;
                          font-size: 0.7rem;
                        ">${skill}</span>
                      `).join('')}
                      ${template.suggestedSkills.length > 3 ? `
                        <span style="color: rgba(255, 255, 255, 0.5); font-size: 0.7rem;">
                          +${template.suggestedSkills.length - 3} more
                        </span>
                      ` : ''}
                    </div>
                  </div>
                ` : ''}
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Step 2: Project Details -->
        <div id="project-details-step" class="creation-step" style="display: none;">
          <h3 style="color: #00e0ff; margin: 0 0 1.5rem 0; font-size: 1.3rem;">
            <span class="step-number">2</span> Project Details
          </h3>

          <form id="enhanced-project-form">
            <!-- Project Name -->
            <div style="margin-bottom: 1.5rem;">
              <label style="display: block; color: rgba(255, 255, 255, 0.8); margin-bottom: 0.5rem; font-weight: 600;">
                Project Name *
              </label>
              <input type="text" id="enhanced-project-name" required style="
                width: 100%;
                padding: 0.875rem;
                background: rgba(0, 224, 255, 0.05);
                border: 2px solid rgba(0, 224, 255, 0.3);
                border-radius: 8px;
                color: white;
                font-size: 1rem;
                transition: border-color 0.2s;
              " placeholder="Enter your project name">
            </div>

            <!-- Description -->
            <div style="margin-bottom: 1.5rem;">
              <label style="display: block; color: rgba(255, 255, 255, 0.8); margin-bottom: 0.5rem; font-weight: 600;">
                Description *
              </label>
              <textarea id="enhanced-project-description" rows="4" required style="
                width: 100%;
                padding: 0.875rem;
                background: rgba(0, 224, 255, 0.05);
                border: 2px solid rgba(0, 224, 255, 0.3);
                border-radius: 8px;
                color: white;
                font-size: 1rem;
                resize: vertical;
                transition: border-color 0.2s;
              " placeholder="Describe your project goals and vision"></textarea>
            </div>

            <!-- Skills Selection -->
            <div style="margin-bottom: 1.5rem;">
              <label style="display: block; color: rgba(255, 255, 255, 0.8); margin-bottom: 0.5rem; font-weight: 600;">
                Required Skills
              </label>
              
              <!-- Selected Skills -->
              <div id="selected-skills" style="
                min-height: 50px;
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
                  Click skills below to add them
                </span>
              </div>

              <!-- Skill Input -->
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
                <button type="button" onclick="addCustomSkill()" style="
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

              <!-- Skill Suggestions -->
              <div style="margin-bottom: 0.5rem;">
                <div style="font-size: 0.85rem; color: rgba(255, 255, 255, 0.6); margin-bottom: 0.5rem;">
                  Popular skills:
                </div>
                <div id="skill-suggestions" style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                  <!-- Will be populated by JavaScript -->
                </div>
              </div>
            </div>

            <!-- Theme Selection -->
            <div style="margin-bottom: 1.5rem;">
              <label style="display: block; color: rgba(255, 255, 255, 0.8); margin-bottom: 0.5rem; font-weight: 600;">
                <i class="fas fa-bullseye" style="color: #00e0ff;"></i> Theme Circle (optional)
              </label>
              <select id="enhanced-project-theme" style="
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
              <small style="color: rgba(255, 255, 255, 0.6); display: block; margin-top: 0.5rem;">
                Link this project to an active theme to help others discover it
              </small>
            </div>

            <!-- Action Buttons -->
            <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 2rem;">
              <button type="button" onclick="goBackToTemplates()" style="
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
              <button type="submit" style="
                padding: 0.875rem 2rem;
                background: linear-gradient(135deg, rgba(0, 224, 255, 0.3), rgba(0, 224, 255, 0.2));
                border: 2px solid rgba(0, 224, 255, 0.5);
                border-radius: 8px;
                color: #00e0ff;
                cursor: pointer;
                font-weight: 700;
                font-size: 1rem;
              ">
                <i class="fas fa-rocket"></i> Create Project
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  // Add styles
  const style = document.createElement('style');
  style.textContent = `
    .template-card:hover {
      border-color: rgba(0, 224, 255, 0.6) !important;
      background: rgba(0, 224, 255, 0.1) !important;
      transform: translateY(-2px);
      box-shadow: 0 8px 25px rgba(0, 224, 255, 0.2);
    }

    .template-card.selected {
      border-color: rgba(0, 224, 255, 0.8) !important;
      background: rgba(0, 224, 255, 0.15) !important;
      box-shadow: 0 0 20px rgba(0, 224, 255, 0.3);
    }

    .step-number {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      background: rgba(0, 224, 255, 0.2);
      border: 1px solid rgba(0, 224, 255, 0.4);
      border-radius: 50%;
      font-size: 0.9rem;
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

    .skill-suggestion {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: rgba(255, 255, 255, 0.8);
      padding: 0.375rem 0.75rem;
      border-radius: 16px;
      font-size: 0.8rem;
      cursor: pointer;
      transition: all 0.2s;
    }

    .skill-suggestion:hover {
      background: rgba(0, 224, 255, 0.1);
      border-color: rgba(0, 224, 255, 0.3);
      color: #00e0ff;
    }

    #enhanced-project-name:focus,
    #enhanced-project-description:focus,
    #selected-skills:focus-within,
    #skill-input:focus,
    #enhanced-project-theme:focus {
      border-color: rgba(0, 224, 255, 0.6);
      outline: none;
      box-shadow: 0 0 0 3px rgba(0, 224, 255, 0.1);
    }
  `;
  document.head.appendChild(style);

  document.body.appendChild(modal);

  // Initialize the modal
  await initializeEnhancedModal(preselectedThemeId, preselectedThemeName);

  // Add event listeners
  setupEnhancedModalEventListeners();

  console.log('✅ Enhanced project creation modal opened');
}

// Initialize modal with data
async function initializeEnhancedModal(preselectedThemeId, preselectedThemeName) {
  // Load themes into dropdown
  await loadThemesIntoEnhancedDropdown(preselectedThemeId);
  
  // Populate skill suggestions
  populateSkillSuggestions();
  
  // Setup skill input
  setupSkillInput();
}

// Load themes into enhanced dropdown
async function loadThemesIntoEnhancedDropdown(preselectedThemeId = null) {
  const dropdown = document.getElementById('enhanced-project-theme');
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
        
        // Pre-select if specified
        if (preselectedThemeId && theme.id === preselectedThemeId) {
          option.selected = true;
        }
        
        dropdown.appendChild(option);
      });
      console.log(`✅ Loaded ${themes.length} themes into enhanced dropdown`);
    }
  } catch (err) {
    console.error('Error loading themes dropdown:', err);
  }
}

// Populate skill suggestions
function populateSkillSuggestions() {
  const container = document.getElementById('skill-suggestions');
  if (!container) return;

  // Show first 12 popular skills
  const popularSkills = SKILL_SUGGESTIONS.slice(0, 12);
  
  container.innerHTML = popularSkills.map(skill => `
    <span class="skill-suggestion" onclick="addSkillToProject('${skill}')">
      ${skill}
    </span>
  `).join('');
}

// Setup skill input functionality
function setupSkillInput() {
  const input = document.getElementById('skill-input');
  if (!input) return;

  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCustomSkill();
    }
  });

  // Add autocomplete functionality
  input.addEventListener('input', (e) => {
    const value = e.target.value.toLowerCase();
    if (value.length < 2) return;

    // Filter suggestions based on input
    const matches = SKILL_SUGGESTIONS.filter(skill => 
      skill.toLowerCase().includes(value) && 
      !getSelectedSkills().includes(skill)
    ).slice(0, 8);

    updateSkillSuggestions(matches);
  });
}

// Update skill suggestions based on input
function updateSkillSuggestions(skills) {
  const container = document.getElementById('skill-suggestions');
  if (!container) return;

  container.innerHTML = skills.map(skill => `
    <span class="skill-suggestion" onclick="addSkillToProject('${skill}')">
      ${skill}
    </span>
  `).join('');
}

// Select project template
window.selectProjectTemplate = function(templateId) {
  console.log('🎯 Template selected:', templateId);
  
  // Update UI to show selection
  document.querySelectorAll('.template-card').forEach(card => {
    card.classList.remove('selected');
  });
  
  const selectedCard = document.querySelector(`[data-template-id="${templateId}"]`);
  if (selectedCard) {
    selectedCard.classList.add('selected');
  }

  // Get template data
  const template = PROJECT_TEMPLATES.find(t => t.id === templateId);
  if (!template) return;

  // Pre-fill form with template data
  setTimeout(() => {
    const descriptionField = document.getElementById('enhanced-project-description');
    if (descriptionField && template.defaultDescription) {
      descriptionField.value = template.defaultDescription;
    }

    // Add suggested skills
    if (template.suggestedSkills.length > 0) {
      clearSelectedSkills();
      template.suggestedSkills.forEach(skill => {
        addSkillToProject(skill);
      });
    }
  }, 100);

  // Move to next step
  setTimeout(() => {
    showProjectDetailsStep();
  }, 300);
};

// Show project details step
function showProjectDetailsStep() {
  document.getElementById('template-selection-step').style.display = 'none';
  document.getElementById('project-details-step').style.display = 'block';
  
  // Focus on project name field
  setTimeout(() => {
    const nameField = document.getElementById('enhanced-project-name');
    if (nameField) nameField.focus();
  }, 100);
}

// Go back to templates
window.goBackToTemplates = function() {
  document.getElementById('project-details-step').style.display = 'none';
  document.getElementById('template-selection-step').style.display = 'block';
};

// Add skill to project
window.addSkillToProject = function(skill) {
  const selectedSkills = getSelectedSkills();
  
  if (selectedSkills.includes(skill)) {
    console.log('Skill already added:', skill);
    return;
  }

  const container = document.getElementById('selected-skills');
  const placeholder = document.getElementById('skills-placeholder');
  
  if (placeholder) {
    placeholder.style.display = 'none';
  }

  const skillTag = document.createElement('span');
  skillTag.className = 'skill-tag';
  skillTag.innerHTML = `
    ${skill}
    <button type="button" onclick="removeSkillFromProject('${skill}')" style="
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
  
  // Clear skill input
  const input = document.getElementById('skill-input');
  if (input) input.value = '';
  
  // Reset suggestions
  populateSkillSuggestions();
  
  console.log('✅ Added skill:', skill);
};

// Remove skill from project
window.removeSkillFromProject = function(skill) {
  const container = document.getElementById('selected-skills');
  const skillTags = container.querySelectorAll('.skill-tag');
  
  skillTags.forEach(tag => {
    if (tag.textContent.trim().startsWith(skill)) {
      tag.remove();
    }
  });

  // Show placeholder if no skills
  const remainingSkills = container.querySelectorAll('.skill-tag');
  if (remainingSkills.length === 0) {
    const placeholder = document.getElementById('skills-placeholder');
    if (placeholder) {
      placeholder.style.display = 'block';
    }
  }

  console.log('🗑️ Removed skill:', skill);
};

// Add custom skill
window.addCustomSkill = function() {
  const input = document.getElementById('skill-input');
  if (!input) return;

  const skill = input.value.trim();
  if (!skill) return;

  addSkillToProject(skill);
};

// Get selected skills
function getSelectedSkills() {
  const container = document.getElementById('selected-skills');
  const skillTags = container.querySelectorAll('.skill-tag');
  
  return Array.from(skillTags).map(tag => {
    const text = tag.textContent.trim();
    // Remove the 'x' button text
    return text.substring(0, text.length - 1).trim();
  });
}

// Clear selected skills
function clearSelectedSkills() {
  const container = document.getElementById('selected-skills');
  const skillTags = container.querySelectorAll('.skill-tag');
  skillTags.forEach(tag => tag.remove());
  
  const placeholder = document.getElementById('skills-placeholder');
  if (placeholder) {
    placeholder.style.display = 'block';
  }
}

// Setup event listeners
function setupEnhancedModalEventListeners() {
  // Form submission
  const form = document.getElementById('enhanced-project-form');
  if (form) {
    form.addEventListener('submit', createEnhancedProject);
  }

  // Close modal on backdrop click
  const modal = document.getElementById('enhanced-project-modal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeEnhancedProjectModal();
      }
    });
  }
}

// Create enhanced project
window.createEnhancedProject = async function(event) {
  event.preventDefault();
  
  console.log('🚀 Creating enhanced project...');

  if (!currentUserProfile) {
    alert('Please log in first');
    return;
  }

  const submitBtn = event.target.querySelector('button[type="submit"]');
  const originalHTML = submitBtn.innerHTML;
  
  // Show loading state
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
  submitBtn.disabled = true;

  try {
    // Get form data
    const name = document.getElementById('enhanced-project-name').value.trim();
    const description = document.getElementById('enhanced-project-description').value.trim();
    const themeId = document.getElementById('enhanced-project-theme').value || null;
    const skills = getSelectedSkills();

    if (!name || !description) {
      throw new Error('Please fill in all required fields');
    }

    // Create project data
    const projectData = {
      title: name,
      description,
      skills: skills,
      creator_id: currentUserProfile.id,
      status: 'active'
    };

    // Add theme if selected
    if (themeId) {
      projectData.theme_id = themeId;
    }

    console.log('📝 Project data:', projectData);

    // Insert project
    const { data, error } = await supabase
      .from('projects')
      .insert([projectData])
      .select();

    if (error) {
      console.error('❌ Database error:', error);
      throw error;
    }

    console.log('✅ Project created successfully:', data[0]);

    // Add creator as a project member
    try {
      await supabase.from('project_members').insert({
        project_id: data[0].id,
        user_id: currentUserProfile.id,
        role: 'creator',
      });
    } catch (memberError) {
      console.warn('Could not add creator as project member:', memberError);
    }

    // Dispatch project created event
    const projectCreatedEvent = new CustomEvent('project-created', {
      detail: {
        id: data[0].id,
        name: name,
        description: description,
        skills: skills,
        themeId: themeId
      }
    });
    document.dispatchEvent(projectCreatedEvent);

    // Award XP for creating project
    if (window.DailyEngagement) {
      try {
        await window.DailyEngagement.awardXP(
          window.DailyEngagement.XP_REWARDS.CREATE_PROJECT, 
          `Created project: ${name}`
        );
      } catch (xpError) {
        console.warn('Failed to award XP:', xpError);
      }
    }

    // Show success notification
    if (window.showSynapseNotification) {
      window.showSynapseNotification(`Project "${name}" created successfully! 🎉`, 'success');
    } else {
      alert(`Project "${name}" created successfully!`);
    }

    // Close modal
    closeEnhancedProjectModal();

    // Refresh projects list if available
    if (window.loadProjects) {
      await window.loadProjects();
    }

    // Refresh synapse view
    if (window.refreshSynapseConnections) {
      await window.refreshSynapseConnections();
    }

  } catch (error) {
    console.error('❌ Failed to create project:', error);
    
    if (window.showSynapseNotification) {
      window.showSynapseNotification(error.message || 'Failed to create project', 'error');
    } else {
      alert(error.message || 'Failed to create project. Please try again.');
    }
    
    // Restore button
    submitBtn.innerHTML = originalHTML;
    submitBtn.disabled = false;
  }
};

// Close enhanced project modal
window.closeEnhancedProjectModal = function() {
  const modal = document.getElementById('enhanced-project-modal');
  if (modal) {
    modal.remove();
  }
  console.log('🗑️ Enhanced project modal closed');
};

// Initialize on DOM ready (handle case where DOMContentLoaded already fired)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initEnhancedProjectCreation);
} else {
  initEnhancedProjectCreation();
}

console.log('✅ Enhanced project creation ready');