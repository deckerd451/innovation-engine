// assets/js/synapse/core-cards.js
// New Theme Strategy Implementation - Card-based approach

import { initConnections } from "../connections.js";
import { openNodePanel } from "../node-panel.js";
import * as PathwayAnimations from "../pathway-animations.js";

import { loadSynapseData } from "./data.js";
import { renderThemeCardsGrid, renderThemesSidebar } from "./theme-cards-strategy.js";
import { showSynapseNotification } from "./ui.js";
import { setupSynapseRealtime } from "./realtime.js";
import {
  setFocusOnNode,
  findCurrentUserNode,
  clearFocusEffects,
} from "./focus-system.js";

import {
  getThemeInterestCount,
  markInterested,
  renderThemeOverlayCard,
} from "./themes.js";

/* ==========================================================================
   STATE
   ========================================================================== */

let supabase = null;
let svg = null;
let container = null;
let zoomBehavior = null;
let simulation = null;

let nodes = [];
let links = [];
let nodeEls = null;
let linkEls = null;

let connectionsData = [];
let projectMembersData = [];
let currentUserCommunityId = null;

let initialized = false;
let showFullCommunity = true;
let userManuallyToggledMode = false;

// New: Theme display mode
let themeDisplayMode = 'cards'; // 'cards', 'sidebar', or 'hybrid'

/* ==========================================================================
   PUBLIC API
   ========================================================================== */

export async function initSynapseView() {
  if (initialized) {
    console.log("⚠️ Synapse already initialized — skipping.");
    return;
  }

  initialized = true;

  supabase = window.supabase;
  if (!supabase) {
    console.error("❌ Synapse: window.supabase not found");
    initialized = false;
    return;
  }

  if (!window.d3) {
    console.error("❌ Synapse: D3 not found on window. Load D3 before synapse.");
    initialized = false;
    return;
  }

  // Connection system gives us currentUserCommunityId reliably
  const userInfo = await initConnections(supabase);
  currentUserCommunityId = userInfo?.currentUserCommunityId || null;

  // Setup main container
  setupMainContainer();
  
  // Load data and render
  await reloadAllData();
  await buildInterface();

  // Realtime refresh
  setupSynapseRealtime(supabase, async () => {
    await reloadAllData();
    await rebuildInterface();
  });

  // Expose functions
  window.initSynapseView = initSynapseView;
  window.refreshSynapseConnections = refreshSynapseConnections;
  window.toggleThemeDisplayMode = toggleThemeDisplayMode;
  window.toggleFullCommunityView = toggleFullCommunityView;

  console.log("%c✅ NEW Synapse ready (Cards Strategy)", "color:#0f0; font-weight:bold;");
}

export async function refreshSynapseConnections() {
  await reloadAllData();
  await rebuildInterface();
}

export function resetSynapseView() {
  console.log("🔄 Resetting Synapse Cards view state");
  initialized = false;

  // Clear simulation if it exists
  if (simulation) {
    simulation.stop();
    simulation = null;
  }

  // Clear any running animations
  if (window.PathwayAnimations) {
    window.PathwayAnimations.stopAll?.();
  }
}

export function getSynapseStats() {
  const peopleCount = nodes.filter((n) => n.type === "person").length;
  const projectCount = nodes.filter((n) => n.type === "project").length;
  const themeCount = nodes.filter((n) => n.type === "theme").length;

  const acceptedSet = new Set(["accepted", "active", "connected", "approved"]);
  const myConns = (connectionsData || []).filter(
    (c) =>
      c.from_user_id === currentUserCommunityId ||
      c.to_user_id === currentUserCommunityId
  );

  const myAccepted = myConns.filter((c) =>
    !c.status ? true : acceptedSet.has(String(c.status).toLowerCase())
  );

  return {
    totalNodes: nodes.length,
    totalLinks: links.length,
    peopleCount,
    projectCount,
    themeCount,
    myConnectionCount: myAccepted.length || myConns.length || 0,
    currentUserCommunityId,
  };
}

