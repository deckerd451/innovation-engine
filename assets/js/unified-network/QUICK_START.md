# Unified Network Discovery - Quick Start Guide

## Installation

The Unified Network Discovery system is already integrated into your project. All modules are located in `assets/js/unified-network/`.

## Basic Usage

### 1. Import the API

```javascript
import { unifiedNetworkApi } from './assets/js/unified-network/index.js';
```

### 2. Initialize the System

```javascript
// Get current user ID from your auth system
const userId = window.currentUserCommunityId;

// Initialize the unified network
await unifiedNetworkApi.initialize('synapse-svg', userId);
```

### 3. Listen to Events

```javascript
// Node action requested
unifiedNetworkApi.on('node-action-requested', ({ node, action }) => {
  console.log(`Action ${action} requested for node ${node.id}`);
  
  // Handle the action
  if (action === 'connect') {
    // Connect to user
  } else if (action === 'join-project') {
    // Join project
  } else if (action === 'explore-theme') {
    // Explore theme
  }
});

// Discovery triggered
unifiedNetworkApi.on('discovery-triggered', () => {
  console.log('Discovery mode activated');
});

// State changed
unifiedNetworkApi.on('mode-changed', ({ mode }) => {
  console.log('Mode changed to:', mode);
});
```

### 4. Interact with the System

```javascript
// Get current state
const state = unifiedNetworkApi.getState();
console.log('Current mode:', state.mode);

// Focus on a node
unifiedNetworkApi.focusNode(nodeId, { duration: 750, smooth: true });

// Center on current user
unifiedNetworkApi.centerOnCurrentUser();

// Manually trigger discovery
unifiedNetworkApi.triggerDiscovery();

// Update presence for a node
unifiedNetworkApi.updatePresence(nodeId, 0.8, 300000); // 5 min TTL

// Dismiss a guided node
unifiedNetworkApi.dismissGuidedNode(nodeId);
```

### 5. Cleanup

```javascript
// When done, cleanup
unifiedNetworkApi.destroy();
```

## Complete Example

```javascript
import { unifiedNetworkApi } from './assets/js/unified-network/index.js';

async function initializeUnifiedNetwork() {
  try {
    // Get user ID
    const userId = window.currentUserCommunityId;
    if (!userId) {
      console.error('User not authenticated');
      return;
    }

    // Initialize
    await unifiedNetworkApi.initialize('synapse-svg', userId);

    // Setup event handlers
    unifiedNetworkApi.on('node-action-requested', async ({ node, action }) => {
      console.log(`Executing ${action} on ${node.name}`);
      
      switch (action) {
        case 'connect':
          await connectToUser(node.id);
          break;
        case 'join-project':
          await joinProject(node.id);
          break;
        case 'explore-theme':
          await exploreTheme(node.id);
          break;
      }
    });

    unifiedNetworkApi.on('mode-changed', ({ mode }) => {
      updateUIForMode(mode);
    });

    console.log('✅ Unified Network initialized');
  } catch (error) {
    console.error('❌ Failed to initialize:', error);
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', initializeUnifiedNetwork);
```

## Key Concepts

### effectivePull

The core metric that drives all node behavior:

```
effectivePull = relevanceScore × (1 + presenceEnergy)
```

- **relevanceScore** [0, 1]: Persistent, based on connections, projects, themes
- **presenceEnergy** [0, 1]: Ephemeral, real-time, TTL-based

### Node Categories

Based on effectivePull:

- **Static** (< 0.3): Background nodes
- **Drifting** (0.3-0.6): Peripheral awareness
- **Actionable** (0.6-0.9): Enters thumb-reachable zone
- **Priority** (≥ 0.9): Highest priority

### Presence Tiers

Expressed through physics (glow, position):

- **Ambient** (0.1-0.3): Soft glow
- **Relevant** (0.3-0.6): Movement toward user
- **Actionable** (0.6-1.0): Proximity + pause

### System States

- **My Network**: Stable state, existing connections
- **Discovery**: Emergent state, new opportunities
- **Transitioning**: Smooth transition between states

## Events

### System Events

- `initialized` - System initialized
- `mode-changed` - Mode transitioned
- `mode-changing` - Mode transition starting

### Node Events

- `node-action-requested` - User tapped a node
- `node-focused` - Node focused
- `node-dismissed` - Guided node dismissed

### State Events

- `discovery-triggered` - Discovery manually triggered
- `reset-to-my-network` - Reset to My Network
- `guided-nodes-updated` - Guided nodes changed

### Presence Events

- `presence-updated` - Presence energy updated
- `presence-cleared` - Presence cleared

## Advanced Usage

### Custom Presence Boosts

```javascript
// Boost presence when user completes milestone
unifiedNetworkApi.updatePresence(
  relatedNodeId,
  0.8,
  600000 // 10 min TTL
);
```

### Query System State

```javascript
const state = unifiedNetworkApi.getState();

console.log('Mode:', state.mode);
console.log('Guided nodes:', state.guidedNodes);
console.log('Average velocity:', state.averageVelocity);
console.log('Is calm:', state.isCalm);
console.log('FPS:', state.fps);
```

### Access Individual Components

```javascript
import {
  graphDataStore,
  relevanceScoreEngine,
  presenceEnergyTracker,
  stateManager,
  effectivePullCalculator
} from './assets/js/unified-network/index.js';

// Get relevance score
const score = relevanceScoreEngine.computeScore(userId, targetId);

// Get presence energy
const energy = presenceEnergyTracker.getEnergy(nodeId);

// Calculate effectivePull
const pull = effectivePullCalculator.compute(node);
```

## Troubleshooting

### System not initializing

- Check that Supabase client is available: `window.supabase`
- Check that D3 is loaded: `window.d3`
- Check that SVG container exists: `document.getElementById('synapse-svg')`

### Nodes not moving

- Check that physics loop is running: `physicsLoop.isRunning()`
- Check that simulation exists: `window.synapseSimulation`
- Check node effectivePull values

### Discovery not triggering

- Check state manager conditions
- Verify presence energy is being tracked
- Check rate limiting (2 min minimum between transitions)

### Performance issues

- Check FPS: `unifiedNetworkApi.getState().fps`
- Verify spatial culling is working
- Check node count: `unifiedNetworkApi.getAllNodes().length`

## Next Steps

- See `README.md` for architecture overview
- See `design.md` for detailed design
- See `requirements.md` for specifications
- See `tasks.md` for implementation plan
