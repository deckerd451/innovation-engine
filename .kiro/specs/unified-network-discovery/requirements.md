# Requirements Document: Unified Network Discovery

## Introduction

This document specifies the requirements for transforming the existing "My Network" and "Discovery" views into a unified physics-driven system where discovery emerges naturally based on context, momentum, and real-time presence. The system eliminates mode selection in favor of dynamic state transitions driven by a unified physics model where presence is structural (affects physics) rather than decorative (badges/labels).

## Glossary

- **System**: The unified network discovery interface
- **Node**: A visual representation of a person, project, theme, or organization in the graph
- **My_Network_State**: The default stable state showing existing connections with minimal motion
- **Discovery_State**: An emergent state where new nodes enter the space based on context and presence
- **effectivePull**: A computed value (relevanceScore × (1 + presenceEnergy)) that determines node behavior
- **relevanceScore**: A persistent value (0-1) based on history, affinity, projects, and themes
- **presenceEnergy**: An ephemeral, real-time, TTL-based value (0-1) indicating active presence
- **Guided_Node**: A discovery node with high effectivePull that enters actionable proximity
- **Physics_Loop**: The unified animation system that governs all node motion and behavior
- **Actionable_Proximity**: The spatial zone where nodes can be easily tapped (thumb-reachable on mobile)
- **Presence_Tier**: A classification of presence intensity (Ambient, Relevant, Actionable) expressed through physics

## Requirements

### Requirement 1: Unified Physics Model

**User Story:** As a user, I want the graph to feel alive and responsive, so that I understand why nodes move and what they represent without explicit labels.

#### Acceptance Criteria

1. THE System SHALL compute effectivePull for each node as relevanceScore × (1 + presenceEnergy)
2. WHEN a node has low effectivePull (< 0.3), THE System SHALL render it as static background
3. WHEN a node has medium effectivePull (0.3-0.6), THE System SHALL drift it into peripheral awareness
4. WHEN a node has high effectivePull (0.6-0.9), THE System SHALL move it into actionable proximity with one soft pulse
5. WHEN a node reaches actionable proximity, THE System SHALL transition it to stillness after the pulse
6. THE System SHALL use a single Physics_Loop for all node motion and animation

### Requirement 2: My Network State (Stable State)

**User Story:** As a user, I want my existing connections to feel calm and familiar, so that I have a stable foundation to return to.

#### Acceptance Criteria

1. WHEN the user has not interacted with the graph for 3 seconds, THE System SHALL transition to My_Network_State
2. WHILE in My_Network_State, THE System SHALL display only existing connection nodes
3. WHILE in My_Network_State, THE System SHALL minimize node motion to ambient drift
4. WHILE in My_Network_State, THE System SHALL apply a soft ambient glow to nodes with presenceEnergy > 0
5. WHEN a node in My_Network_State has presenceEnergy > 0.5, THE System SHALL increase glow intensity proportionally

### Requirement 3: Discovery State (Emergent State)

**User Story:** As a user, I want to discover new connections naturally without switching modes, so that opportunities emerge when I'm ready for them.

#### Acceptance Criteria

1. WHEN the System detects low momentum (velocity < 0.1 for 5 seconds), THE System SHALL transition to Discovery_State
2. WHEN the System detects absence of strong next action (no nodes with effectivePull > 0.7), THE System SHALL transition to Discovery_State
3. WHEN relevant real-time presence exists (presenceEnergy > 0.6 for any potential connection), THE System SHALL transition to Discovery_State
4. WHEN in Discovery_State, THE System SHALL introduce new nodes into the same space as My_Network nodes
5. WHEN introducing discovery nodes, THE System SHALL apply temporary physics shifts to guide them into view
6. THE System SHALL limit Discovery_State to a maximum of 3 Guided_Nodes simultaneously
7. THE System SHALL limit Discovery_State to a maximum of 1 presence-amplified node (presenceEnergy > 0.8) simultaneously

### Requirement 4: Presence Tiers and Physics Expression

**User Story:** As a user, I want to sense when others are active and relevant without explicit online indicators, so that the interface feels organic and respectful.

#### Acceptance Criteria

