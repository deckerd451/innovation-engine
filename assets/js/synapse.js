// synapse.js - Interactive network visualization with connections
// Features: D3 force graph, click-to-view profiles, connection requests, live updates

import {
  initConnections,
  sendConnectionRequest,
  getConnectionStatus,
  getAllConnectionsForSynapse,
  canSeeEmail,
  getCurrentUserCommunityId,
  formatTimeAgo
} from './connections.js';

let supabase = null;
let svg = null;
let simulation = null;
let nodes = [];
let links = [];
let nodeElements = null;
let linkElements = null;
let currentUserCommunityId = null;
let connectionsData = [];
let zoomBehavior = null;
let container = null;

// Color scheme
const COLORS = {
  nodeDefault: '#00e0ff',
  nodeCurrentUser: '#ffd700',
  nodeSelected: '#ff6b6b',
  edgeAccepted: '#00ff88',
  edgePending: '#ffaa00',
  edgeSuggested: 'rgba(0, 224, 255, 0.15)',
  edgeDefault: 'rgba(0, 224, 255, 0.08)',
  background: 'rgba(0, 0, 0, 0.92)'
};

// Initialize the synapse visualization
export async function initSynapseView() {
  console.log('%c🧠 Initializing Synapse View...', 'color: #0ff; font-weight: bold');

  // Get supabase from window
  supabase = window.supabase;
  if (!supabase) {
    console.error('Supabase not available');
    return;
  }

  // Initialize connections module
  const userInfo = await initConnections(supabase);
  currentUserCommunityId = userInfo?.currentUserCommunityId;

  // Setup SVG
  setupSVG();

  // Load data
  await loadSynapseData();

  // Start simulation
  startSimulation();

  // Setup close button
  setupCloseButton();

  console.log('%c✓ Synapse View ready', 'color: #0f0');
}

// Setup SVG and zoom
function setupSVG() {
  const svgElement = document.getElementById('synapse-svg');
  if (!svgElement) return;

  // Clear existing
  svgElement.innerHTML = '';

  // Get dimensions
  const width = window.innerWidth;
  const height = window.innerHeight;

  // Create D3 selection
  svg = d3.select(svgElement)
    .attr('viewBox', [0, 0, width, height]);

  // Add zoom behavior
  zoomBehavior = d3.zoom()
    .scaleExtent([0.2, 4])
    .on('zoom', (event) => {
      container.attr('transform', event.transform);
    });

  svg.call(zoomBehavior);

  // Create container for zoom/pan
  container = svg.append('g').attr('class', 'synapse-container');

  // Add gradient definitions
  const defs = svg.append('defs');
  
  // Glow filter
  const filter = defs.append('filter')
    .attr('id', 'glow')
    .attr('x', '-50%')
    .attr('y', '-50%')
    .attr('width', '200%')
    .attr('height', '200%');
  
  filter.append('feGaussianBlur')
    .attr('stdDeviation', '3')
    .attr('result', 'coloredBlur');
  
  const feMerge = filter.append('feMerge');
  feMerge.append('feMergeNode').attr('in', 'coloredBlur');
  feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

  // Add close button
  addCloseButton();
}

// Add close button to synapse view
function addCloseButton() {
  const closeBtn = document.createElement('button');
  closeBtn.id = 'synapse-close-btn';
  closeBtn.innerHTML = '<i class="fas fa-times"></i> Close';
  closeBtn.className = 'synapse-close-btn';
  
  const container = document.getElementById('synapse-container');
  const existing = container.querySelector('.synapse-close-btn');
  if (existing) existing.remove();
  
  container.appendChild(closeBtn);
}

function setupCloseButton() {
  const closeBtn = document.getElementById('synapse-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      document.getElementById('synapse-container').classList.remove('active');
      closeSynapseProfileCard();
    });
  }
}

