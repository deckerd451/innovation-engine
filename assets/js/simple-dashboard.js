// ================================================================
// SIMPLE DASHBOARD CONTROLLER
// ================================================================
// Main controller for simplified dashboard

console.log('📊 Simple Dashboard Loading...');

// Initialize dashboard
function initSimpleDashboard() {
  // Initialize all systems
  if (typeof initSimpleAuth === 'function') {
    initSimpleAuth();
  }
  
  if (typeof initSimpleMessaging === 'function') {
    initSimpleMessaging();
  }
  
  if (typeof initSimpleSynapse === 'function') {
    initSimpleSynapse();
  }
  
  console.log('✅ Simple Dashboard Ready');
}

// Navigation functions
window.showThemes = function() {
  console.log('Showing themes...');
  if (typeof window.renderSynapse === 'function') {
    window.renderSynapse();
  }
};

window.showProjects = function() {
  console.log('Showing projects...');
  showComingSoon('Projects View');
};

window.showPeople = function() {
  console.log('Showing people...');
  showComingSoon('People Directory');
};

window.showProfile = function() {
  console.log('Showing profile...');
  showComingSoon('Profile Editor');
};

window.showConnections = function() {
  console.log('Showing connections...');
  showComingSoon('Connections Manager');
};

window.createProject = function() {
  console.log('Creating project...');
  showComingSoon('Project Creator');
};

window.joinTheme = function() {
  console.log('Joining theme...');
  showComingSoon('Theme Browser');
};

// Show coming soon message
function showComingSoon(feature) {
  const container = document.getElementById('synapse-container');
  container.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #666;">
      <div style="text-align: center;">
        <i class="fas fa-tools" style="font-size: 3rem; margin-bottom: 20px;"></i><br>
        <h3>${feature}</h3>
        <p>This feature is coming soon in the simplified dashboard!</p>
        <button onclick="window.showThemes()" style="
          background: rgba(0,224,255,0.2);
          border: 1px solid rgba(0,224,255,0.5);
          color: #00e0ff;
          padding: 10px 20px;
          border-radius: 4px;
          cursor: pointer;
          margin-top: 15px;
        ">
          <i class="fas fa-arrow-left"></i> Back to Themes
        </button>
      </div>
    </div>
  `;
}

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  // Small delay to ensure other scripts are loaded
  setTimeout(initSimpleDashboard, 100);
});

console.log('✅ Simple Dashboard Loaded');