1. WHEN a node has presenceEnergy between 0.1 and 0.3 (Ambient tier), THE System SHALL apply a slow soft glow
2. WHEN a node has presenceEnergy between 0.3 and 0.6 (Relevant tier), THE System SHALL apply minor movement toward the user's focus
3. WHEN a node has presenceEnergy between 0.6 and 1.0 (Actionable tier), THE System SHALL move it to temporary proximity and pause with one soft pulse
4. THE System SHALL express all presence tiers through physics properties (position, velocity, glow) without UI badges or labels
5. WHEN presenceEnergy expires (TTL reached), THE System SHALL decay the value to 0 over 2 seconds

### Requirement 5: Relevance Score Computation

**User Story:** As a user, I want the system to understand my interests and connections, so that relevant nodes naturally come into focus.

#### Acceptance Criteria

1. THE System SHALL compute relevanceScore based on connection history, shared projects, shared themes, and interaction frequency
2. WHEN a user shares 2 or more themes with a potential connection, THE System SHALL increase relevanceScore by 0.2
3. WHEN a user shares 1 or more projects with a potential connection, THE System SHALL increase relevanceScore by 0.3
4. WHEN a user has interacted with a node in the past 7 days, THE System SHALL increase relevanceScore by 0.15
5. THE System SHALL normalize relevanceScore to the range [0, 1]
6. THE System SHALL recalculate relevanceScore when user interactions, projects, or themes change

### Requirement 6: Action Resolution and Graph Changes

**User Story:** As a user, I want my actions to have visible consequences in the graph, so that I understand the impact of my interactions.

#### Acceptance Criteria

1. WHEN a user taps a Guided_Node, THE System SHALL present a concrete action (connect, join project, explore theme)
2. WHEN a user completes an action on a Guided_Node, THE System SHALL update the graph to reflect the change
3. WHEN a new connection is made, THE System SHALL move the node into My_Network_State with a smooth transition
4. WHEN a user joins a project through a Guided_Node, THE System SHALL update the node's position to reflect the new relationship
5. WHEN a user explores a theme through a Guided_Node, THE System SHALL adjust the node's glow and position based on the new context

### Requirement 7: Decay and Respect

**User Story:** As a user, I want ignored suggestions to fade away naturally, so that I'm not nagged by the system.

#### Acceptance Criteria

1. WHEN a Guided_Node is not interacted with for 30 seconds, THE System SHALL reduce its effectivePull by 0.1 per second
2. WHEN a Guided_Node's effectivePull falls below 0.3, THE System SHALL fade it back to the background over 2 seconds
3. WHEN all Guided_Nodes have faded, THE System SHALL recenter My_Network_State
4. WHEN presenceEnergy TTL expires, THE System SHALL automatically decay presenceEnergy to 0
5. THE System SHALL NOT re-introduce the same Guided_Node within 24 hours unless presenceEnergy or relevanceScore increases significantly (> 0.3 change)

### Requirement 8: Mobile-First Interaction

**User Story:** As a mobile user, I want all interactions to be thumb-reachable and responsive, so that I can use the app comfortably with one hand.

#### Acceptance Criteria

1. WHEN a node enters Actionable_Proximity, THE System SHALL position it within thumb-reachable distance (bottom 60% of screen)
2. WHEN multiple nodes compete for Actionable_Proximity, THE System SHALL prioritize the node with highest effectivePull
3. THE System SHALL ensure tap targets are at least 44x44 pixels for all interactive nodes
4. WHEN a user taps a node, THE System SHALL provide haptic feedback (if available) within 50ms
5. THE System SHALL render all animations at 60fps on mobile devices

### Requirement 9: Session-Based Presence

**User Story:** As a user, I want presence to reflect current activity without permanent online status, so that my privacy is respected.

#### Acceptance Criteria

1. THE System SHALL compute presenceEnergy based on current session activity only
2. WHEN a user's session ends, THE System SHALL set their presenceEnergy to 0 for all other users
3. THE System SHALL NOT persist presenceEnergy beyond the current session
4. WHEN a user is actively viewing a theme or project, THE System SHALL set presenceEnergy to 0.8 for related nodes
5. WHEN a user is idle for 5 minutes, THE System SHALL decay their presenceEnergy by 0.5

### Requirement 10: Discovery Accessibility