// Load all data for synapse
async function loadSynapseData() {
  try {
    // Load community members
    const { data: members, error } = await supabase
      .from('community')
      .select('id, name, email, image_url, skills, interests, bio, availability, x, y, connection_count')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Load connections
    connectionsData = await getAllConnectionsForSynapse();

    // Create nodes
    nodes = (members || []).map((member, index) => ({
      id: member.id,
      name: member.name || 'Anonymous',
      email: member.email,
      image_url: member.image_url,
      skills: parseSkills(member.skills),
      interests: member.interests || [],
      bio: member.bio,
      availability: member.availability || 'Available',
      connection_count: member.connection_count || 0,
      // Use stored positions or generate random
      x: member.x || Math.random() * window.innerWidth,
      y: member.y || Math.random() * window.innerHeight,
      isCurrentUser: member.id === currentUserCommunityId
    }));

    // Create links from connections
    links = connectionsData.map(conn => ({
      id: conn.id,
      source: conn.from_user_id,
      target: conn.to_user_id,
      status: conn.status,
      type: conn.type || 'manual'
    })).filter(link => {
      // Only include links where both nodes exist
      const sourceExists = nodes.some(n => n.id === link.source);
      const targetExists = nodes.some(n => n.id === link.target);
      return sourceExists && targetExists;
    });

    // Add suggested links based on shared skills (light connections)
    addSuggestedLinks();

    console.log(`Loaded ${nodes.length} nodes and ${links.length} links`);

  } catch (err) {
    console.error('Error loading synapse data:', err);
  }
}

// Parse skills helper
function parseSkills(skills) {
  if (!skills) return [];
  if (Array.isArray(skills)) return skills;
  if (typeof skills === 'string') return skills.split(',').map(s => s.trim()).filter(Boolean);
  return [];
}

// Add suggested links based on shared skills
function addSuggestedLinks() {
  const existingPairs = new Set(links.map(l => 
    [l.source, l.target].sort().join('-')
  ));

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const pairKey = [nodes[i].id, nodes[j].id].sort().join('-');
      if (existingPairs.has(pairKey)) continue;

      // Check for shared skills
      const sharedSkills = nodes[i].skills.filter(s => 
        nodes[j].skills.map(sk => sk.toLowerCase()).includes(s.toLowerCase())
      );

      if (sharedSkills.length >= 2) {
        links.push({
          id: `suggested-${pairKey}`,
          source: nodes[i].id,
          target: nodes[j].id,
          status: 'suggested',
          type: 'auto',
          sharedSkills
        });
      }
    }
  }
}

// Start D3 force simulation
function startSimulation() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  // Create simulation
  simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links)
      .id(d => d.id)
      .distance(d => {
        if (d.status === 'accepted') return 100;
        if (d.status === 'pending') return 150;
        return 200;
      })
      .strength(d => {
        if (d.status === 'accepted') return 0.5;
        if (d.status === 'pending') return 0.3;
        return 0.05;
      })
    )
    .force('charge', d3.forceManyBody()
      .strength(-300)
      .distanceMax(400)
    )
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(40));

  // Create links
  linkElements = container.append('g')
    .attr('class', 'links')
    .selectAll('line')
    .data(links)
    .enter()
    .append('line')
    .attr('class', d => `synapse-link status-${d.status}`)
    .attr('stroke', d => getLinkColor(d))
    .attr('stroke-width', d => getLinkWidth(d))
    .attr('stroke-dasharray', d => d.status === 'pending' ? '5,5' : 'none')
    .attr('opacity', d => d.status === 'suggested' ? 0.3 : 0.8);

  // Create nodes
  nodeElements = container.append('g')
    .attr('class', 'nodes')
    .selectAll('g')
    .data(nodes)
    .enter()
    .append('g')
    .attr('class', 'synapse-node')
    .call(d3.drag()
      .on('start', dragStarted)
      .on('drag', dragged)
      .on('end', dragEnded)
    )
    .on('click', (event, d) => {
      event.stopPropagation();
      showProfileCard(d, event);
    });

  // Add node circles
  nodeElements.append('circle')
    .attr('r', d => d.isCurrentUser ? 25 : 20)
    .attr('fill', d => d.isCurrentUser ? COLORS.nodeCurrentUser : COLORS.nodeDefault)
    .attr('stroke', d => d.isCurrentUser ? '#fff' : COLORS.nodeDefault)
    .attr('stroke-width', d => d.isCurrentUser ? 3 : 1.5)
    .attr('filter', 'url(#glow)')
    .attr('class', 'node-circle');

  // Add profile images (clipped to circle)
  nodeElements.each(function(d) {
    if (d.image_url) {
      const node = d3.select(this);
      const radius = d.isCurrentUser ? 22 : 17;
      
      // Add clip path
      node.append('clipPath')
        .attr('id', `clip-${d.id}`)
        .append('circle')
        .attr('r', radius);

      // Add image
      node.append('image')
        .attr('xlink:href', d.image_url)
        .attr('x', -radius)
        .attr('y', -radius)
        .attr('width', radius * 2)
        .attr('height', radius * 2)
        .attr('clip-path', `url(#clip-${d.id})`)
        .attr('preserveAspectRatio', 'xMidYMid slice')
        .on('error', function() {
          d3.select(this).remove();
        });
    }
  });

  // Add labels
  nodeElements.append('text')
    .attr('dy', d => d.isCurrentUser ? 40 : 35)
    .attr('text-anchor', 'middle')
    .attr('fill', '#fff')
    .attr('font-size', '11px')
    .attr('font-family', 'system-ui, sans-serif')
    .attr('pointer-events', 'none')
    .text(d => truncateName(d.name));

  // Update positions on tick
  simulation.on('tick', () => {
    linkElements
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y);

    nodeElements.attr('transform', d => `translate(${d.x},${d.y})`);
  });

  // Click on background to close card
  svg.on('click', () => closeSynapseProfileCard());
}

