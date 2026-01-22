// ================================================================
// SIMPLE SYNAPSE VISUALIZATION
// ================================================================
// Enhanced synapse system with both cards and network views

console.log('🧠 Simple Synapse Loading...');

let synapseData = null;
let svg = null;
let simulation = null;
let currentView = 'cards'; // 'cards' or 'network'

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
    console.log('Current profile:', profile);
    
    if (!profile) {
      console.warn('No profile available, showing empty state');
      showEmptyState();
      return;
    }

    console.log('Loading synapse data...');

    // Load comprehensive data for network view
    const [themesResult, projectsResult, peopleResult, connectionsResult, participantsResult] = await Promise.all([
      window.supabase.from('theme_circles').select('*').eq('status', 'active'),
      window.supabase.from('projects').select('*').eq('status', 'open'),
      window.supabase.from('community').select('id, name, skills, image_url, bio').limit(50),
      window.supabase.from('connections').select('*').eq('status', 'accepted'),
      window.supabase.from('theme_participants').select('*')
    ]);

    console.log('Database results:', {
      themes: themesResult.data?.length || 0,
      projects: projectsResult.data?.length || 0,
      people: peopleResult.data?.length || 0,
      connections: connectionsResult.data?.length || 0,
      participants: participantsResult.data?.length || 0
    });

    synapseData = {
      themes: themesResult.data || [],
      projects: projectsResult.data || [],
      people: peopleResult.data || [],
      connections: connectionsResult.data || [],
      participants: participantsResult.data || [],
      currentUser: profile
    };

    renderCurrentView();

  } catch (error) {
    console.error('Error loading synapse data:', error);
    showError('Failed to load network data');
  }
}

// Render current view
function renderCurrentView() {
  if (currentView === 'cards') {
    renderThemeCards();
  } else {
    renderNetworkView();
  }
}

// Add view toggle to dashboard
function addViewToggle() {
  const container = document.getElementById('synapse-container');
  const toggleHtml = `
    <div style="position: absolute; top: 20px; right: 20px; z-index: 100;">
      <div style="background: rgba(0,0,0,0.8); border: 1px solid #333; border-radius: 6px; padding: 4px; display: flex; gap: 2px;">
        <button id="cards-view-btn" onclick="switchToCardsView()" style="
          padding: 8px 12px; 
          background: ${currentView === 'cards' ? '#00e0ff' : 'transparent'}; 
          color: ${currentView === 'cards' ? 'black' : '#ccc'}; 
          border: none; 
          border-radius: 4px; 
          cursor: pointer;
          font-size: 0.9rem;
        ">
          <i class="fas fa-th-large"></i> Cards
        </button>
        <button id="network-view-btn" onclick="switchToNetworkView()" style="
          padding: 8px 12px; 
          background: ${currentView === 'network' ? '#00e0ff' : 'transparent'}; 
          color: ${currentView === 'network' ? 'black' : '#ccc'}; 
          border: none; 
          border-radius: 4px; 
          cursor: pointer;
          font-size: 0.9rem;
        ">
          <i class="fas fa-project-diagram"></i> Network
        </button>
      </div>
    </div>
  `;
  
  // Add toggle if not already present
  if (!container.querySelector('#cards-view-btn')) {
    container.insertAdjacentHTML('afterbegin', toggleHtml);
  }
}

// Switch to cards view
function switchToCardsView() {
  currentView = 'cards';
  renderCurrentView();
}

// Switch to network view
function switchToNetworkView() {
  currentView = 'network';
  renderCurrentView();
}