**User Story:** As a non-admin user, I want access to discovery features, so that I can find new connections and opportunities.

#### Acceptance Criteria

1. THE System SHALL make Discovery_State accessible to all authenticated users
2. THE System SHALL NOT require admin privileges to view Guided_Nodes
3. WHEN a user first logs in, THE System SHALL display a brief tooltip explaining how discovery works (one-time only)
4. THE System SHALL allow users to dismiss Guided_Nodes without penalty
5. THE System SHALL respect user preferences for discovery frequency (if configured)

### Requirement 11: Motion Resolution and Calm

**User Story:** As a user, I want the graph to settle into calm states, so that I'm not overwhelmed by constant motion.

#### Acceptance Criteria

1. WHEN no user interaction occurs for 10 seconds, THE System SHALL reduce all node velocities to near-zero (< 0.05)
2. WHEN all nodes reach near-zero velocity, THE System SHALL enter a calm state with only ambient glow animations
3. WHEN in calm state, THE System SHALL limit animation updates to 30fps to conserve battery
4. WHEN a user interacts with the graph, THE System SHALL immediately return to 60fps rendering
5. THE System SHALL ensure all motion resolves to calm within 15 seconds of the last interaction

### Requirement 12: Context-Aware Discovery Triggers

**User Story:** As a user, I want discovery to appear when it makes sense, so that suggestions feel timely and relevant.

#### Acceptance Criteria

1. WHEN a user completes a project milestone, THE System SHALL increase presenceEnergy for related theme nodes by 0.4
2. WHEN a user views a specific theme for more than 10 seconds, THE System SHALL increase presenceEnergy for related person nodes by 0.3
3. WHEN a user's connection graph has fewer than 5 nodes, THE System SHALL increase the frequency of Discovery_State transitions
4. WHEN a user has been active for more than 30 minutes without new connections, THE System SHALL trigger Discovery_State
5. THE System SHALL NOT trigger Discovery_State more than once every 2 minutes

### Requirement 13: Temporal Opportunity Detection

**User Story:** As a user, I want to discover opportunities that are time-sensitive, so that I don't miss important moments.

#### Acceptance Criteria

1. WHEN an event or project has a deadline within 48 hours, THE System SHALL increase its presenceEnergy by 0.5
2. WHEN a user's connection is actively working on a shared interest, THE System SHALL increase presenceEnergy for that connection by 0.4
3. WHEN a theme has multiple active participants (> 3 with presenceEnergy > 0.5), THE System SHALL increase the theme node's presenceEnergy by 0.3
4. THE System SHALL prioritize temporal opportunities over static relevance when effectivePull values are within 0.1 of each other
5. WHEN a temporal opportunity expires, THE System SHALL immediately decay its presenceEnergy to 0

### Requirement 14: Physics Transition Smoothness

**User Story:** As a user, I want all state transitions to feel smooth and natural, so that the interface doesn't feel jarring.

#### Acceptance Criteria

1. WHEN transitioning from My_Network_State to Discovery_State, THE System SHALL fade in new nodes over 1.5 seconds
2. WHEN transitioning from Discovery_State to My_Network_State, THE System SHALL fade out discovery nodes over 2 seconds
3. WHEN a node's effectivePull changes, THE System SHALL interpolate its position over 1 second using easing functions
4. THE System SHALL use cubic-bezier easing (0.4, 0.0, 0.2, 1) for all position transitions
5. WHEN multiple nodes transition simultaneously, THE System SHALL stagger their animations by 100ms to avoid visual clutter

### Requirement 15: Performance and Battery Optimization

**User Story:** As a mobile user, I want the app to be responsive and battery-efficient, so that I can use it throughout the day.

#### Acceptance Criteria

1. THE System SHALL limit Physics_Loop updates to 60fps during active interaction
2. THE System SHALL reduce Physics_Loop updates to 30fps during calm state
3. THE System SHALL pause Physics_Loop updates when the app is in the background
4. THE System SHALL use requestAnimationFrame for all animation scheduling
5. THE System SHALL batch DOM updates to minimize reflows and repaints
6. THE System SHALL use CSS transforms for node positioning to leverage GPU acceleration
7. WHEN rendering more than 50 nodes, THE System SHALL implement spatial culling to skip off-screen calculations
