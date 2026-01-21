// ================================================================
// PROJECT CREATION INTEGRATION
// ================================================================
// Integration layer between enhanced project creation and existing systems

console.log("%c🔗 Project Creation Integration Loading...", "color:#0ff; font-weight: bold; font-size: 16px");

// Global integration functions
window.createProjectFromSynapse = async function(themeId = null, themeName = null) {
  console.log('🎯 Creating project from synapse view:', { themeId, themeName });
  
  // Always use enhanced creation if available
  if (typeof window.showEnhancedProjectCreation === 'function') {
    await window.showEnhancedProjectCreation(themeId, themeName);
  } else if (typeof window.createProjectInTheme === 'function' && themeId) {
    await window.createProjectInTheme(themeId, themeName);
  } else if (typeof window.showCreateProjectForm === 'function') {
    await window.openProjectsModal();
    await window.showCreateProjectForm();
  } else {
    console.error('❌ No project creation method available');
    alert('Project creation is not available at the moment.');
  }
};

// Enhanced project creation with better error handling
window.createProjectWithFallback = async function(options = {}) {
  const { themeId, themeName, template, prefilledData } = options;
  
  try {
    if (typeof window.showEnhancedProjectCreation === 'function') {
      console.log('✅ Using enhanced project creation');
      await window.showEnhancedProjectCreation(themeId, themeName);
      
      // If we have prefilled data, populate it
      if (prefilledData) {
        setTimeout(() => {
          populateProjectForm(prefilledData);
        }, 500);
      }
    } else {
      console.log('⚠️ Falling back to basic project creation');
      await fallbackProjectCreation({ themeId, themeName, prefilledData });
    }
  } catch (error) {
    console.error('❌ Project creation failed:', error);
    
    if (window.showSynapseNotification) {
      window.showSynapseNotification('Failed to open project creation', 'error');
    } else {
      alert('Failed to open project creation. Please try again.');
    }
  }
};

// Fallback to basic project creation
async function fallbackProjectCreation({ themeId, themeName, prefilledData }) {
  if (typeof window.openProjectsModal === 'function') {
    await window.openProjectsModal();
    
    if (typeof window.showCreateProjectForm === 'function') {
      await window.showCreateProjectForm();
      
      // Pre-select theme if provided
      if (themeId) {
        setTimeout(() => {
          const themeSelect = document.getElementById('project-theme');
          if (themeSelect) {
            for (let option of themeSelect.options) {
              if (option.value === themeId) {
                option.selected = true;
                break;
              }
            }
          }
        }, 100);
      }
      
      // Populate form if data provided
      if (prefilledData) {
        setTimeout(() => {
          populateBasicProjectForm(prefilledData);
        }, 200);
      }
    }
  } else {
    throw new Error('No project creation methods available');
  }
}

// Populate enhanced project form
function populateProjectForm(data) {
  if (data.name) {
    const nameField = document.getElementById('enhanced-project-name');
    if (nameField) nameField.value = data.name;
  }
  
  if (data.description) {
    const descField = document.getElementById('enhanced-project-description');
    if (descField) descField.value = data.description;
  }
  
  if (data.skills && Array.isArray(data.skills)) {
    data.skills.forEach(skill => {
      if (typeof window.addSkillToProject === 'function') {
        window.addSkillToProject(skill);
      }
    });
  }
}

// Populate basic project form
function populateBasicProjectForm(data) {
  if (data.name) {
    const nameField = document.getElementById('project-name');
    if (nameField) nameField.value = data.name;
  }
  
  if (data.description) {
    const descField = document.getElementById('project-description');
    if (descField) descField.value = data.description;
  }
  
  if (data.skills && Array.isArray(data.skills)) {
    const skillsField = document.getElementById('project-skills');
    if (skillsField) skillsField.value = data.skills.join(', ');
  }
}

// Quick project creation shortcuts
window.createWebAppProject = function() {
  window.createProjectWithFallback({
    template: 'web-app',
    prefilledData: {
      name: 'New Web Application',
      description: 'A modern web application with user authentication, responsive design, and real-time features.',
      skills: ['JavaScript', 'React', 'Node.js', 'CSS', 'HTML']
    }
  });
};

window.createAIProject = function() {
  window.createProjectWithFallback({
    template: 'ai-ml',
    prefilledData: {
      name: 'AI/ML Project',
      description: 'An AI-powered solution using machine learning algorithms to solve real-world problems.',
      skills: ['Python', 'TensorFlow', 'PyTorch', 'Data Science', 'Machine Learning']
    }
  });
};

window.createMobileAppProject = function() {
  window.createProjectWithFallback({
    template: 'mobile-app',
    prefilledData: {
      name: 'Mobile Application',
      description: 'A cross-platform mobile application with intuitive user interface and native performance.',
      skills: ['React Native', 'Flutter', 'UI/UX Design']
    }
  });
};

// Integration with theme system
window.createProjectInThemeEnhanced = async function(themeId, themeName) {
  console.log('🎯 Enhanced theme project creation:', { themeId, themeName });
  
  // Close any open panels
  if (typeof window.closeNodePanel === 'function') {
    window.closeNodePanel();
  }
  
  // Use enhanced creation
  await window.createProjectWithFallback({
    themeId,
    themeName
  });
};

// Listen for project creation events
document.addEventListener('project-created', (event) => {
  console.log('🎉 Project created event received:', event.detail);
  
  // Refresh relevant views
  if (window.refreshSynapseConnections) {
    window.refreshSynapseConnections();
  }
  
  if (window.loadProjects) {
    window.loadProjects();
  }
  
  // Show success notification
  if (window.showSynapseNotification) {
    window.showSynapseNotification(
      `Project "${event.detail.name}" created successfully! 🎉`,
      'success'
    );
  }
});

// Expose integration functions globally
window.projectCreationIntegration = {
  createFromSynapse: window.createProjectFromSynapse,
  createWithFallback: window.createProjectWithFallback,
  createWebApp: window.createWebAppProject,
  createAI: window.createAIProject,
  createMobileApp: window.createMobileAppProject,
  createInTheme: window.createProjectInThemeEnhanced
};

console.log('✅ Project creation integration ready');