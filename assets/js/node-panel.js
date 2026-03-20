// ================================================================
// NODE SIDE PANEL
// ================================================================
// Actionable side panel that appears when clicking network nodes
// Shows profile details, mutual connections, and clear CTAs

import { makeProfileImageClickable } from './profile-image-modal.js';

const NODE_PANEL_VERSION = 'v2.2-' + Date.now();
console.log(`%c👤 Node Panel ${NODE_PANEL_VERSION} (Project Approval Fix)`, "color:#0ff; font-weight: bold; font-size: 16px");

let currentNodeData = null;
let panelElement = null;
let supabase = null;
let currentUserProfile = null;

// Initialize panel
let nodePanelInitialized = false;

export function initNodePanel() {
  if (nodePanelInitialized) {
    console.log('⚠️ Node Panel already initialized, skipping');
    return;
  }
  nodePanelInitialized = true;
  
  supabase = window.supabase;
  createPanelElement();

  // Listen for profile loaded
  window.addEventListener('profile-loaded', (e) => {
    currentUserProfile = e.detail.profile;
  });

  // Expose functions globally
  window.createProjectInTheme = createProjectInTheme;

  console.log('✅ Node panel initialized');
}

// Create the panel DOM element
function createPanelElement() {
  panelElement = document.createElement('div');
  panelElement.id = 'node-side-panel';
  panelElement.style.cssText = `
    position: fixed;
    top: 0;
    right: -450px;
    width: 420px;
    height: 100vh;
    background: linear-gradient(135deg, rgba(10, 14, 39, 0.73), rgba(26, 26, 46, 0.73));
    border-left: 2px solid rgba(0, 224, 255, 0.5);
    backdrop-filter: blur(10px);
    z-index: 2000;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transition: right 0.3s ease-out;
    box-shadow: -5px 0 30px rgba(0, 0, 0, 0.5);
  `;

  // Custom scrollbar and collapsible section styles
  const style = document.createElement('style');
  style.textContent = `
    /* ── Portrait phones: bottom-sheet split-screen ── */
    @media (max-width: 768px) and (orientation: portrait) {
      #node-side-panel {
        width: 100vw !important;
        height: 55vh !important;
        height: 55dvh !important;
        top: auto !important;
        bottom: -55vh !important;
        bottom: -55dvh !important;
        right: 0 !important;
        border-left: none !important;
        border-top: 2px solid rgba(0, 224, 255, 0.5) !important;
        border-radius: 16px 16px 0 0 !important;
        transition: bottom 0.3s ease-out !important;
      }

      #node-side-panel.open {
        bottom: 0 !important;
      }

      /* Graph occupies top 45dvh when the bottom sheet is open */
      body.node-panel-open #synapse-main-view {
        bottom: 55vh !important;
        bottom: 55dvh !important;
        transition: bottom 0.3s ease-out !important;
      }

      /* Adjust padding for mobile */
      #node-side-panel .node-panel-header {
        padding: 1rem !important;
      }

      #node-side-panel .panel-section-header {
        padding: 0.75rem 1rem !important;
      }

      /* Make buttons stack on mobile */
      #node-side-panel .action-buttons,
      #node-side-panel [style*="display: flex"][style*="gap"] {
        flex-direction: column !important;
        gap: 0.5rem !important;
      }

      #node-side-panel button[style*="flex: 1"] {
        width: 100% !important;
        flex: none !important;
      }

      /* Adjust font sizes for mobile */
      #node-side-panel h2 {
        font-size: 1.25rem !important;
      }

      #node-side-panel h3 {
        font-size: 1.1rem !important;
      }

      /* Make profile images smaller on mobile */
      #node-side-panel img[style*="width: 120px"],
      #node-side-panel img[style*="width: 100px"] {
        width: 80px !important;
        height: 80px !important;
      }

      /* Adjust skill tags for mobile */
      #node-side-panel [style*="flex-wrap: wrap"] {
        gap: 0.35rem !important;
      }

      #node-side-panel [style*="flex-wrap: wrap"] > * {
        font-size: 0.75rem !important;
        padding: 0.25rem 0.5rem !important;
      }
    }

    /* ── Landscape phones: side-by-side split-screen ── */
    @media (orientation: landscape) and (pointer: coarse) and (max-height: 600px) {
      #node-side-panel {
        width: 50vw !important;
        right: -50vw !important;
        height: 100% !important;
        border-left: 2px solid rgba(0, 224, 255, 0.5) !important;
        /* Remove blur so graph content doesn't bleed through the panel */
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
        transition: right 0.3s ease-out !important;
      }

      #node-side-panel.open {
        right: 0 !important;
      }

      /* Graph occupies left 50vw when the side panel is open */
      body.node-panel-open #synapse-main-view {
        right: 50vw !important;
        transition: right 0.3s ease-out !important;
      }
    }
    
    #node-side-panel::-webkit-scrollbar {
      width: 8px;
    }
    #node-side-panel::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.3);
    }
    #node-side-panel::-webkit-scrollbar-thumb {
      background: rgba(0, 224, 255, 0.3);
      border-radius: 4px;
    }
    #node-side-panel::-webkit-scrollbar-thumb:hover {
      background: rgba(0, 224, 255, 0.5);
    }

    /* Scrollable body + fixed action bar layout */
    .node-panel-body {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
    }
    .node-panel-body::-webkit-scrollbar {
      width: 8px;
    }
    .node-panel-body::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.3);
    }
    .node-panel-body::-webkit-scrollbar-thumb {
      background: rgba(0, 224, 255, 0.3);
      border-radius: 4px;
    }
    .node-panel-body::-webkit-scrollbar-thumb:hover {
      background: rgba(0, 224, 255, 0.5);
    }
    .node-panel-actions {
      flex-shrink: 0;
      background: linear-gradient(135deg, rgba(10, 14, 39, 0.98), rgba(26, 26, 46, 0.98));
      border-top: 2px solid rgba(0, 224, 255, 0.5);
      padding: 1rem 1.5rem;
      backdrop-filter: blur(10px);
    }
    
    /* Collapsible section styles */
    .panel-section {
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    .panel-section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 1.5rem;
      cursor: pointer;
      background: rgba(0, 224, 255, 0.05);
      transition: background 0.2s;
    }
    
    .panel-section-header:hover {
      background: rgba(0, 224, 255, 0.1);
    }
    
    .panel-section-title {
      color: #00e0ff;
      font-weight: 700;
      font-size: 0.95rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    
    .panel-section-toggle {
      color: rgba(255, 255, 255, 0.6);
      font-size: 0.9rem;
      transition: transform 0.3s;
    }
    
    .panel-section-toggle.collapsed {
      transform: rotate(-90deg);
    }
    
    .panel-section-content {
      max-height: 1000px;
      overflow: hidden;
      transition: max-height 0.3s ease-out, opacity 0.3s ease-out;
      opacity: 1;
    }
    
    .panel-section-content.collapsed {
      max-height: 0;
      opacity: 0;
    }
    
    .panel-section-inner {
      padding: 1rem 1.5rem;
    }

    /* Make action bars full width on mobile */
    @media (max-width: 768px) {
      .node-panel-actions {
        width: 100% !important;
      }
    }
  `;
  document.head.appendChild(style);

  document.body.appendChild(panelElement);
}