// Render theme cards (enhanced version)
function renderThemeCards() {
  const container = document.getElementById('synapse-container');
  container.innerHTML = '';
  
  addViewToggle();

  if (!synapseData) {
    showEmptyState();
    return;
  }

  if (synapseData.themes.length === 0) {
    container.innerHTML += `
      <div style="padding: 20px; padding-top: 60px;">
        <div style="display: flex; align-items: center; justify-content: center; height: 400px; color: #666;">
          <div style="text-align: center; max-width: 500px;">
            <i class="fas fa-lightbulb" style="font-size: 4rem; margin-bottom: 30px; color: #00e0ff;"></i><br>
            <h2 style="color: #00e0ff; margin-bottom: 20px;">Welcome to the Innovation Engine!</h2>
            <p style="font-size: 1.1rem; line-height: 1.6; margin-bottom: 30px;">
              This is where innovation themes will appear. Themes are collaborative spaces where community members work together on exciting projects and ideas.
            </p>
            <div style="background: rgba(0,224,255,0.1); border: 1px solid rgba(0,224,255,0.3); border-radius: 8px; padding: 20px; margin-bottom: 30px; text-align: left;">
              <h4 style="color: #00e0ff; margin-bottom: 15px;">What you can do here:</h4>
              <div style="margin-bottom: 10px;"><i class="fas fa-check" style="color: #4caf50; margin-right: 10px;"></i> Explore innovation themes</div>
              <div style="margin-bottom: 10px;"><i class="fas fa-check" style="color: #4caf50; margin-right: 10px;"></i> Join collaborative projects</div>
              <div style="margin-bottom: 10px;"><i class="fas fa-check" style="color: #4caf50; margin-right: 10px;"></i> Connect with like-minded innovators</div>
              <div><i class="fas fa-check" style="color: #4caf50; margin-right: 10px;"></i> Switch between Cards and Network views</div>
            </div>
            <p style="color: #999; margin-bottom: 20px;">
              Themes will be added by community administrators. Check back soon!
            </p>
            <button onclick="switchToNetworkView()" style="
              background: #00e0ff;
              border: none;
              color: black;
              padding: 12px 24px;
              border-radius: 6px;
              cursor: pointer;
              font-weight: bold;
              margin-right: 10px;
            ">
              <i class="fas fa-project-diagram"></i> Try Network View
            </button>
            <button onclick="loadSynapseData()" style="
              background: rgba(0,224,255,0.2);
              border: 1px solid rgba(0,224,255,0.5);
              color: #00e0ff;
              padding: 12px 24px;
              border-radius: 6px;
              cursor: pointer;
            ">
              <i class="fas fa-redo"></i> Refresh
            </button>
          </div>
        </div>
      </div>
    `;
    return;
  }

  // Create theme cards grid
  const cardsHtml = synapseData.themes.map(theme => {
    const participantCount = synapseData.participants.filter(p => p.theme_id === theme.id).length;
    const relatedProjects = synapseData.projects.filter(p => p.theme_id === theme.id);
    
    return `
      <div class="theme-card" onclick="selectTheme('${theme.id}')" style="
        background: linear-gradient(135deg, rgba(0,224,255,0.1) 0%, rgba(0,0,0,0.8) 100%);
        border: 1px solid rgba(0,224,255,0.3);
        border-radius: 8px;
        padding: 20px;
        margin: 10px;
        cursor: pointer;
        transition: all 0.3s ease;
        min-height: 180px;
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
            ${theme.description ? theme.description.substring(0, 120) + '...' : 'No description available'}
          </p>
        </div>
        
        <div style="margin-top: 15px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <div style="color: #999; font-size: 0.8rem;">
              <i class="fas fa-users"></i> ${participantCount} participants
            </div>
            <div style="color: #999; font-size: 0.8rem;">
              <i class="fas fa-project-diagram"></i> ${relatedProjects.length} projects
            </div>
          </div>
          <div style="color: #00e0ff; font-size: 0.8rem; text-align: center;">
            <i class="fas fa-arrow-right"></i> Explore Theme
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML += `
    <div style="padding: 20px; padding-top: 60px;">
      <h2 style="color: #00e0ff; margin-bottom: 20px; text-align: center;">
        <i class="fas fa-network-wired"></i> Active Innovation Themes
      </h2>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 15px;">
        ${cardsHtml}
      </div>
    </div>
  `;
}

// Render network view
function renderNetworkView() {
  const container = document.getElementById('synapse-container');
  container.innerHTML = '';
  
  addViewToggle();

  if (!synapseData) {
    showEmptyState();
    return;
  }

  // Check if we have any data to visualize
  const hasData = synapseData.themes.length > 0 || synapseData.projects.length > 0 || synapseData.people.length > 0;
  
  if (!hasData) {
    container.innerHTML += `
      <div style="padding: 20px; padding-top: 60px;">
        <div style="display: flex; align-items: center; justify-content: center; height: 400px; color: #666;">
          <div style="text-align: center; max-width: 500px;">
            <i class="fas fa-project-diagram" style="font-size: 4rem; margin-bottom: 30px; color: #00e0ff;"></i><br>
            <h2 style="color: #00e0ff; margin-bottom: 20px;">Network Visualization</h2>
            <p style="font-size: 1.1rem; line-height: 1.6; margin-bottom: 30px;">
              The network view shows connections between themes, projects, and people in the innovation community. When data is available, you'll see an interactive network with:
            </p>
            <div style="background: rgba(0,224,255,0.1); border: 1px solid rgba(0,224,255,0.3); border-radius: 8px; padding: 20px; margin-bottom: 30px; text-align: left;">
              <div style="margin-bottom: 10px;"><i class="fas fa-lightbulb" style="color: #00e0ff; margin-right: 10px;"></i> <strong>Blue nodes:</strong> Innovation themes</div>
              <div style="margin-bottom: 10px;"><i class="fas fa-project-diagram" style="color: #ff6b35; margin-right: 10px;"></i> <strong>Orange nodes:</strong> Active projects</div>
              <div style="margin-bottom: 10px;"><i class="fas fa-user" style="color: #4caf50; margin-right: 10px;"></i> <strong>Green nodes:</strong> Community members</div>
              <div><i class="fas fa-arrows-alt" style="color: #999; margin-right: 10px;"></i> <strong>Interactive:</strong> Drag nodes and click for details</div>
            </div>
            <p style="color: #999; margin-bottom: 20px;">
              Data will appear here as the community grows and themes are added.
            </p>
            <button onclick="switchToCardsView()" style="
              background: #00e0ff;
              border: none;
              color: black;
              padding: 12px 24px;
              border-radius: 6px;
              cursor: pointer;
              font-weight: bold;
              margin-right: 10px;
            ">
              <i class="fas fa-th-large"></i> Try Cards View
            </button>
            <button onclick="loadSynapseData()" style="
              background: rgba(0,224,255,0.2);
              border: 1px solid rgba(0,224,255,0.5);
              color: #00e0ff;
              padding: 12px 24px;
              border-radius: 6px;
              cursor: pointer;
            ">
              <i class="fas fa-redo"></i> Refresh
            </button>
          </div>
        </div>
      </div>
    `;
    return;
  }

  // Create network visualization
  const width = container.clientWidth;
  const height = container.clientHeight;

  svg = d3.select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .style('background', 'radial-gradient(circle at center, rgba(0,224,255,0.05) 0%, rgba(0,0,0,0.9) 100%)');

  // Create network data
  const networkData = createNetworkData();
  
  // Create force simulation
  simulation = d3.forceSimulation(networkData.nodes)
    .force('link', d3.forceLink(networkData.links).id(d => d.id).distance(100))
    .force('charge', d3.forceManyBody().strength(-300))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(30));

  // Create links
  const linkGroup = svg.append('g').attr('class', 'links');
  const links = linkGroup.selectAll('line')
    .data(networkData.links)
    .enter().append('line')
    .attr('stroke', '#333')
    .attr('stroke-width', 2)
    .attr('opacity', 0.6);

  // Create nodes
  const nodeGroup = svg.append('g').attr('class', 'nodes');
  const nodes = nodeGroup.selectAll('g')
    .data(networkData.nodes)
    .enter().append('g')
    .attr('class', 'node')
    .call(d3.drag()
      .on('start', dragstarted)
      .on('drag', dragged)
      .on('end', dragended));

  // Add circles for nodes
  nodes.append('circle')
    .attr('r', d => d.type === 'theme' ? 25 : d.type === 'project' ? 20 : 15)
    .attr('fill', d => {
      if (d.type === 'theme') return '#00e0ff';
      if (d.type === 'project') return '#ff6b35';
      return '#4caf50';
    })
    .attr('stroke', '#fff')
    .attr('stroke-width', 2)
    .style('cursor', 'pointer');

  // Add labels
  nodes.append('text')
    .text(d => d.name.length > 15 ? d.name.substring(0, 15) + '...' : d.name)
    .attr('text-anchor', 'middle')
    .attr('dy', '.35em')
    .attr('font-size', '10px')
    .attr('fill', 'white')
    .style('pointer-events', 'none');

  // Add click handlers
  nodes.on('click', function(event, d) {
    showNodeDetails(d);
  });

  // Update positions on simulation tick
  simulation.on('tick', () => {
    links
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y);

    nodes
      .attr('transform', d => `translate(${d.x},${d.y})`);
  });

  // Add legend
  addNetworkLegend();
}

// Create network data from synapse data
function createNetworkData() {
  const nodes = [];
  const links = [];

  // Add theme nodes
  synapseData.themes.forEach(theme => {
    nodes.push({
      id: `theme-${theme.id}`,
      name: theme.title,
      type: 'theme',
      data: theme
    });
  });

  // Add project nodes
  synapseData.projects.forEach(project => {
    nodes.push({
      id: `project-${project.id}`,
      name: project.title,
      type: 'project',
      data: project
    });

    // Link projects to themes
    if (project.theme_id) {
      links.push({
        source: `theme-${project.theme_id}`,
        target: `project-${project.id}`,
        type: 'theme-project'
      });
    }
  });

  // Add people nodes (limited to connected users)
  const connectedPeople = new Set();
  synapseData.connections.forEach(conn => {
    connectedPeople.add(conn.from_user_id);
    connectedPeople.add(conn.to_user_id);
  });

  synapseData.people.forEach(person => {
    if (connectedPeople.has(person.id) || person.id === synapseData.currentUser.id) {
      nodes.push({
        id: `person-${person.id}`,
        name: person.name,
        type: 'person',
        data: person
      });
    }
  });

  // Add connection links
  synapseData.connections.forEach(conn => {
    const sourceExists = nodes.find(n => n.id === `person-${conn.from_user_id}`);
    const targetExists = nodes.find(n => n.id === `person-${conn.to_user_id}`);
    
    if (sourceExists && targetExists) {
      links.push({
        source: `person-${conn.from_user_id}`,
        target: `person-${conn.to_user_id}`,
        type: 'connection'
      });
    }
  });

  // Add theme participation links
  synapseData.participants.forEach(participant => {
    const personExists = nodes.find(n => n.id === `person-${participant.community_id}`);
    const themeExists = nodes.find(n => n.id === `theme-${participant.theme_id}`);
    
    if (personExists && themeExists) {
      links.push({
        source: `person-${participant.community_id}`,
        target: `theme-${participant.theme_id}`,
        type: 'participation'
      });
    }
  });

  return { nodes, links };
}

// Add network legend
function addNetworkLegend() {
  const legend = svg.append('g')
    .attr('class', 'legend')
    .attr('transform', 'translate(20, 20)');

  const legendData = [
    { color: '#00e0ff', label: 'Themes', size: 25 },
    { color: '#ff6b35', label: 'Projects', size: 20 },
    { color: '#4caf50', label: 'People', size: 15 }
  ];

  const legendItems = legend.selectAll('.legend-item')
    .data(legendData)
    .enter().append('g')
    .attr('class', 'legend-item')
    .attr('transform', (d, i) => `translate(0, ${i * 30})`);

  legendItems.append('circle')
    .attr('r', d => d.size)
    .attr('fill', d => d.color)
    .attr('stroke', '#fff')
    .attr('stroke-width', 2);

  legendItems.append('text')
    .attr('x', 35)
    .attr('y', 5)
    .text(d => d.label)
    .attr('font-size', '12px')
    .attr('fill', 'white');
}

// Drag functions
function dragstarted(event, d) {
  if (!event.active) simulation.alphaTarget(0.3).restart();
  d.fx = d.x;
  d.fy = d.y;
}

function dragged(event, d) {
  d.fx = event.x;
  d.fy = event.y;
}

function dragended(event, d) {
  if (!event.active) simulation.alphaTarget(0);
  d.fx = null;
  d.fy = null;
}

// Show node details
function showNodeDetails(node) {
  const container = document.getElementById('synapse-container');
  
  let detailsHtml = '';
  
  if (node.type === 'theme') {
    const participantCount = synapseData.participants.filter(p => p.theme_id === node.data.id).length;
    const relatedProjects = synapseData.projects.filter(p => p.theme_id === node.data.id);
    
    detailsHtml = `
      <div style="position: absolute; top: 80px; left: 20px; right: 20px; background: rgba(0,0,0,0.95); border: 1px solid #00e0ff; border-radius: 8px; padding: 20px; z-index: 200;">
        <button onclick="closeNodeDetails()" style="position: absolute; top: 10px; right: 10px; background: none; border: none; color: #ccc; font-size: 1.2rem; cursor: pointer;">
          <i class="fas fa-times"></i>
        </button>
        
        <h2 style="color: #00e0ff; margin-bottom: 15px;">
          <i class="fas fa-lightbulb"></i> ${node.data.title}
        </h2>
        
        <p style="color: #ccc; margin-bottom: 20px; line-height: 1.6;">
          ${node.data.description || 'No description available'}
        </p>
        
        <div style="display: flex; gap: 30px; margin-bottom: 20px;">
          <div style="text-align: center;">
            <div style="color: #00e0ff; font-size: 1.5rem; font-weight: bold;">${participantCount}</div>
            <div style="color: #999; font-size: 0.9rem;">Participants</div>
          </div>
          <div style="text-align: center;">
            <div style="color: #00e0ff; font-size: 1.5rem; font-weight: bold;">${relatedProjects.length}</div>
            <div style="color: #999; font-size: 0.9rem;">Projects</div>
          </div>
        </div>
        
        <button onclick="joinThemeAction('${node.data.id}')" style="
          background: #00e0ff; border: none; color: black; padding: 10px 20px; 
          border-radius: 4px; cursor: pointer; font-weight: bold;
        ">
          <i class="fas fa-plus"></i> Join Theme
        </button>
      </div>
    `;
  } else if (node.type === 'project') {
    detailsHtml = `
      <div style="position: absolute; top: 80px; left: 20px; right: 20px; background: rgba(0,0,0,0.95); border: 1px solid #ff6b35; border-radius: 8px; padding: 20px; z-index: 200;">
        <button onclick="closeNodeDetails()" style="position: absolute; top: 10px; right: 10px; background: none; border: none; color: #ccc; font-size: 1.2rem; cursor: pointer;">
          <i class="fas fa-times"></i>
        </button>
        
        <h2 style="color: #ff6b35; margin-bottom: 15px;">
          <i class="fas fa-project-diagram"></i> ${node.data.title}
        </h2>
        
        <p style="color: #ccc; margin-bottom: 20px; line-height: 1.6;">
          ${node.data.description || 'No description available'}
        </p>
        
        <div style="margin-bottom: 20px;">
          <div style="color: #999; font-size: 0.9rem;">Status: <span style="color: #4caf50;">${node.data.status}</span></div>
        </div>
        
        <button onclick="viewProject('${node.data.id}')" style="
          background: #ff6b35; border: none; color: white; padding: 10px 20px; 
          border-radius: 4px; cursor: pointer; font-weight: bold;
        ">
          <i class="fas fa-eye"></i> View Project
        </button>
      </div>
    `;
  } else if (node.type === 'person') {
    detailsHtml = `
      <div style="position: absolute; top: 80px; left: 20px; right: 20px; background: rgba(0,0,0,0.95); border: 1px solid #4caf50; border-radius: 8px; padding: 20px; z-index: 200;">
        <button onclick="closeNodeDetails()" style="position: absolute; top: 10px; right: 10px; background: none; border: none; color: #ccc; font-size: 1.2rem; cursor: pointer;">
          <i class="fas fa-times"></i>
        </button>
        
        <h2 style="color: #4caf50; margin-bottom: 15px;">
          <i class="fas fa-user"></i> ${node.data.name}
        </h2>
        
        <p style="color: #ccc; margin-bottom: 15px; line-height: 1.6;">
          ${node.data.bio || 'No bio available'}
        </p>
        
        <div style="margin-bottom: 20px;">
          <div style="color: #999; font-size: 0.9rem; margin-bottom: 5px;">Skills:</div>
          <div style="color: #ccc; font-size: 0.9rem;">${node.data.skills || 'No skills listed'}</div>
        </div>
        
        <button onclick="sendDirectMessage('${node.data.id}', '')" style="
          background: #4caf50; border: none; color: white; padding: 10px 20px; 
          border-radius: 4px; cursor: pointer; font-weight: bold;
        ">
          <i class="fas fa-message"></i> Send Message
        </button>
      </div>
    `;
  }
  
  container.insertAdjacentHTML('beforeend', detailsHtml);
}

// Close node details
function closeNodeDetails() {
  const details = document.querySelector('[style*="position: absolute"][style*="z-index: 200"]');
  if (details) {
    details.remove();
  }
}

// View project
function viewProject(projectId) {
  console.log('Viewing project:', projectId);
  closeNodeDetails();
  alert('Project viewing functionality coming soon!');
}

// Select theme (from cards view)
function selectTheme(themeId) {
  console.log('Selected theme:', themeId);
  
  const theme = synapseData.themes.find(t => t.id === themeId);
  if (!theme) return;

  // Show theme details
  const container = document.getElementById('synapse-container');
  container.innerHTML = `
    <div style="padding: 20px;">
      <div style="margin-bottom: 20px;">
        <button onclick="renderCurrentView()" style="
          background: rgba(0,224,255,0.2);
          border: 1px solid rgba(0,224,255,0.5);
          color: #00e0ff;
          padding: 8px 15px;
          border-radius: 4px;
          cursor: pointer;
        ">
          <i class="fas fa-arrow-left"></i> Back to ${currentView === 'cards' ? 'Cards' : 'Network'}
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

// Show empty state when no profile is available
function showEmptyState() {
  const container = document.getElementById('synapse-container');
  container.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #666;">
      <div style="text-align: center; max-width: 500px; padding: 40px;">
        <i class="fas fa-user-clock" style="font-size: 4rem; margin-bottom: 30px; color: #00e0ff;"></i><br>
        <h2 style="color: #00e0ff; margin-bottom: 20px;">Setting Up Your Profile</h2>
        <p style="font-size: 1.1rem; line-height: 1.6; margin-bottom: 30px;">
          We're preparing your innovation dashboard. This usually takes just a moment while we set up your profile and load the community data.
        </p>
        <div style="margin-bottom: 30px;">
          <div style="display: inline-block; width: 40px; height: 4px; background: rgba(0,224,255,0.3); border-radius: 2px; margin: 0 2px; position: relative; overflow: hidden;">
            <div style="position: absolute; top: 0; left: -100%; width: 100%; height: 100%; background: #00e0ff; animation: loading 2s infinite;"></div>
          </div>
          <div style="display: inline-block; width: 40px; height: 4px; background: rgba(0,224,255,0.3); border-radius: 2px; margin: 0 2px; position: relative; overflow: hidden;">
            <div style="position: absolute; top: 0; left: -100%; width: 100%; height: 100%; background: #00e0ff; animation: loading 2s infinite 0.3s;"></div>
          </div>
          <div style="display: inline-block; width: 40px; height: 4px; background: rgba(0,224,255,0.3); border-radius: 2px; margin: 0 2px; position: relative; overflow: hidden;">
            <div style="position: absolute; top: 0; left: -100%; width: 100%; height: 100%; background: #00e0ff; animation: loading 2s infinite 0.6s;"></div>
          </div>
        </div>
        <button onclick="loadSynapseData()" style="
          background: rgba(0,224,255,0.2);
          border: 1px solid rgba(0,224,255,0.5);
          color: #00e0ff;
          padding: 12px 24px;
          border-radius: 6px;
          cursor: pointer;
          font-weight: bold;
        ">
          <i class="fas fa-redo"></i> Refresh
        </button>
      </div>
    </div>
    <style>
      @keyframes loading {
        0% { left: -100%; }
        100% { left: 100%; }
      }
    </style>
  `;
  
  // Try to reload after a delay
  setTimeout(() => {
    const profile = window.getCurrentProfile();
    if (profile) {
      loadSynapseData();
    }
  }, 3000);
}

// Expose globally
window.initSimpleSynapse = initSimpleSynapse;
window.selectTheme = selectTheme;
window.joinThemeAction = joinThemeAction;
window.renderCurrentView = renderCurrentView;
window.switchToCardsView = switchToCardsView;
window.switchToNetworkView = switchToNetworkView;
window.closeNodeDetails = closeNodeDetails;
window.viewProject = viewProject;
window.loadSynapseData = loadSynapseData;
window.showEmptyState = showEmptyState;

console.log('✅ Simple Synapse Loaded');