// Link color based on status
function getLinkColor(link) {
  switch (link.status) {
    case 'accepted': return COLORS.edgeAccepted;
    case 'pending': return COLORS.edgePending;
    case 'suggested': return COLORS.edgeSuggested;
    default: return COLORS.edgeDefault;
  }
}

// Link width based on status
function getLinkWidth(link) {
  switch (link.status) {
    case 'accepted': return 3;
    case 'pending': return 2;
    case 'suggested': return 1;
    default: return 1;
  }
}

// Truncate name for display
function truncateName(name) {
  if (!name) return '?';
  const parts = name.split(' ');
  if (parts.length > 1) {
    return `${parts[0]} ${parts[1].charAt(0)}.`;
  }
  return name.length > 12 ? name.substring(0, 10) + '...' : name;
}

// Drag handlers
function dragStarted(event, d) {
  if (!event.active) simulation.alphaTarget(0.3).restart();
  d.fx = d.x;
  d.fy = d.y;
}

function dragged(event, d) {
  d.fx = event.x;
  d.fy = event.y;
}

function dragEnded(event, d) {
  if (!event.active) simulation.alphaTarget(0);
  d.fx = null;
  d.fy = null;
}

// ========================
// PROFILE CARD
// ========================

async function showProfileCard(nodeData, event) {
  closeSynapseProfileCard();

  const card = document.createElement('div');
  card.id = 'synapse-profile-card';
  card.className = 'synapse-profile-card';

  // Get connection status
  const connStatus = await getConnectionStatus(nodeData.id);
  const canSee = await canSeeEmail(nodeData.id);

  // Build card content
  const isCurrentUser = nodeData.id === currentUserCommunityId;
  
  // Avatar
  const avatarHtml = nodeData.image_url
    ? `<img src="${nodeData.image_url}" alt="${nodeData.name}" class="synapse-card-avatar" 
         onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
       <div class="synapse-card-avatar-fallback" style="display:none;">${getInitials(nodeData.name)}</div>`
    : `<div class="synapse-card-avatar-fallback">${getInitials(nodeData.name)}</div>`;

  // Skills
  const skillsHtml = nodeData.skills.length > 0
    ? nodeData.skills.slice(0, 6).map(s => `<span class="synapse-skill-tag">${s}</span>`).join('')
    : '<span class="synapse-no-skills">No skills listed</span>';

  // Email (privacy controlled)
  const emailHtml = canSee && nodeData.email
    ? `<div class="synapse-card-email"><i class="fas fa-envelope"></i> ${nodeData.email}</div>`
    : '';

  // Connection button
  let actionHtml = '';
  if (!isCurrentUser) {
    if (connStatus.status === 'none' || connStatus.canConnect) {
      actionHtml = `<button class="synapse-connect-btn" data-id="${nodeData.id}">
        <i class="fas fa-user-plus"></i> Connect
      </button>`;
    } else if (connStatus.status === 'pending' && connStatus.isSender) {
      actionHtml = `<button class="synapse-pending-btn" disabled>
        <i class="fas fa-clock"></i> Request Pending
      </button>`;
    } else if (connStatus.status === 'pending' && connStatus.isReceiver) {
      actionHtml = `
        <div class="synapse-request-actions">
          <button class="synapse-accept-btn" data-id="${connStatus.connectionId}">
            <i class="fas fa-check"></i> Accept
          </button>
          <button class="synapse-decline-btn" data-id="${connStatus.connectionId}">
            <i class="fas fa-times"></i> Decline
          </button>
        </div>`;
    } else if (connStatus.status === 'accepted') {
      actionHtml = `<div class="synapse-connected-badge">
        <i class="fas fa-check-circle"></i> Connected
      </div>`;
    }
  } else {
    actionHtml = `<div class="synapse-you-badge">
      <i class="fas fa-user"></i> This is you
    </div>`;
  }

  card.innerHTML = `
    <button class="synapse-card-close" onclick="closeSynapseProfileCard()">
      <i class="fas fa-times"></i>
    </button>
    <div class="synapse-card-header">
      ${avatarHtml}
      <div class="synapse-card-info">
        <h3>${nodeData.name}</h3>
        <span class="synapse-availability ${nodeData.availability.toLowerCase().replace(/\s+/g, '-')}">
          ${nodeData.availability}
        </span>
      </div>
    </div>
    ${emailHtml}
    <div class="synapse-card-bio">${nodeData.bio || 'No bio available'}</div>
    <div class="synapse-card-skills">${skillsHtml}</div>
    <div class="synapse-card-stats">
      <span><i class="fas fa-link"></i> ${nodeData.connection_count || 0} connections</span>
      <span><i class="fas fa-star"></i> ${nodeData.skills.length} skills</span>
    </div>
    <div class="synapse-card-actions">${actionHtml}</div>
  `;

  // Position card near click
  const x = Math.min(event.clientX + 20, window.innerWidth - 320);
  const y = Math.min(event.clientY - 100, window.innerHeight - 400);
  card.style.left = `${x}px`;
  card.style.top = `${Math.max(20, y)}px`;

  document.getElementById('synapse-container').appendChild(card);

  // Attach event listeners
  attachCardEventListeners(card, nodeData);

  // Highlight node
  highlightNode(nodeData.id);
}