export function getRecommendations() {
  // Simple recommendations based on current data
  const currentUser = nodes.find(n => n.id === currentUserCommunityId);
  if (!currentUser) return [];

  const userSkills = currentUser.skills || [];
  const userThemes = currentUser.themes || [];

  // Recommend themes based on skills
  const recommendedThemes = nodes
    .filter(n => n.type === 'theme' && !userThemes.includes(n.theme_id))
    .filter(theme => {
      const themeProjects = theme.projects || [];
      return themeProjects.some(project => {
        const requiredSkills = project.required_skills || [];
        return requiredSkills.some(skill => 
          userSkills.some(userSkill => 
            String(userSkill).toLowerCase().includes(String(skill).toLowerCase())
          )
        );
      });
    })
    .slice(0, 3);

  return recommendedThemes.map(theme => ({
    type: 'theme',
    id: theme.id,
    title: theme.title,
    reason: 'Based on your skills'
  }));
}

export function showConnectPathways(fromId, toId, options = {}) {
  console.log("🌟 Showing connect pathways in cards mode", { fromId, toId });
  
  try {
    // Get the cards container
    const container = document.querySelector('.theme-cards-container') || 
                     document.querySelector('#synapse-svg') ||
                     document.querySelector('#synapse-main-view');
    
    if (!container) {
      console.warn("No container found for pathway visualization");
      return;
    }

    // Create pathway overlay
    const pathwayOverlay = document.createElement('div');
    pathwayOverlay.id = 'pathway-overlay-cards';
    pathwayOverlay.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      pointer-events: none;
      z-index: 1000;
    `;

    // Find source and target cards
    const sourceCard = document.querySelector(`[data-node-id="${fromId}"]`) ||
                      document.querySelector(`[data-person-id="${fromId}"]`) ||
                      document.querySelector(`[data-theme-id="${fromId}"]`);
    
    const targetCard = document.querySelector(`[data-node-id="${toId}"]`) ||
                      document.querySelector(`[data-person-id="${toId}"]`) ||
                      document.querySelector(`[data-theme-id="${toId}"]`);

    if (sourceCard && targetCard) {
      // Create animated pathway line
      const pathway = createPathwayLine(sourceCard, targetCard, options);
      pathwayOverlay.appendChild(pathway);
      
      // Highlight connected cards
      highlightConnectedCards([sourceCard, targetCard]);
      
      // Add to container
      container.style.position = 'relative';
      container.appendChild(pathwayOverlay);
      
      // Auto-remove after animation
      setTimeout(() => {
        if (pathwayOverlay.parentElement) {
          pathwayOverlay.remove();
        }
        unhighlightCards([sourceCard, targetCard]);
      }, options.duration || 3000);
      
      console.log("✅ Pathway visualization created successfully");
    } else {
      console.warn("Could not find source or target cards for pathway");
      
      // Fallback: show notification
      if (typeof window.showSynapseNotification === 'function') {
        window.showSynapseNotification(
          `Connection pathway: ${fromId} → ${toId}`, 
          'info'
        );
      }
    }
  } catch (error) {
    console.error("Error creating pathway visualization:", error);
  }
}

function createPathwayLine(sourceElement, targetElement, options = {}) {
  const sourceRect = sourceElement.getBoundingClientRect();
  const targetRect = targetElement.getBoundingClientRect();
  
  const line = document.createElement('div');
  line.className = 'pathway-line';
  
  // Calculate line position and angle
  const sourceX = sourceRect.left + sourceRect.width / 2;
  const sourceY = sourceRect.top + sourceRect.height / 2;
  const targetX = targetRect.left + targetRect.width / 2;
  const targetY = targetRect.top + targetRect.height / 2;
  
  const length = Math.sqrt(Math.pow(targetX - sourceX, 2) + Math.pow(targetY - sourceY, 2));
  const angle = Math.atan2(targetY - sourceY, targetX - sourceX) * 180 / Math.PI;
  
  line.style.cssText = `
    position: absolute;
    left: ${sourceX}px;
    top: ${sourceY}px;
    width: ${length}px;
    height: 3px;
    background: linear-gradient(90deg, #00e0ff, #ff6b6b);
    transform-origin: 0 50%;
    transform: rotate(${angle}deg);
    opacity: 0;
    animation: pathwayPulse 2s ease-in-out infinite;
    box-shadow: 0 0 10px rgba(0, 224, 255, 0.5);
  `;
  
  // Add CSS animation if not exists
  if (!document.getElementById('pathway-animations')) {
    const style = document.createElement('style');
    style.id = 'pathway-animations';
    style.textContent = `
      @keyframes pathwayPulse {
        0% { opacity: 0; transform: rotate(${angle}deg) scaleX(0); }
        50% { opacity: 1; transform: rotate(${angle}deg) scaleX(1); }
        100% { opacity: 0.7; transform: rotate(${angle}deg) scaleX(1); }
      }
      
      .pathway-highlight {
        transform: scale(1.05) !important;
        box-shadow: 0 0 20px rgba(0, 224, 255, 0.6) !important;
        border: 2px solid #00e0ff !important;
        transition: all 0.3s ease !important;
      }
    `;
    document.head.appendChild(style);
  }
  
  return line;
}

function highlightConnectedCards(cards) {
  cards.forEach(card => {
    if (card) {
      card.classList.add('pathway-highlight');
    }
  });
}

function unhighlightCards(cards) {
  cards.forEach(card => {
    if (card) {
      card.classList.remove('pathway-highlight');
    }
  });
}

export function clearConnectPathways() {
  console.log("🌟 Clear pathways not needed in cards mode");
}

export async function toggleFullCommunityView(show) {
  if (typeof show === "boolean") {
    showFullCommunity = show;
  } else {
    showFullCommunity = !showFullCommunity;
  }

  userManuallyToggledMode = true;
  window.synapseShowFullCommunity = showFullCommunity;

  console.log(`🌐 Synapse view mode: ${showFullCommunity ? "Full Community (Discovery Mode)" : "My Network"}`);

  await reloadAllData();
  await rebuildInterface();
  
  if (typeof window.updateDiscoveryButtonState === 'function') {
    window.updateDiscoveryButtonState();
  }
}

export function toggleThemeDisplayMode(mode) {
  const validModes = ['cards', 'sidebar', 'hybrid'];
  if (mode && validModes.includes(mode)) {
    themeDisplayMode = mode;
  } else {
    // Cycle through modes
    const currentIndex = validModes.indexOf(themeDisplayMode);
    themeDisplayMode = validModes[(currentIndex + 1) % validModes.length];
  }

  console.log("🎯 Theme display mode changed to:", themeDisplayMode);
  rebuildInterface();
}

/* ==========================================================================
   CONTAINER SETUP
   ========================================================================== */

function setupMainContainer() {
  const synapseContainer = document.getElementById("synapse-svg")?.parentElement || document.body;
  
  // Clear existing content
  synapseContainer.innerHTML = '';

  // Create new layout structure
  const mainLayout = document.createElement('div');
  mainLayout.id = 'synapse-main-layout';
  mainLayout.style.cssText = `
    width: 100%;
    height: 100vh;
    position: relative;
    background: linear-gradient(135deg, #0a0a0a, #1a1a2e, #16213e);
    overflow: hidden;
  `;

  // Theme display area
  const themeArea = document.createElement('div');
  themeArea.id = 'synapse-theme-area';
  themeArea.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    overflow-y: auto;
    z-index: 10;
  `;

  // People/Projects network area (for hybrid mode)
  const networkArea = document.createElement('div');
  networkArea.id = 'synapse-network-area';
  networkArea.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 5;
  `;

  // Add SVG for network visualization (when needed)
  const svgEl = document.createElement('svg');
  svgEl.id = 'synapse-network-svg';
  svgEl.style.cssText = `
    width: 100%;
    height: 100%;
  `;
  networkArea.appendChild(svgEl);

  mainLayout.appendChild(networkArea);
  mainLayout.appendChild(themeArea);
  synapseContainer.appendChild(mainLayout);

  // Setup D3 SVG for network (when needed)
  svg = window.d3.select(svgEl);
  const width = window.innerWidth;
  const height = window.innerHeight;
  svg.attr("viewBox", [0, 0, width, height]);

  container = svg.append("g").attr("class", "synapse-container");
}

/* ==========================================================================
   DATA LOADING
   ========================================================================== */

async function reloadAllData() {
  if (!supabase) return;

  console.log("🔄 Loading synapse data for cards strategy...");

  const loaded = await loadSynapseData({
    supabase,
    currentUserCommunityId,
    showFullCommunity,
  });

  nodes = loaded.nodes || [];
  links = loaded.links || [];
  connectionsData = loaded.connectionsData || [];
  projectMembersData = loaded.projectMembersData || [];

  console.log("📊 Synapse data loaded:", {
    nodes: nodes.length,
    links: links.length,
    themes: nodes.filter(n => n.type === 'theme').length,
    people: nodes.filter(n => n.type === 'person').length,
    projects: nodes.filter(n => n.type === 'project').length
  });
}

/* ==========================================================================
   INTERFACE BUILDING
   ========================================================================== */

async function buildInterface() {
  const themeArea = document.getElementById('synapse-theme-area');
  const networkArea = document.getElementById('synapse-network-area');
  
  if (!themeArea) {
    console.error("❌ Theme area not found");
    return;
  }
  
  if (!networkArea) {
    console.warn('⚠️ Network area not found, some features may not work');
  }

  // Get theme nodes
  const themeNodes = nodes.filter(n => n.type === 'theme');
  const peopleNodes = nodes.filter(n => n.type === 'person');
  const projectNodes = nodes.filter(n => n.type === 'project');

  console.log("🎯 Building interface with mode:", themeDisplayMode);
  console.log("📊 Nodes:", { themes: themeNodes.length, people: peopleNodes.length, projects: projectNodes.length });

  // Clear previous content
  themeArea.innerHTML = '';
  
  // Show/hide network area based on mode
  if (themeDisplayMode === 'cards') {
    if (networkArea) networkArea.style.display = 'none';
    if (themeArea) themeArea.style.zIndex = '10';
    
    // Render theme cards grid
    renderThemeCardsGrid(themeArea, themeNodes, {
      onThemeClick: handleThemeClick,
      currentUserCommunityId
    });
    
  } else if (themeDisplayMode === 'sidebar') {
    if (networkArea) networkArea.style.display = 'block';
    if (themeArea) themeArea.style.zIndex = '20';
    
    // Render people/projects network in background
    await renderPeopleProjectsNetwork(peopleNodes, projectNodes);
    
    // Render themes sidebar
    renderThemesSidebar(themeArea, themeNodes, {
      onThemeClick: handleThemeClick,
      currentUserCommunityId
    });
    
  } else if (themeDisplayMode === 'hybrid') {
    if (networkArea) networkArea.style.display = 'block';
    if (themeArea) themeArea.style.zIndex = '15';
    
    // Render people/projects network
    await renderPeopleProjectsNetwork(peopleNodes, projectNodes);
    
    // Render compact theme cards at top
    const compactGrid = document.createElement('div');
    compactGrid.style.cssText = `
      position: absolute;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
      justify-content: center;
      max-width: 90%;
      z-index: 15;
    `;
    
    themeNodes.slice(0, 6).forEach(theme => {
      const compactCard = createCompactCard(theme);
      compactGrid.appendChild(compactCard);
    });
    
    themeArea.appendChild(compactGrid);
  }

  // Add mode toggle button - DISABLED: Using bottom bar button instead
  // addModeToggleButton();
}

async function rebuildInterface() {
  await buildInterface();
}

/* ==========================================================================
   NETWORK RENDERING (for sidebar/hybrid modes)
   ========================================================================== */

async function renderPeopleProjectsNetwork(peopleNodes, projectNodes) {
  if (!svg || !container) return;

  console.log("🌐 Rendering people/projects network");

  // Clear existing
  container.selectAll("*").remove();

  // Filter to only people and projects (no themes)
  const networkNodes = [...peopleNodes, ...projectNodes];
  const networkLinks = links.filter(link => {
    const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
    const targetId = typeof link.target === 'object' ? link.target.id : link.target;
    
    // Only include links between people and projects (no theme links)
    const sourceIsNetwork = networkNodes.some(n => n.id === sourceId);
    const targetIsNetwork = networkNodes.some(n => n.id === targetId);
    
    return sourceIsNetwork && targetIsNetwork && link.type !== 'theme';
  });

  console.log("🌐 Network nodes:", networkNodes.length, "links:", networkLinks.length);

  if (networkNodes.length === 0) return;

  // Simple force simulation for people/projects
  const simulation = window.d3.forceSimulation(networkNodes)
    .force("link", window.d3.forceLink(networkLinks).id(d => d.id).distance(100))
    .force("charge", window.d3.forceManyBody().strength(-300))
    .force("center", window.d3.forceCenter(window.innerWidth / 2, window.innerHeight / 2))
    .force("collision", window.d3.forceCollide().radius(30));

  // Render links
  const linkEls = container.append("g")
    .attr("class", "links")
    .selectAll("line")
    .data(networkLinks)
    .enter()
    .append("line")
    .attr("stroke", "rgba(0, 224, 255, 0.3)")
    .attr("stroke-width", 1);

  // Render nodes
  const nodeEls = container.append("g")
    .attr("class", "nodes")
    .selectAll("g")
    .data(networkNodes)
    .enter()
    .append("g")
    .attr("class", "network-node")
    .call(window.d3.drag()
      .on("start", dragstarted)
      .on("drag", dragged)
      .on("end", dragended));

  // Add circles for nodes
  nodeEls.append("circle")
    .attr("r", d => d.type === 'person' ? (d.isCurrentUser ? 25 : 15) : 20)
    .attr("fill", d => {
      if (d.type === 'person') {
        return d.isCurrentUser ? "#ffd700" : "#00e0ff";
      } else {
        return "#ff6b6b"; // projects
      }
    })
    .attr("stroke", "#fff")
    .attr("stroke-width", 2);

  // Add labels
  nodeEls.append("text")
    .attr("dy", 35)
    .attr("text-anchor", "middle")
    .attr("fill", "#fff")
    .attr("font-size", "12px")
    .text(d => d.name);

  // Update positions on tick
  simulation.on("tick", () => {
    linkEls
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y);

    nodeEls
      .attr("transform", d => `translate(${d.x},${d.y})`);
  });

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
}

/* ==========================================================================
   THEME INTERACTION
   ========================================================================== */

async function handleThemeClick(event, theme) {
  console.log("🎯 Theme clicked:", theme.title, theme.theme_id);
  console.log("🎯 Theme data:", theme);

  try {
    // Get theme participants for the overlay
    console.log("📡 Fetching theme participants from Supabase...");
    const { data: participants, error } = await supabase
      .from('theme_participants')
      .select(`
        community_id,
        engagement_level,
        community:community_id (
          id,
          name,
          image_url
        )
      `)
      .eq('theme_id', theme.theme_id);

    if (error) {
      console.error("❌ Error loading theme participants:", error);
      showSynapseNotification("Failed to load theme participants", "error");
      return;
    }

    console.log("✅ Theme participants loaded:", participants?.length || 0, participants);

    const participantList = (participants || []).map(p => ({
      id: p.community_id,
      name: p.community?.name || 'Unknown',
      image_url: p.community?.image_url,
      engagement_level: p.engagement_level
    }));

    // Get interest count
    console.log("📊 Fetching interest count...");
    const interestCount = await getThemeInterestCount(supabase, theme.theme_id);
    console.log("✅ Interest count:", interestCount);

    // Check current user's engagement
    const currentUserEngagement = participantList.find(p => p.id === currentUserCommunityId)?.engagement_level || null;
    console.log("👤 Current user engagement level:", currentUserEngagement);

    // Show theme overlay card
    console.log("🎨 Rendering theme overlay card...");
    await renderThemeOverlayCard({
      themeNode: theme,
      interestCount,
      participants: participantList,
      currentUserEngagement,
      onInterested: async () => {
        try {
          if (!currentUserCommunityId) {
            throw new Error("Not logged in");
          }

          await markInterested(supabase, {
            themeId: theme.theme_id,
            communityId: currentUserCommunityId
          });

          showSynapseNotification("Interest signaled! 🌟", "success");
          
          // Refresh data and interface
          await refreshSynapseConnections();
        } catch (error) {
          console.error("Failed to signal interest:", error);
          showSynapseNotification(error.message || "Failed to signal interest", "error");
        }
      }
    });

  } catch (error) {
    console.error("❌ Error handling theme click:", error);
    console.error("❌ Error stack:", error.stack);
    console.error("❌ Error details:", {
      message: error.message,
      name: error.name,
      theme: theme.title
    });
    showSynapseNotification("Failed to load theme details: " + error.message, "error");
  }
}

/* ==========================================================================
   UI HELPERS
   ========================================================================== */

function createCompactCard(theme) {
  const card = document.createElement('div');
  card.style.cssText = `
    background: rgba(0, 0, 0, 0.8);
    border: 2px solid rgba(0, 224, 255, 0.4);
    border-radius: 8px;
    padding: 0.75rem 1rem;
    cursor: pointer;
    transition: all 0.2s ease;
    backdrop-filter: blur(10px);
    min-width: 120px;
    text-align: center;
  `;

  card.innerHTML = `
    <div style="color: #00e0ff; font-weight: bold; font-size: 0.9rem; margin-bottom: 0.25rem;">
      ${theme.title}
    </div>
    <div style="color: rgba(255, 255, 255, 0.6); font-size: 0.75rem;">
      ${theme.participant_count || 0} people
    </div>
  `;

  card.addEventListener('click', (event) => handleThemeClick(event, theme));
  
  card.addEventListener('mouseenter', () => {
    card.style.borderColor = '#00e0ff';
    card.style.transform = 'translateY(-2px)';
  });

  card.addEventListener('mouseleave', () => {
    card.style.borderColor = 'rgba(0, 224, 255, 0.4)';
    card.style.transform = 'translateY(0)';
  });

  return card;
}

function addModeToggleButton() {
  // Remove existing button
  const existing = document.getElementById('theme-mode-toggle');
  if (existing) existing.remove();

  const button = document.createElement('button');
  button.id = 'theme-mode-toggle';
  button.style.cssText = `
    position: fixed;
    top: 80px;
    left: 20px;
    background: rgba(0, 224, 255, 0.2);
    border: 2px solid #00e0ff;
    border-radius: 8px;
    color: #00e0ff;
    padding: 0.5rem 1rem;
    cursor: pointer;
    font-weight: bold;
    z-index: 1000;
    transition: all 0.2s ease;
  `;

  // Add responsive positioning
  const mediaQuery = window.matchMedia('(max-width: 768px)');
  function updateButtonPosition() {
    if (mediaQuery.matches) {
      // On mobile, move button lower and to the right to avoid header
      button.style.top = '120px';
      button.style.left = '10px';
      button.style.padding = '0.4rem 0.75rem';
      button.style.fontSize = '0.85rem';
    } else {
      // On desktop, use position below header
      button.style.top = '80px';
      button.style.left = '20px';
      button.style.padding = '0.5rem 1rem';
      button.style.fontSize = '1rem';
    }
  }

  updateButtonPosition();
  mediaQuery.addListener(updateButtonPosition);

  const modeLabels = {
    cards: '📋 Cards',
    sidebar: '📱 Sidebar', 
    hybrid: '🔀 Hybrid'
  };

  button.innerHTML = `${modeLabels[themeDisplayMode]} View`;

  button.addEventListener('click', () => {
    toggleThemeDisplayMode();
    button.innerHTML = `${modeLabels[themeDisplayMode]} View`;
  });

  button.addEventListener('mouseenter', () => {
    button.style.background = 'rgba(0, 224, 255, 0.3)';
    button.style.transform = 'translateY(-2px)';
  });

  button.addEventListener('mouseleave', () => {
    button.style.background = 'rgba(0, 224, 255, 0.2)';
    button.style.transform = 'translateY(0)';
  });

  document.body.appendChild(button);
}

export { showSynapseNotification };