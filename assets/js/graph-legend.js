// ================================================================
// GRAPH LEGEND
// ================================================================
// Visual legend explaining network encodings and interactions

console.log("%c📖 Graph Legend Loading...", "color:#0ff; font-weight: bold; font-size: 16px");

let legendPanel = null;

// Create legend panel
export function createGraphLegend() {
  legendPanel = document.createElement('div');
  legendPanel.id = 'graph-legend';
  legendPanel.style.cssText = `
    position: fixed;
    bottom: 100px;
    right: 20px;
    width: 300px;
    background: linear-gradient(135deg, rgba(10, 14, 39, 0.95), rgba(26, 26, 46, 0.95));
    border: 2px solid rgba(0, 224, 255, 0.5);
    border-radius: 12px;
    padding: 1.5rem;
    z-index: 1000;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(10px);
    opacity: 0;
    transform: translateY(20px);
    transition: opacity 0.3s, transform 0.3s;
    pointer-events: none;
  `;

  legendPanel.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
      <h3 style="color: #00e0ff; margin: 0; font-size: 1.25rem;">
        <i class="fas fa-info-circle"></i> Legend
      </h3>
      <button onclick="hideLegend()" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: white; width: 30px; height: 30px; border-radius: 50%; cursor: pointer; pointer-events: all;">
        <i class="fas fa-times"></i>
      </button>
    </div>

    <!-- Node Types -->
    <div style="margin-bottom: 1.5rem;">
      <h4 style="color: #00e0ff; font-size: 0.9rem; margin-bottom: 0.75rem; text-transform: uppercase; letter-spacing: 1px;">
        Node Types
      </h4>

      <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.75rem;">
        <div style="width: 20px; height: 20px; border-radius: 50%; background: #00e0ff; border: 2px solid #00e0ff;"></div>
        <div>
          <div style="color: white; font-weight: bold; font-size: 0.9rem;">Person</div>
          <div style="color: #aaa; font-size: 0.75rem;">Community member</div>
        </div>
      </div>

      <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.75rem;">
        <div style="width: 20px; height: 20px; border-radius: 50%; background: #ffd700; border: 2px solid #ffd700;"></div>
        <div>
          <div style="color: white; font-weight: bold; font-size: 0.9rem;">You</div>
          <div style="color: #aaa; font-size: 0.75rem;">Your profile</div>
        </div>
      </div>

      <div style="display: flex; align-items: center; gap: 1rem;">
        <div style="width: 20px; height: 20px; transform: rotate(45deg); background: rgba(255,107,107,0.3); border: 2px solid #ff6b6b;"></div>
        <div>
          <div style="color: white; font-weight: bold; font-size: 0.9rem;">Project</div>
          <div style="color: #aaa; font-size: 0.75rem;">Collaborative project</div>
        </div>
      </div>
    </div>

    <!-- Node Size -->
    <div style="margin-bottom: 1.5rem;">
      <h4 style="color: #00e0ff; font-size: 0.9rem; margin-bottom: 0.75rem; text-transform: uppercase; letter-spacing: 1px;">
        Node Size
      </h4>

      <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.5rem;">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <div style="width: 12px; height: 12px; border-radius: 50%; background: #00e0ff;"></div>
          <div style="width: 16px; height: 16px; border-radius: 50%; background: #00e0ff;"></div>
          <div style="width: 20px; height: 20px; border-radius: 50%; background: #00e0ff;"></div>
        </div>
        <div style="color: #ddd; font-size: 0.85rem;">Based on connections</div>
      </div>
    </div>

    <!-- Edge Types -->
    <div style="margin-bottom: 1.5rem;">
      <h4 style="color: #00e0ff; font-size: 0.9rem; margin-bottom: 0.75rem; text-transform: uppercase; letter-spacing: 1px;">
        Connections
      </h4>

      <div style="margin-bottom: 0.75rem;">
        <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.5rem;">
          <div style="width: 40px; height: 2px; background: #00ff88;"></div>
          <div>
            <div style="color: white; font-weight: bold; font-size: 0.9rem;">Connected</div>
            <div style="color: #aaa; font-size: 0.75rem;">Accepted connection</div>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.5rem;">
          <div style="width: 40px; height: 2px; background: #ffaa00;"></div>
          <div>
            <div style="color: white; font-weight: bold; font-size: 0.9rem;">Pending</div>
            <div style="color: #aaa; font-size: 0.75rem;">Request sent</div>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.5rem;">
          <div style="width: 40px; height: 2px; background: rgba(0,224,255,0.4); border-top: 1px dashed rgba(0,224,255,0.6);"></div>
          <div>
            <div style="color: white; font-weight: bold; font-size: 0.9rem;">Suggested</div>
            <div style="color: #aaa; font-size: 0.75rem;">Potential connection</div>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.5rem;">
          <div style="width: 40px; height: 2px; background: #ff6b6b;"></div>
          <div>
            <div style="color: white; font-weight: bold; font-size: 0.9rem;">Project Member</div>
            <div style="color: #aaa; font-size: 0.75rem;">Team membership</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Interactions -->
    <div>
      <h4 style="color: #00e0ff; font-size: 0.9rem; margin-bottom: 0.75rem; text-transform: uppercase; letter-spacing: 1px;">
        Interactions
      </h4>

      <div style="color: #ddd; font-size: 0.85rem; line-height: 1.6;">
        <div style="margin-bottom: 0.5rem;">
          <i class="fas fa-mouse-pointer" style="color: #00e0ff; width: 20px;"></i>
          <strong>Click</strong> node for details
        </div>
        <div style="margin-bottom: 0.5rem;">
          <i class="fas fa-hand-pointer" style="color: #00e0ff; width: 20px;"></i>
          <strong>Hover</strong> for quick preview
        </div>
        <div style="margin-bottom: 0.5rem;">
          <i class="fas fa-search-plus" style="color: #00e0ff; width: 20px;"></i>
          <strong>Scroll</strong> to zoom
        </div>
        <div>
          <i class="fas fa-arrows-alt" style="color: #00e0ff; width: 20px;"></i>
          <strong>Drag</strong> to pan/move nodes
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(legendPanel);

  console.log('✅ Graph legend created');
}

// Show legend
export function showLegend() {
  if (!legendPanel) {
    createGraphLegend();
  }

  legendPanel.style.pointerEvents = 'all';
  setTimeout(() => {
    legendPanel.style.opacity = '1';
    legendPanel.style.transform = 'translateY(0)';
  }, 10);
}

// Hide legend
export function hideLegend() {
  if (!legendPanel) return;

  legendPanel.style.opacity = '0';
  legendPanel.style.transform = 'translateY(20px)';
  setTimeout(() => {
    legendPanel.style.pointerEvents = 'none';
  }, 300);
}

// Toggle legend
export function toggleLegend() {
  if (!legendPanel || legendPanel.style.opacity === '0' || !legendPanel.style.opacity) {
    showLegend();
  } else {
    hideLegend();
  }
}

window.showLegend = showLegend;
window.hideLegend = hideLegend;
window.toggleLegend = toggleLegend;

// Auto-show on first load
document.addEventListener('DOMContentLoaded', () => {
  const hasSeenLegend = localStorage.getItem('graph_legend_seen');

  if (!hasSeenLegend) {
    // Show legend after a delay
    setTimeout(() => {
      showLegend();
      localStorage.setItem('graph_legend_seen', 'true');

      // Auto-hide after 10 seconds
      setTimeout(() => {
        hideLegend();
      }, 10000);
    }, 2000);
  }
});

console.log('✅ Graph legend ready');
