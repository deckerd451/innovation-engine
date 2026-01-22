// assets/js/theme-strategy-toggle.js
// Toggle between old SVG circles and new theme cards strategy

console.log("🎯 Theme Strategy Toggle loaded");

let currentStrategy = 'new'; // Start with new strategy
let isToggling = false;

// Add toggle button to the page
function addThemeStrategyToggle() {
  // Use the bottom bar button instead of creating a floating button
  const button = document.getElementById('btn-view-toggle');
  if (!button) {
    console.warn('⚠️ Bottom bar view toggle button not found');
    return;
  }

  // Update button content to reflect current strategy
  updateButtonText(button);

  // Add click listener
  button.addEventListener('click', toggleThemeStrategy);

  // Add hover effects
  button.addEventListener('mouseenter', () => {
    button.style.background = 'rgba(0, 224, 255, 0.15)';
    button.style.transform = 'translateY(-2px)';
    button.style.boxShadow = '0 6px 20px rgba(0, 224, 255, 0.3)';
  });

  button.addEventListener('mouseleave', () => {
    button.style.background = 'rgba(0, 224, 255, 0.08)';
    button.style.transform = 'translateY(0)';
    button.style.boxShadow = 'none';
  });
}

function updateButtonText(button) {
  const strategies = {
    old: {
      icon: 'fa-th-large',  // Cards icon
      text: 'Cards',
      fullText: 'Switch to Cards'
    },
    new: {
      icon: 'fa-circle-notch',  // Circles icon
      text: 'Circles',
      fullText: 'Switch to Circles'
    }
  };

  const strategy = strategies[currentStrategy];

  // Update the button to match bottom bar style
  const iconDiv = button.querySelector('.icon');
  const labelDiv = button.querySelector('.label');

  if (iconDiv && labelDiv) {
    iconDiv.innerHTML = `<i class="fas ${strategy.icon}"></i>`;
    labelDiv.textContent = strategy.text;
  }
}

async function toggleThemeStrategy() {
  if (isToggling) return;

  isToggling = true;
  const button = document.getElementById('btn-view-toggle');

  try {
    // Show loading state
    const iconDiv = button.querySelector('.icon');
    const labelDiv = button.querySelector('.label');

    if (iconDiv && labelDiv) {
      iconDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
      labelDiv.textContent = 'Loading...';
    }
    button.style.pointerEvents = 'none';

    // Clear current synapse
    const synapseContainer = document.getElementById('synapse-svg')?.parentElement;
    if (synapseContainer) {
      synapseContainer.innerHTML = '';
    }

    // Switch strategy
    currentStrategy = currentStrategy === 'old' ? 'new' : 'old';
    
    // Update global reference
    window.currentStrategy = currentStrategy;
    
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
      const { initSynapseView } = await import('./synapse/core.js?v=2c0b13fcc6e615869bc4682741e11e2bcf047292');
      
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
    <!-- Keep theme area for potential mode switching -->
    <div id="synapse-theme-area" style="display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 10;"></div>
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
window.currentStrategy = currentStrategy;