function attachCardEventListeners(card, nodeData) {
  // Connect button
  const connectBtn = card.querySelector('.synapse-connect-btn');
  if (connectBtn) {
    connectBtn.addEventListener('click', async () => {
      try {
        connectBtn.disabled = true;
        connectBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
        
        await sendConnectionRequest(nodeData.id);
        
        showSynapseNotification('Connection request sent!', 'success');
        closeSynapseProfileCard();
        
        // Refresh visualization
        await refreshSynapseConnections();
      } catch (err) {
        showSynapseNotification(err.message, 'error');
        connectBtn.disabled = false;
        connectBtn.innerHTML = '<i class="fas fa-user-plus"></i> Connect';
      }
    });
  }

  // Accept button
  const acceptBtn = card.querySelector('.synapse-accept-btn');
  if (acceptBtn) {
    acceptBtn.addEventListener('click', async () => {
      try {
        const { acceptConnectionRequest } = await import('./connections.js');
        await acceptConnectionRequest(acceptBtn.dataset.id);
        showSynapseNotification('Connection accepted!', 'success');
        closeSynapseProfileCard();
        await refreshSynapseConnections();
      } catch (err) {
        showSynapseNotification(err.message, 'error');
      }
    });
  }

  // Decline button
  const declineBtn = card.querySelector('.synapse-decline-btn');
  if (declineBtn) {
    declineBtn.addEventListener('click', async () => {
      try {
        const { declineConnectionRequest } = await import('./connections.js');
        await declineConnectionRequest(declineBtn.dataset.id);
        showSynapseNotification('Connection declined.', 'info');
        closeSynapseProfileCard();
        await refreshSynapseConnections();
      } catch (err) {
        showSynapseNotification(err.message, 'error');
      }
    });
  }
}

