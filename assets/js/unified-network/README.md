# Unified Network Discovery System

A physics-driven network discovery system where "My Network" and "Discovery" are emergent states rather than separate modes.

## Core Philosophy

**"Presence determines when Discovery appears; relevance determines what appears."**

The system treats nodes as actors with physical properties that respond to relevance and presence. All motion has purpose, and the graph naturally settles into calm states between interactions.

## Architecture

```
unified-network/
├── api.js              # Main API interface (UnifiedNetworkAPI)
├── types.js            # Type definitions and enums
├── constants.js        # Constants and thresholds
├── interfaces.js       # Component interfaces
├── effective-pull.js   # effectivePull calculation (Task 2)
├── relevance-engine.js # Relevance score computation (Task 3)
├── presence-tracker.js # Presence energy tracking (Task 5)
├── state-manager.js    # State transition management (Task 6)
├── physics.js          # D3 physics modifications (Task 7)
├── physics-loop.js     # Animation loop (Task 11)
├── node-renderer.js    # Node rendering (Task 9)
├── animation-engine.js # Animation system (Task 10)
├── interaction-handler.js # User interactions (Task 12)
├── action-resolver.js  # Action execution (Task 15)
├── guided-node-decay.js # Guided node decay (Task 16)
├── discovery-trigger-manager.js # Discovery triggers (Task 17)
├── temporal-presence-manager.js # Temporal presence (Task 18)
├── accessibility.js # Accessibility features (Task 21)
├── onboarding.js    # Onboarding & preferences (Task 22)
├── graph-data-store.js # Data management (Task 14)
├── index.js           # Module exports
├── README.md          # This file
└── QUICK_START.md     # Quick start guide
```

## Key Concepts

### effectivePull

The universal metric that determines all node behavior:

```javascript
effectivePull = relevanceScore × (1 + presenceEnergy)
```

- **relevanceScore** [0, 1]: Persistent value based on history, affinity, projects, themes
- **presenceEnergy** [0, 1]: Ephemeral, real-time, TTL-based value indicating active presence

### Node Behavior Categories

Based on effectivePull thresholds:

- **Static** (< 0.3): Remains in background
- **Drifting** (0.3-0.6): Drifts into peripheral awareness
- **Actionable** (0.6-0.9): Enters actionable proximity with one soft pulse
- **Priority** (≥ 0.9): Priority handling

### Presence Tiers

Expressed through physics (position, velocity, glow), never through UI badges:

- **Ambient** (0.1-0.3): Slow soft glow
- **Relevant** (0.3-0.6): Minor movement toward user
- **Actionable** (0.6-1.0): Temporary proximity + pause

### System States

- **My Network**: Stable state, existing connections, minimal motion
- **Discovery**: Emergent state, new nodes enter based on context and presence
- **Transitioning**: Smooth transition between states

## Usage

```javascript
import { unifiedNetworkApi } from './unified-network/api.js';

// Initialize
await unifiedNetworkApi.initialize('synapse-container', userId);

// Listen to events
unifiedNetworkApi.on('discovery-triggered', (data) => {
  console.log('Discovery state activated');
});

// Focus on a node
unifiedNetworkApi.focusNode(nodeId, { duration: 750, smooth: true });

// Update presence
unifiedNetworkApi.updatePresence(nodeId, 0.8, 300000); // 5 min TTL

// Execute action on a node
await unifiedNetworkApi.executeAction(nodeId, 'connect');
await unifiedNetworkApi.executeAction(projectId, 'join-project');
await unifiedNetworkApi.executeAction(themeId, 'explore-theme');

// Set discovery preferences
unifiedNetworkApi.setDiscoveryPreferences({
  frequency: 'normal', // 'low', 'normal', 'high', 'off'
  enabled: true
});

// Manually trigger discovery
unifiedNetworkApi.triggerDiscovery();

// Get temporal and collaborative boosts
const boosts = unifiedNetworkApi.getAllBoosts(nodeId);
console.log('Temporal boost:', boosts.temporal);
console.log('Collaborative boost:', boosts.collaborative);

// Check temporal priority between nodes
const shouldPrioritize = unifiedNetworkApi.shouldPrioritizeTemporal(nodeA, nodeB);

// Accessibility features are automatically enabled
// Screen reader announcements for focus changes
// Keyboard navigation: Arrow keys, Enter, Escape, Ctrl+D
// Reduced motion support (respects prefers-reduced-motion)

// Onboarding and preferences
// First-time tooltip shown automatically (one-time only)
// Discovery accessible to all users (no admin restrictions)

// Show preferences panel
unifiedNetworkApi.showPreferencesPanel();

// Check if discovery is accessible
const isAccessible = unifiedNetworkApi.isDiscoveryAccessible(); // Always true

// Get current state
const state = unifiedNetworkApi.getState();
console.log('Current mode:', state.mode);

// Cleanup
unifiedNetworkApi.destroy();
```

## Events

- `initialized` - System initialized
- `node-focused` - Node focused
- `centered-on-user` - Centered on current user
- `reset-to-my-network` - Reset to My Network state
- `discovery-triggered` - Discovery state triggered
- `node-action-requested` - User tapped a node
- `action-completed` - Action successfully executed
- `action-failed` - Action execution failed
- `graph-updated` - Graph structure changed after action
- `node-fading-out` - Guided node starting to fade
- `node-faded-out` - Guided node completely faded
- `node-dismissed` - Guided node dismissed by user
- `node-dismissed` - Guided node dismissed
- `presence-updated` - Presence energy updated
- `presence-cleared` - Presence energy cleared
- `state-changed` - System state changed
- `mode-transitioned` - Mode transition completed

## Implementation Status

- [x] Task 1: Core data structures and type definitions
- [x] Task 2: effectivePull calculation system
- [x] Task 3: Relevance score engine
- [x] Task 4: Database schema extensions
- [x] Task 5: Presence energy tracker
- [x] Task 6: State manager
- [x] Task 7: D3 physics modifications
- [x] Task 9: Node renderer
- [x] Task 10: Animation engine
- [x] Task 11: Physics loop
- [x] Task 12: Interaction handler
- [x] Task 14: Graph data store
- [ ] Task 15: Action resolution system
- [ ] Task 16: Guided node decay
- [ ] Task 17: Discovery triggers
- [ ] Task 18: Temporal presence
- [ ] Task 20: Complete API wiring
- [ ] Task 24: Dashboard integration

## Design Principles

1. **Single Physics Loop**: One unified animation system governs all node behavior
2. **effectivePull as Universal Metric**: All node behavior derives from effectivePull
3. **State as Emergence**: My Network and Discovery are emergent states, not modes
4. **Presence as Structure**: Presence affects physics, not UI
5. **Motion Resolves to Calm**: All animations settle to stillness within 15 seconds

## Mobile-First

- Thumb-reachable positioning (bottom 60% of screen)
- Minimum 44x44px tap targets
- Haptic feedback on interactions
- Adaptive frame rate (60fps active, 30fps calm)
- GPU-accelerated rendering

## Performance

- Spatial culling for off-screen nodes
- Batched DOM updates
- CSS transforms for GPU acceleration
- Adaptive frame rate based on activity
- Background pause detection

## Testing

Property-based tests validate correctness properties:

- effectivePull computation
- Node motion resolution
- State visibility rules
- Presence-based glow
- Discovery node limits
- And 36 more properties...

See `tasks.md` for complete test coverage.