// Toggle collapsible section
window.togglePanelSection = function(sectionId) {
  const content = document.getElementById(`${sectionId}-content`);
  const toggle = document.getElementById(`${sectionId}-toggle`);
  
  if (!content || !toggle) return;
  
  const isCollapsed = content.classList.contains('collapsed');
  
  if (isCollapsed) {
    content.classList.remove('collapsed');
    toggle.classList.remove('collapsed');
  } else {
    content.classList.add('collapsed');
    toggle.classList.add('collapsed');
  }
};

// Open panel with node data
export async function openNodePanel(nodeData) {
  console.log('Opening panel for node:', nodeData);

  // Auto-initialize if initNodePanel wasn't called yet (timing safety)
  if (!panelElement) {
    console.warn('[NodePanel] panelElement null — running initNodePanel() now');
    initNodePanel();
  }
  if (!panelElement) {
    console.error('[NodePanel] panelElement still null after init — aborting openNodePanel');
    return;
  }

  currentNodeData = nodeData;

  // Show panel
  panelElement.style.right = '0';
  panelElement.classList.add('open');
  // Body class lets CSS split the graph (portrait: bottom-sheet; landscape: side-by-side)
  document.body.classList.add('node-panel-open');
  // Repaint the graph at its new constrained dimensions after the CSS transition
  setTimeout(() => window.dispatchEvent(new Event('resize')), 350);

  // Load full data
  await loadNodeDetails(nodeData);
  
  // Update presence for this user (if it's a person)
  if (nodeData.type === 'person' && window.PresenceUI) {
    const userId = nodeData.user_id || nodeData.id;
    window.PresenceUI.updatePresenceForUser(userId);
    
    // Dispatch event for presence UI
    window.dispatchEvent(new CustomEvent('profile-panel-opened', {
      detail: { userId }
    }));
  }
}

// Close panel
export function closeNodePanel() {
  // Check if mobile
  const isMobile = window.innerWidth <= 768;
  panelElement.style.right = isMobile ? '-100vw' : '-450px';
  panelElement.classList.remove('open');
  document.body.classList.remove('node-panel-open');
  // Restore graph to full dimensions after the CSS transition
  setTimeout(() => window.dispatchEvent(new Event('resize')), 350);
  currentNodeData = null;
}

// Load complete node details
async function loadNodeDetails(nodeData) {
  // Show loading state
  panelElement.innerHTML = `
    <div style="padding: 2rem; text-align: center; color: #00e0ff;">
      <i class="fas fa-spinner fa-spin" style="font-size: 2rem;"></i>
      <p style="margin-top: 1rem;">Loading...</p>
    </div>
  `;

  try {
    // Check if this is a theme lens view
    if (nodeData.isThemeLens) {
      await renderThemeLensPanel(nodeData);
      return;
    }

    // Determine node type and render appropriate panel
    if (nodeData.type === 'project') {
      await renderProjectPanel(nodeData);
    } else if (nodeData.type === 'organization') {
      await renderOrganizationPanel(nodeData);
    } else if (nodeData.type === 'opportunity') {
      await renderOpportunityPanel(nodeData);
    } else {
      await renderPersonPanel(nodeData);
    }

  } catch (error) {
    console.error('Error loading node details:', error);
    panelElement.innerHTML = `
      <div style="padding: 2rem; text-align: center; color: #ff6666;">
        <i class="fas fa-exclamation-circle" style="font-size: 2rem;"></i>
        <p style="margin-top: 1rem;">Error loading details</p>
      </div>
    `;
  }
}

// [... renderThemeLensPanel, renderThemeProjectCard, escapeHtml, normalizeSkills,
//      renderOpportunityPanel, renderOrganizationPanel, renderOrganizationContent,
//      renderPersonPanel, renderProjectPanel, getMutualConnections, getSharedProjects,
//      all window.* action handlers, createProjectInTheme, joinTheme, leaveTheme,
//      deleteTheme, normalizeCommaList, parseCommaList ...]

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initNodePanel();
});

console.log('✅ Node panel ready');
