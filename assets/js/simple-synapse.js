// ================================================================
// SIMPLE SYNAPSE VISUALIZATION
// ================================================================
// Minimal synapse system for simplified dashboard

console.log('🧠 Simple Synapse Loading...');

let synapseData = null;
let svg = null;

// Initialize synapse
function initSimpleSynapse() {
  const container = document.getElementById('synapse-container');
  if (!container) {
    console.warn('Synapse container not found');
    return;
  }

  // Wait for profile to be loaded
  window.addEventListener('profile-loaded', () => {
    loadSynapseData();
  });

  console.log('✅ Simple Synapse Ready');
}

// Load synapse data
async function loadSynapseData() {
  try {
    const profile = window.getCurrentProfile();
    if (!profile) return;

    console.log('Loading synapse data...');

    // Load basic data
    const [themesResult, projectsResult, peopleResult] = await Promise.all([
      window.supabase.from('theme_circles').select('*').eq('status', 'active'),
      window.supabase.from('projects').select('*').eq('status', 'open'),
      window.supabase.from('community').select('id, name, skills, image_url').limit(20)
    ]);

    synapseData = {
      themes: themesResult.data || [],
      projects: projectsResult.data || [],
      people: peopleResult.data || []
    };

    renderSynapse();

  } catch (error) {
    console.error('Error loading synapse data:', error);
    showError('Failed to load network data');
  }
}

// Render synapse visualization
function renderSynapse() {
  const container = document.getElementById('synapse-container');
  container.innerHTML = '';

  const width = container.clientWidth;
  const height = container.clientHeight;

  // Create SVG
  svg = d3.select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height);

  // Create simple grid layout
  renderThemeCards();
}

// Render theme cards
function renderThemeCards() {
  const container = document.getElementById('synapse-container');
  
  if (!synapseData || synapseData.themes.length === 0) {
    container.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #666;">
        <div style="text-align: center;">
          <i class="fas fa-lightbulb" style="font-size: 3rem; margin-bottom: 20px;"></i><br>
          <h3>No Active Themes</h3>
          <p>Themes will appear here when available</p>
        </div>
      </div>
    `;
    return;
  }

  // Create theme cards grid
  const cardsHtml = synapseData.themes.map(theme => `
    <div class="theme-card" onclick="selectTheme('${theme.id}')" style="
      background: linear-gradient(135deg, rgba(0,224,255,0.1) 0%, rgba(0,0,0,0.8) 100%);
      border: 1px solid rgba(0,224,255,0.3);
      border-radius: 8px;
      padding: 20px;
      margin: 10px;
      cursor: pointer;
      transition: all 0.3s ease;
      min-height: 150px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    " onmouseover="this.style.transform='translateY(-5px)'; this.style.boxShadow='0 10px 20px rgba(0,224,255,0.2)'" 
       onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none'">
      
      <div>
        <h3 style="color: #00e0ff; margin: 0 0 10px 0; font-size: 1.1rem;">
          <i class="fas fa-lightbulb"></i> ${theme.title}
        </h3>
        <p style="color: #ccc; margin: 0; font-size: 0.9rem; line-height: 1.4;">
          ${theme.description ? theme.description.substring(0, 100) + '...' : 'No description available'}
        </p>
      </div>
      
      <div style="margin-top: 15px; display: flex; justify-content: space-between; align-items: center;">
        <div style="color: #999; font-size: 0.8rem;">
          <i class="fas fa-users"></i> ${theme.participant_count || 0} participants
        </div>
        <div style="color: #00e0ff; font-size: 0.8rem;">
          <i class="fas fa-arrow-right"></i> Join
        </div>
      </div>
    </div>
  `).join('');

  container.innerHTML = `
    <div style="padding: 20px;">
      <h2 style="color: #00e0ff; margin-bottom: 20px; text-align: center;">
        <i class="fas fa-network-wired"></i> Active Innovation Themes
      </h2>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 15px;">
        ${cardsHtml}
      </div>
    </div>
  `;
}

// Select theme
function selectTheme(themeId) {
  console.log('Selected theme:', themeId);
  
  const theme = synapseData.themes.find(t => t.id === themeId);
  if (!theme) return;

  // Show theme details
  const container = document.getElementById('synapse-container');
  container.innerHTML = `
    <div style="padding: 20px;">
      <div style="margin-bottom: 20px;">
        <button onclick="renderSynapse()" style="
          background: rgba(0,224,255,0.2);
          border: 1px solid rgba(0,224,255,0.5);
          color: #00e0ff;
          padding: 8px 15px;
          border-radius: 4px;
          cursor: pointer;
        ">
          <i class="fas fa-arrow-left"></i> Back to Themes
        </button>
      </div>
      
      <div style="
        background: linear-gradient(135deg, rgba(0,224,255,0.1) 0%, rgba(0,0,0,0.8) 100%);
        border: 1px solid rgba(0,224,255,0.3);
        border-radius: 8px;
        padding: 30px;
        text-align: center;
      ">
        <h1 style="color: #00e0ff; margin-bottom: 20px;">
          <i class="fas fa-lightbulb"></i> ${theme.title}
        </h1>
        <p style="color: #ccc; font-size: 1.1rem; line-height: 1.6; margin-bottom: 30px;">
          ${theme.description || 'No description available'}
        </p>
        
        <div style="display: flex; justify-content: center; gap: 20px; margin-bottom: 30px;">
          <div style="text-align: center;">
            <div style="color: #00e0ff; font-size: 2rem; font-weight: bold;">${theme.participant_count || 0}</div>
            <div style="color: #999;">Participants</div>
          </div>
          <div style="text-align: center;">
            <div style="color: #00e0ff; font-size: 2rem; font-weight: bold;">${theme.project_count || 0}</div>
            <div style="color: #999;">Projects</div>
          </div>
        </div>
        
        <button onclick="joinThemeAction('${theme.id}')" style="
          background: #00e0ff;
          border: none;
          color: black;
          padding: 12px 30px;
          border-radius: 6px;
          font-size: 1.1rem;
          font-weight: bold;
          cursor: pointer;
          transition: all 0.2s ease;
        " onmouseover="this.style.background='#00b8cc'" onmouseout="this.style.background='#00e0ff'">
          <i class="fas fa-plus"></i> Join This Theme
        </button>
      </div>
    </div>
  `;
}

// Join theme action
async function joinThemeAction(themeId) {
  try {
    const profile = window.getCurrentProfile();
    if (!profile) {
      alert('Please wait for your profile to load');
      return;
    }

    console.log('Joining theme:', themeId);
    
    // This would actually join the theme
    // For now, just show success message
    alert('Theme joining functionality coming soon!');
    
  } catch (error) {
    console.error('Error joining theme:', error);
    alert('Failed to join theme');
  }
}

// Show error
function showError(message) {
  const container = document.getElementById('synapse-container');
  container.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #f44336;">
      <div style="text-align: center;">
        <i class="fas fa-exclamation-triangle" style="font-size: 3rem; margin-bottom: 20px;"></i><br>
        <h3>Error</h3>
        <p>${message}</p>
        <button onclick="loadSynapseData()" style="
          background: #f44336;
          border: none;
          color: white;
          padding: 10px 20px;
          border-radius: 4px;
          cursor: pointer;
          margin-top: 15px;
        ">
          <i class="fas fa-redo"></i> Retry
        </button>
      </div>
    </div>
  `;
}

// Expose globally
window.initSimpleSynapse = initSimpleSynapse;
window.selectTheme = selectTheme;
window.joinThemeAction = joinThemeAction;
window.renderSynapse = renderSynapse;

console.log('✅ Simple Synapse Loaded');