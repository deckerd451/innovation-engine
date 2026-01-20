// assets/js/theme-strategy-toggle.js
// Toggle between old SVG circles and new theme cards strategy

console.log("🎯 Theme Strategy Toggle loaded");

let currentStrategy = 'new'; // Start with new strategy
let isToggling = false;

// Add toggle button to the page
function addThemeStrategyToggle() {
  // Remove existing button
  const existing = document.getElementById('theme-strategy-toggle');
  if (existing) existing.remove();

  const button = document.createElement('button');
  button.id = 'theme-strategy-toggle';
  button.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: linear-gradient(135deg, rgba(0, 224, 255, 0.2), rgba(0, 224, 255, 0.1));
    border: 2px solid #00e0ff;
    border-radius: 8px;
    color: #00e0ff;
    padding: 0.75rem 1rem;
    cursor: pointer;
    font-weight: bold;
    z-index: 10000;
    transition: all 0.3s ease;
    font-size: 0.9rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    backdrop-filter: blur(10px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  `;

  updateButtonText(button);

  button.addEventListener('click', toggleThemeStrategy);
  
  button.addEventListener('mouseenter', () => {
    button.style.background = 'linear-gradient(135deg, rgba(0, 224, 255, 0.3), rgba(0, 224, 255, 0.2))';
    button.style.transform = 'translateY(-2px)';
    button.style.boxShadow = '0 6px 20px rgba(0, 224, 255, 0.3)';
  });

  button.addEventListener('mouseleave', () => {
    button.style.background = 'linear-gradient(135deg, rgba(0, 224, 255, 0.2), rgba(0, 224, 255, 0.1))';
    button.style.transform = 'translateY(0)';
    button.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
  });

  document.body.appendChild(button);
}

function updateButtonText(button) {
  const strategies = {
    old: {
      icon: '🔄',
      text: 'Switch to Cards',
      description: 'Currently: SVG Circles'
    },
    new: {
      icon: '🎯',
      text: 'Switch to Circles', 
      description: 'Currently: Theme Cards'
    }
  };

  const strategy = strategies[currentStrategy];
  button.innerHTML = `
    <span style="font-size: 1.2rem;">${strategy.icon}</span>
    <div style="display: flex; flex-direction: column; align-items: flex-start;">
      <span style="font-size: 0.9rem; font-weight: bold;">${strategy.text}</span>
      <span style="font-size: 0.7rem; opacity: 0.7;">${strategy.description}</span>
    </div>
  `;
}

async function toggleThemeStrategy() {
  if (isToggling) return;
  
  isToggling = true;
  const button = document.getElementById('theme-strategy-toggle');
  
  try {
    // Show loading state
    button.innerHTML = `
      <i class="fas fa-spinner fa-spin"></i>
      <span>Switching...</span>
    `;
    button.style.pointerEvents = 'none';

    // Clear current synapse
    const synapseContainer = document.getElementById('synapse-svg')?.parentElement;
    if (synapseContainer) {
      synapseContainer.innerHTML = '';
    }

    // Switch strategy
    currentStrategy = currentStrategy === 'old' ? 'new' : 'old';
    
    // Dynamically import and initialize the appropriate strategy
    if (currentStrategy === 'new') {
      // Import new cards strategy
      const { initSynapseView } = await import('./synapse/core-cards.js');
      
      // Setup container for cards
      setupCardsContainer();
      
      // Initialize new system
      await initSynapseView();
      
      showNotification('🎯 Switched to Theme Cards Strategy!', 'success');
      
    } else {
      // Import old circles strategy
      const { initSynapseView } = await import('./synapse/core.js?v=6');
      
      // Setup container for SVG
      setupSVGContainer();
      
      // Initialize old system
      await initSynapseView();
      
      showNotification('🔄 Switched to SVG Circles Strategy', 'info');
    }

  } catch (error) {
    console.error('❌ Failed to switch theme strategy:', error);
    showNotification('Failed to switch strategy: ' + error.message, 'error');
    
    // Revert strategy on error
    currentStrategy = currentStrategy === 'old' ? 'new' : 'old';
  } finally {
    isToggling = false;
    button.style.pointerEvents = 'auto';
    updateButtonText(button);
  }
}

function setupCardsContainer() {
  const synapseContainer = document.getElementById('synapse-svg')?.parentElement || 
                          document.getElementById('synapse-main-view') ||
                          document.body;
  
  synapseContainer.innerHTML = `
    <div id="synapse-main-layout" style="
      width: 100%;
      height: 100vh;
      position: relative;
      background: linear-gradient(135deg, #0a0a0a, #1a1a2e, #16213e);
      overflow: hidden;
    ">
      <div id="synapse-theme-area" style="
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        overflow-y: auto;
        z-index: 10;
      "></div>
      <div id="synapse-network-area" style="
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 5;
      ">
        <svg id="synapse-network-svg" style="width: 100%; height: 100%;"></svg>
      </div>
    </div>
  `;
}

function setupSVGContainer() {
  const synapseContainer = document.getElementById('synapse-svg')?.parentElement || 
                          document.getElementById('synapse-main-view') ||
                          document.body;
  
  synapseContainer.innerHTML = `
    <svg id="synapse-svg" style="width:100%; height:100%; background: #000000;"></svg>
  `;
}

function showNotification(message, type = 'info') {
  // Create notification
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 80px;
    right: 20px;
    background: ${type === 'success' ? 'rgba(0, 255, 136, 0.9)' : 
                 type === 'error' ? 'rgba(255, 107, 107, 0.9)' : 
                 'rgba(0, 224, 255, 0.9)'};
    color: ${type === 'success' || type === 'error' ? '#000' : '#fff'};
    padding: 1rem 1.5rem;
    border-radius: 8px;
    font-weight: bold;
    z-index: 10001;
    backdrop-filter: blur(10px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    animation: slideInRight 0.3s ease-out;
  `;
  
  notification.textContent = message;
  document.body.appendChild(notification);
  
  // Auto remove after 3 seconds
  setTimeout(() => {
    notification.style.animation = 'slideOutRight 0.3s ease-in';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideInRight {
    from {
      opacity: 0;
      transform: translateX(100%);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
  
  @keyframes slideOutRight {
    from {
      opacity: 1;
      transform: translateX(0);
    }
    to {
      opacity: 0;
      transform: translateX(100%);
    }
  }
`;
document.head.appendChild(style);

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', addThemeStrategyToggle);
} else {
  addThemeStrategyToggle();
}

// Export for manual use
window.toggleThemeStrategy = toggleThemeStrategy;
window.addThemeStrategyToggle = addThemeStrategyToggle;