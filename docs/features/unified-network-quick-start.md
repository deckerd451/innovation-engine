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

// Execute action on a node
await unifiedNetworkApi.executeAction(nodeId, 'connect');
await unifiedNetworkApi.executeAction(projectId, 'join-project');
await unifiedNetworkApi.executeAction(themeId, 'explore-theme');

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
      
      try {
        // Execute the action through the API
        const result = await unifiedNetworkApi.executeAction(node.id, action);
        console.log('Action completed:', result);
      } catch (error) {
        console.error('Action failed:', error);
      }
    });

    unifiedNetworkApi.on('action-completed', ({ nodeId, actionType, result }) => {
      console.log(`✅ ${actionType} completed for ${nodeId}`);
      showSuccessNotification(result.message);
    });

    unifiedNetworkApi.on('action-failed', ({ nodeId, actionType, error }) => {
      console.error(`❌ ${actionType} failed for ${nodeId}:`, error);
      showErrorNotification(error);
    });

    unifiedNetworkApi.on('graph-updated', ({ nodeId, change }) => {
      console.log(`Graph updated: ${change} for ${nodeId}`);
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

### Action Events

- `action-completed` - Action successfully executed
- `action-failed` - Action execution failed
- `graph-updated` - Graph structure changed after action

## Action Resolution

The system handles three types of actions that modify the graph:

### Connect Action

Creates a connection between users:

```javascript
// Execute connect action
const result = await unifiedNetworkApi.executeAction(userId, 'connect');

// Result:
// {
//   success: true,
//   connectionId: '...',
//   status: 'pending',
//   message: 'Connection request sent'
// }

// After action:
// - Node moves from Discovery to My Network
// - relevanceScore increases by 0.3
// - effectivePull recalculated
// - Graph position updated
```

### Join Project Action

Adds user to a project:

```javascript
// Execute join-project action
const result = await unifiedNetworkApi.executeAction(projectId, 'join-project');

// Result:
// {
//   success: true,
//   participantId: '...',
//   role: 'member',
//   message: 'Joined project successfully'
// }

// After action:
// - relevanceScore increases by 0.4
// - Node marked as My Network
// - Position recalculated
// - Physics simulation restarted
```

### Explore Theme Action

Records theme exploration:

```javascript
// Execute explore-theme action
const result = await unifiedNetworkApi.executeAction(themeId, 'explore-theme');

// Result:
// {
//   success: true,
//   interactionId: '...',
//   message: 'Theme exploration recorded'
// }

// After action:
// - relevanceScore increases by 0.2
// - presenceEnergy temporarily boosted by 0.3
// - Glow intensity increased
// - TTL set for 1 minute
```

### Action Flow

1. User taps node → `node-action-requested` event
2. Call `executeAction(nodeId, actionType)`
3. ActionResolver executes database updates
4. Interaction recorded in `node_interactions` table
5. Graph state updated (relevanceScore, effectivePull)
6. `action-completed` or `action-failed` event emitted
7. `graph-updated` event emitted
8. Physics simulation restarted with new positions

## Guided Node Decay

Discovery nodes naturally fade away when ignored, preventing nagging:

### Decay Behavior

```javascript
// After 30 seconds of no interaction:
// - effectivePull reduces by 0.1 per second
// - When effectivePull < 0.3, node fades out over 2 seconds
// - Node is dismissed with 24-hour cooldown

// Listen to decay events
unifiedNetworkApi.on('node-fading-out', ({ nodeId }) => {
  console.log(`Node ${nodeId} is fading out`);
});

unifiedNetworkApi.on('node-faded-out', ({ nodeId }) => {
  console.log(`Node ${nodeId} has faded out`);
  // When all guided nodes fade, system recenters to My Network
});
```

### Manual Dismissal

```javascript
// Dismiss a guided node
unifiedNetworkApi.dismissGuidedNode(nodeId);

// Listen to dismissal
unifiedNetworkApi.on('node-dismissed', ({ nodeId, cooldownUntil }) => {
  console.log(`Node dismissed until ${new Date(cooldownUntil).toLocaleString()}`);
});
```

### Reintroduction Logic

A dismissed node can be reintroduced if:
- 24-hour cooldown has expired, OR
- relevanceScore or presenceEnergy increases by > 0.3

```javascript
import { guidedNodeDecay } from './assets/js/unified-network/index.js';

// Check if node is in cooldown
const inCooldown = guidedNodeDecay.isInCooldown(nodeId);

// Get remaining cooldown time
const remaining = guidedNodeDecay.getRemainingCooldown(nodeId); // milliseconds

// Check if can reintroduce
const canReintroduce = guidedNodeDecay.canReintroduce(
  nodeId,
  currentRelevanceScore,
  currentPresenceEnergy
);
```

### Interaction Resets Decay

Any interaction with a guided node resets its decay timer:

```javascript
// These actions reset the decay timer:
// - Tapping the node
// - Executing an action
// - Focusing on the node

// The node gets a fresh 30 seconds before decay starts again
```

## Discovery Triggers

The system automatically triggers discovery mode based on multiple conditions.

### Automatic Triggers

```javascript
// Discovery triggers when:
// 1. Low momentum: velocity < 0.1 for 5 seconds
// 2. No strong actions: no nodes with effectivePull > 0.7
// 3. Relevant presence: any node with presenceEnergy > 0.6
// 4. Temporal opportunities: deadlines within 48 hours
// 5. Inactivity: 30+ minutes without new connections
// 6. Small graph: < 5 nodes (triggers more frequently)

// Listen to discovery triggers
unifiedNetworkApi.on('discovery-triggered', ({ reasons, timestamp }) => {
  console.log('Discovery triggered by:', reasons);
  // reasons: ['momentum', 'presence', 'temporal', etc.]
});
```

### Manual Discovery

```javascript
// Force discovery mode
unifiedNetworkApi.triggerDiscovery();
```

### Discovery Preferences

```javascript
// Set user preferences
unifiedNetworkApi.setDiscoveryPreferences({
  frequency: 'normal', // 'low', 'normal', 'high', 'off'
  enabled: true
});

// Get current preferences
const prefs = unifiedNetworkApi.getDiscoveryPreferences();
console.log('Frequency:', prefs.frequency);
console.log('Enabled:', prefs.enabled);

// Listen to preference changes
unifiedNetworkApi.on('discovery-preferences-updated', (prefs) => {
  console.log('Preferences updated:', prefs);
});
```

### Frequency Settings

- **low**: Discovery every 4 minutes (minimum)
- **normal**: Discovery every 2 minutes (minimum)
- **high**: Discovery every 1 minute (minimum)
- **off**: Discovery disabled

For small graphs (< 5 nodes), frequency is automatically increased by 50%.

### Rate Limiting

```javascript
// Discovery is rate-limited to prevent overwhelming users
// Minimum interval between discoveries:
// - Normal: 2 minutes
// - Low: 4 minutes
// - High: 1 minute
// - Small graphs: 50% faster than normal setting
```

## Temporal and Collaborative Presence

The system automatically boosts presence for time-sensitive opportunities and collaborative activities.

### Temporal Boosts (with expiration)

```javascript
// Automatic temporal boosts:
// 1. Deadline urgency: +0.5 presence when deadline within 48 hours
// 2. Expires immediately when deadline passes

// Listen to temporal boost events
unifiedNetworkApi.on('temporal-boost-applied', ({ nodeId, boost, expiresAt, reason }) => {
  console.log(`Temporal boost: ${nodeId} +${boost} (${reason})`);
  console.log(`Expires: ${new Date(expiresAt).toLocaleString()}`);
});

unifiedNetworkApi.on('temporal-boost-removed', ({ nodeId, reason }) => {
  console.log(`Temporal boost removed: ${nodeId} (${reason})`);
});

// Query temporal boost
const temporalBoost = unifiedNetworkApi.getTemporalBoost(nodeId);
if (temporalBoost) {
  console.log('Boost:', temporalBoost.boost);
  console.log('Expires:', new Date(temporalBoost.expiresAt).toLocaleString());
  console.log('Reason:', temporalBoost.reason);
}
```

### Collaborative Boosts (no expiration)

```javascript
// Automatic collaborative boosts:
// 1. Shared interest: +0.4 when connection actively working on shared interest
// 2. Collective theme: +0.3 when theme has > 3 active participants (presenceEnergy > 0.5)

// Listen to collaborative boost events
unifiedNetworkApi.on('collaborative-boost-applied', ({ nodeId, boost, reason, metadata }) => {
  console.log(`Collaborative boost: ${nodeId} +${boost} (${reason})`);
  console.log('Metadata:', metadata);
});

unifiedNetworkApi.on('collaborative-boost-removed', ({ nodeId, reason }) => {
  console.log(`Collaborative boost removed: ${nodeId} (${reason})`);
});

// Query collaborative boost
const collaborativeBoost = unifiedNetworkApi.getCollaborativeBoost(nodeId);
if (collaborativeBoost) {
  console.log('Boost:', collaborativeBoost.boost);
  console.log('Reason:', collaborativeBoost.reason);
  console.log('Metadata:', collaborativeBoost.metadata);
}
```

### Query All Boosts

```javascript
// Get both temporal and collaborative boosts
const allBoosts = unifiedNetworkApi.getAllBoosts(nodeId);

if (allBoosts.temporal) {
  console.log('Temporal:', allBoosts.temporal);
}

if (allBoosts.collaborative) {
  console.log('Collaborative:', allBoosts.collaborative);
}
```

### Temporal Priority

```javascript
// When two nodes have effectivePull within 0.1 of each other,
// temporal opportunities are prioritized

const nodeA = { id: 'a', effectivePull: 0.75 };
const nodeB = { id: 'b', effectivePull: 0.78 };

const shouldPrioritize = unifiedNetworkApi.shouldPrioritizeTemporal(nodeA, nodeB);
// Returns true if nodeA has temporal boost and nodeB doesn't
// (and effectivePull difference < 0.1)
```

### Boost Combinations

```javascript
// Boosts stack additively (capped at 1.0):
// presenceEnergy = baseEnergy + temporalBoost + collaborativeBoost

// Example:
// - Base presence: 0.3
// - Deadline boost: +0.5
// - Shared interest: +0.4
// - Total: min(1.0, 0.3 + 0.5 + 0.4) = 1.0

// effectivePull is then recalculated:
// effectivePull = relevanceScore × (1 + presenceEnergy)
```

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