// Close profile card
window.closeSynapseProfileCard = function() {
  const card = document.getElementById('synapse-profile-card');
  if (card) card.remove();
  unhighlightNodes();
};

// Highlight selected node
function highlightNode(nodeId) {
  nodeElements.selectAll('.node-circle')
    .attr('stroke-width', d => d.id === nodeId ? 4 : (d.isCurrentUser ? 3 : 1.5))
    .attr('stroke', d => d.id === nodeId ? COLORS.nodeSelected : (d.isCurrentUser ? '#fff' : COLORS.nodeDefault));
}

function unhighlightNodes() {
  nodeElements.selectAll('.node-circle')
    .attr('stroke-width', d => d.isCurrentUser ? 3 : 1.5)
    .attr('stroke', d => d.isCurrentUser ? '#fff' : COLORS.nodeDefault);
}

// Get initials from name
function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }
  return parts[0].charAt(0).toUpperCase();
}

// ========================
// REFRESH & NOTIFICATIONS
// ========================

// Refresh connections (called after connection changes)
async function refreshSynapseConnections() {
  try {
    connectionsData = await getAllConnectionsForSynapse();

    // Update links array
    const existingNodeIds = new Set(nodes.map(n => n.id));
    
    // Remove all non-suggested links and rebuild
    links = links.filter(l => l.status === 'suggested');
    
    connectionsData.forEach(conn => {
      if (existingNodeIds.has(conn.from_user_id) && existingNodeIds.has(conn.to_user_id)) {
        // Remove any suggested link between these nodes
        links = links.filter(l => 
          !(l.status === 'suggested' && 
            ((l.source.id || l.source) === conn.from_user_id && (l.target.id || l.target) === conn.to_user_id) ||
            ((l.source.id || l.source) === conn.to_user_id && (l.target.id || l.target) === conn.from_user_id))
        );
        
        links.push({
          id: conn.id,
          source: conn.from_user_id,
          target: conn.to_user_id,
          status: conn.status,
          type: conn.type || 'manual'
        });
      }
    });

    // Update visualization
    updateLinks();

  } catch (err) {
    console.error('Error refreshing connections:', err);
  }
}

// Update link elements
function updateLinks() {
  // Remove old links
  linkElements.remove();

  // Recreate links with updated data
  linkElements = container.select('.links')
    .selectAll('line')
    .data(links, d => d.id)
    .join('line')
    .attr('class', d => `synapse-link status-${d.status}`)
    .attr('stroke', d => getLinkColor(d))
    .attr('stroke-width', d => getLinkWidth(d))
    .attr('stroke-dasharray', d => d.status === 'pending' ? '5,5' : 'none')
    .attr('opacity', d => d.status === 'suggested' ? 0.3 : 0.8);

  // Restart simulation to update positions
  simulation.force('link').links(links);
  simulation.alpha(0.3).restart();
}

// Show notification in synapse view
function showSynapseNotification(message, type = 'info') {
  const existing = document.querySelector('.synapse-notification');
  if (existing) existing.remove();

  const notif = document.createElement('div');
  notif.className = `synapse-notification ${type}`;
  notif.innerHTML = `
    <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
    <span>${message}</span>
  `;

  document.getElementById('synapse-container').appendChild(notif);
  setTimeout(() => notif.remove(), 3000);
}

// ========================
// EXPORTS
// ========================

export {
  initSynapseView,
  refreshSynapseConnections,
  showSynapseNotification
};

export default { initSynapseView };
