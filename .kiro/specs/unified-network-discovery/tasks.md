# Implementation Plan: Unified Network Discovery

## Overview

This implementation plan transforms the existing "My Network" and "Discovery" views into a unified physics-driven system. The approach builds incrementally, starting with core data structures and physics modifications, then adding state management, presence tracking, and finally mobile optimizations. Each task includes property-based tests to validate correctness properties from the design.

## Tasks

- [x] 1. Set up core data structures and type definitions
  - Create TypeScript interfaces for Node, Edge, SystemState, PresenceTier
  - Define UnifiedNetworkAPI interface
  - Set up RelevanceScoreEngine and PresenceEnergyTracker interfaces
  - Create constants file for animation timings and thresholds
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [ ] 2. Implement effectivePull calculation system
  - [x] 2.1 Create effectivePull calculator module
    - Implement `computeEffectivePull(node: Node): number` function
    - Implement `categorizeNode(effectivePull: number): NodeCategory` function
    - Add caching for computed values
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  
  - [ ]* 2.2 Write property test for effectivePull computation
    - **Property 1: effectivePull Computation**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
    - Generate random relevanceScore and presenceEnergy values
    - Verify formula: effectivePull = relevanceScore × (1 + presenceEnergy)
    - Verify behavior categorization thresholds

- [ ] 3. Implement relevance score engine
  - [x] 3.1 Create RelevanceScoreEngine class
    - Implement connection history scoring (0.15 weight)
    - Implement shared projects scoring (0.3 weight)
    - Implement shared themes scoring (0.2 weight)
    - Implement interaction frequency scoring (0.15 weight)
    - Implement temporal opportunity scoring (0.2 weight)
    - Add score normalization to [0, 1] range
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  
  - [ ]* 3.2 Write property tests for relevance scoring
    - **Property 10: Relevance Score Normalization**
    - **Property 12: Shared Theme Scoring**
    - **Property 13: Shared Project Scoring**
    - **Property 14: Recent Interaction Scoring**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**
    - Generate random user pairs with various shared attributes
    - Verify score components and normalization


- [ ] 4. Create database schema extensions
  - [x] 4.1 Create presence_sessions table migration
    - Write SQL migration for presence_sessions table
    - Add indexes for active presence queries
    - Add TTL-based cleanup trigger
    - _Requirements: 9.1, 9.2, 9.3_
  
  - [x] 4.2 Create node_interactions table migration
    - Write SQL migration for node_interactions table
    - Add indexes for user and node queries
    - _Requirements: 5.4, 5.6_
  
  - [x] 4.3 Create discovery_dismissals table migration
    - Write SQL migration for discovery_dismissals table
    - Add unique constraint on (user_id, node_id)
    - Add index for reintroduction queries
    - _Requirements: 7.5_

- [ ] 5. Implement presence energy tracker
  - [x] 5.1 Create PresenceEnergyTracker class
    - Implement real-time subscription to Supabase presence
    - Implement TTL-based decay mechanism
    - Implement presence tier calculation (Ambient, Relevant, Actionable)
    - Add session-based presence computation
    - Add error handling with polling fallback
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 9.1, 9.2, 9.3, 9.4_
  
  - [ ]* 5.2 Write property tests for presence tracking
    - **Property 5: Presence-Based Glow**
    - **Property 9: Presence Energy Decay**
    - **Property 25: Session-Based Presence**
    - **Property 26: Active View Presence**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.5, 9.1, 9.3, 9.4**
    - Generate random presenceEnergy values and verify tier classification
    - Test decay timing and rate
    - Verify session-only computation

- [ ] 6. Implement state manager
  - [x] 6.1 Create StateManager class
    - Implement state tracking (My Network, Discovery, Transitioning)
    - Implement transition trigger detection (momentum, presence, user action)
    - Implement guided node limit enforcement (max 3, max 1 presence-amplified)
    - Add state transition coordination
    - _Requirements: 2.1, 3.1, 3.2, 3.3, 3.6, 3.7, 7.3_
  
  - [ ]* 6.2 Write property tests for state management
    - **Property 3: My Network State Visibility**
    - **Property 6: Discovery Node Limit**
    - **Validates: Requirements 2.2, 3.6, 3.7**
    - Generate random node sets and verify visibility rules
    - Verify guided node count limits


- [ ] 7. Modify D3 physics simulation
  - [x] 7.1 Implement effectivePull-based force adjustments
    - Modify link strength based on effectivePull
    - Add radial force for guided nodes (thumb-reachable positioning)
    - Adjust charge force based on effectivePull
    - Implement spatial integration for discovery nodes
    - _Requirements: 1.2, 1.3, 1.4, 3.4, 3.5, 8.1_
  
  - [x] 7.2 Implement motion decay and calm state
    - Add velocity decay when no interaction
    - Implement calm state detection (velocity < 0.05)
    - Add maximum settle time enforcement (15 seconds)
    - _Requirements: 1.5, 2.3, 11.1, 11.2, 11.5_
  
  - [ ]* 7.3 Write property tests for physics behavior
    - **Property 2: Node Motion Resolution**
    - **Property 4: Ambient Motion Constraint**
    - **Property 7: Discovery Node Spatial Integration**
    - **Validates: Requirements 1.5, 2.3, 3.4, 3.5, 11.1, 11.5**
    - Generate nodes with various effectivePull values
    - Verify motion decay and positioning

- [ ] 8. Checkpoint - Ensure core physics and state management work
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Implement node renderer
  - [x] 9.1 Create NodeRenderer class
    - Implement visual state calculation (radius, opacity, glow, scale)
    - Implement distance-based dimming for focused nodes
    - Add GPU-accelerated positioning (CSS transforms)
    - Implement spatial culling for off-screen nodes
    - Add presence tier visualization (glow only, no badges)
    - _Requirements: 2.4, 2.5, 4.4, 8.3, 15.6, 15.7_
  
  - [ ]* 9.2 Write property tests for rendering
    - **Property 8: Presence Physics Expression**
    - **Property 24: Minimum Tap Target Size**
    - **Property 40: GPU-Accelerated Positioning**
    - **Property 41: Spatial Culling**
    - **Validates: Requirements 4.4, 8.3, 15.6, 15.7**
    - Verify no badge/label elements exist for presence
    - Verify tap target sizes
    - Verify CSS transform usage
    - Test culling with > 50 nodes


- [ ] 10. Implement animation engine
  - [x] 10.1 Create AnimationEngine class
    - Implement position interpolation with cubic-bezier easing
    - Implement fade in/out for discovery nodes
    - Implement glow pulse animations
    - Add animation staggering for simultaneous transitions
    - Implement presence decay animations
    - _Requirements: 3.5, 4.5, 7.2, 14.1, 14.2, 14.3, 14.4, 14.5_
  
  - [ ]* 10.2 Write property tests for animations
    - **Property 36: Position Interpolation**
    - **Property 37: Animation Staggering**
    - **Validates: Requirements 14.3, 14.4, 14.5**
    - Verify easing function correctness
    - Verify stagger timing (100ms delays)

- [ ] 11. Implement physics loop with adaptive frame rate
  - [x] 11.1 Create PhysicsLoop class
    - Implement requestAnimationFrame-based loop
    - Add adaptive frame rate (60fps active, 30fps calm)
    - Implement background pause detection
    - Add frame time tracking and performance monitoring
    - Integrate with D3 simulation tick
    - _Requirements: 11.3, 11.4, 15.1, 15.2, 15.3, 15.4_
  
  - [ ]* 11.2 Write property tests for frame rate management
    - **Property 38: Adaptive Frame Rate**
    - **Property 39: requestAnimationFrame Usage**
    - **Validates: Requirements 11.3, 11.4, 15.1, 15.2, 15.4**
    - Verify frame rate switches based on interaction state
    - Verify requestAnimationFrame is used

- [ ] 12. Implement interaction handler
  - [x] 12.1 Create InteractionHandler class
    - Implement tap/click event processing
    - Add haptic feedback for mobile
    - Implement minimum tap target size enforcement
    - Add thumb-reachable zone positioning
    - Implement action presentation (connect, join, explore)
    - Add dismissal handling
    - _Requirements: 6.1, 6.4, 6.5, 8.1, 8.2, 8.3, 8.4, 10.4_
  
  - [ ]* 12.2 Write property tests for interactions
    - **Property 15: Action Presentation**
    - **Property 22: Thumb-Reachable Positioning**
    - **Property 23: Actionable Proximity Prioritization**
    - **Property 28: Dismissal Without Penalty**
    - **Validates: Requirements 6.1, 8.1, 8.2, 10.4**
    - Generate random node sets and verify action selection
    - Verify positioning constraints
    - Verify dismissal doesn't affect scores


- [ ] 13. Checkpoint - Ensure rendering and interaction work
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 14. Implement graph data store
  - [x] 14.1 Create GraphDataStore class
    - Implement Supabase integration for nodes and edges
    - Add caching for computed values (relevanceScore, effectivePull)
    - Implement data synchronization and updates
    - Add query interface for node relationships
    - Implement error handling with fallback to cached data
    - _Requirements: 5.6, 6.2, 6.3_
  
  - [ ]* 14.2 Write property tests for data management
    - **Property 11: Relevance Score Reactivity**
    - **Property 16: Graph Update on Action**
    - **Property 17: Connection State Transition**
    - **Validates: Requirements 5.6, 6.2, 6.3**
    - Verify recalculation triggers
    - Verify graph updates after actions

- [ ] 15. Implement action resolution system
  - [ ] 15.1 Create ActionResolver class
    - Implement connection action (update connections table)
    - Implement project join action (update project_participants)
    - Implement theme exploration action (update theme interactions)
    - Add graph update coordination after actions
    - Implement position recalculation after state changes
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  
  - [ ]* 15.2 Write property tests for action resolution
    - **Property 18: Project Join Position Update**
    - **Property 19: Theme Exploration Visual Update**
    - **Validates: Requirements 6.4, 6.5**
    - Verify position changes after actions
    - Verify visual property updates

- [ ] 16. Implement guided node decay system
  - [ ] 16.1 Create GuidedNodeDecay module
    - Implement time-based effectivePull decay (0.1 per second after 30s)
    - Implement fade-out animation when effectivePull < 0.3
    - Add dismissal cooldown tracking (24 hours)
    - Implement reintroduction logic (only if score increases > 0.3)
    - _Requirements: 7.1, 7.2, 7.5_
  
  - [ ]* 16.2 Write property tests for decay
    - **Property 20: Guided Node Decay**
    - **Property 21: Dismissal Cooldown**
    - **Validates: Requirements 7.1, 7.2, 7.5**
    - Verify decay rate and timing
    - Verify cooldown enforcement


- [ ] 17. Implement discovery triggers and frequency management
  - [ ] 17.1 Create DiscoveryTriggerManager class
    - Implement momentum detection (velocity < 0.1 for 5 seconds)
    - Implement strong action absence detection (no effectivePull > 0.7)
    - Implement relevant presence detection (presenceEnergy > 0.6)
    - Implement temporal opportunity detection (deadlines within 48 hours)
    - Add rate limiting (minimum 2 minutes between transitions)
    - Implement adaptive frequency for small graphs (< 5 nodes)
    - Add user preference support for discovery frequency
    - _Requirements: 3.1, 3.2, 3.3, 10.5, 12.3, 12.4, 12.5, 13.1_
  
  - [ ]* 17.2 Write property tests for discovery triggers
    - **Property 29: Discovery Frequency Preferences**
    - **Property 30: Adaptive Discovery Frequency**
    - **Property 31: Discovery Rate Limiting**
    - **Validates: Requirements 10.5, 12.3, 12.5**
    - Verify frequency matches preferences
    - Verify adaptive behavior for small graphs
    - Verify rate limiting

- [ ] 18. Implement temporal and collaborative presence
  - [ ] 18.1 Create TemporalPresenceManager class
    - Implement deadline urgency detection (within 48 hours)
    - Implement collaborative presence tracking (shared interests)
    - Implement collective theme presence (> 3 active participants)
    - Add temporal priority logic (within 0.1 effectivePull)
    - Implement immediate decay on expiration
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_
  
  - [ ]* 18.2 Write property tests for temporal presence
    - **Property 32: Deadline Urgency Presence**
    - **Property 33: Collaborative Presence**
    - **Property 34: Collective Theme Presence**
    - **Property 35: Temporal Priority**
    - **Validates: Requirements 13.1, 13.2, 13.3, 13.4**
    - Generate random deadlines and verify presence increases
    - Verify collaborative and collective presence logic
    - Verify temporal prioritization

- [ ] 19. Checkpoint - Ensure discovery and presence systems work
  - Ensure all tests pass, ask the user if questions arise.


- [ ] 20. Implement UnifiedNetworkAPI
  - [x] 20.1 Create UnifiedNetworkAPI class
    - Implement initialization and cleanup methods
    - Implement state query methods (getState, getNode, getAllNodes)
    - Implement focus and navigation methods (focusNode, centerOnCurrentUser, resetToMyNetwork)
    - Implement discovery control methods (triggerDiscovery, dismissGuidedNode)
    - Implement presence management methods (updatePresence, clearPresence)
    - Add event system (on, off, emit)
    - Wire all components together
    - _Requirements: All requirements_
  
  - [ ]* 20.2 Write integration tests for API
    - Test initialization flow
    - Test state transitions
    - Test focus and navigation
    - Test discovery triggers
    - Test presence updates
    - Test event emission

- [ ] 21. Implement accessibility features
  - [ ] 21.1 Add accessibility support
    - Implement screen reader announcements for focus changes
    - Add keyboard navigation support (if applicable)
    - Verify color contrast for glow effects
    - Add reduced motion preference support
    - Ensure all interactive elements are keyboard accessible
    - _Requirements: 8.3_
  
  - [ ]* 21.2 Write accessibility tests
    - Test screen reader announcements
    - Test keyboard navigation
    - Verify ARIA attributes
    - Test reduced motion mode

- [ ] 22. Implement discovery accessibility and onboarding
  - [ ] 22.1 Add discovery accessibility features
    - Remove admin-only restrictions from discovery
    - Implement first-time tooltip (one-time only)
    - Add user preference UI for discovery frequency
    - _Requirements: 10.1, 10.2, 10.3, 10.5_
  
  - [ ]* 22.2 Write unit tests for accessibility
    - Test non-admin user can access discovery
    - Test tooltip appears once
    - Test preference persistence


- [ ] 23. Implement performance optimizations
  - [ ] 23.1 Add performance optimizations
    - Implement DOM update batching
    - Add viewport-based spatial culling
    - Optimize presence subscription queries
    - Add memory management for large graphs
    - Implement background pause detection
    - _Requirements: 15.3, 15.5, 15.7_
  
  - [ ]* 23.2 Write performance tests
    - Test frame rate with 100+ nodes
    - Test memory usage over time
    - Test battery impact (mobile)
    - Verify spatial culling effectiveness

- [ ] 24. Integrate with existing dashboard
  - [ ] 24.1 Replace existing My Network and Discovery views
    - Remove old mode selection UI
    - Replace with unified network container
    - Update navigation to use new API
    - Migrate existing event handlers
    - Update search integration to use focusNode
    - _Requirements: All requirements_
  
  - [ ] 24.2 Update existing Synapse integration
    - Integrate with existing synapse/core.js
    - Update focus-system.js to work with unified network
    - Ensure backward compatibility with existing features
    - Update search-integration.js

- [ ] 25. Add error handling and recovery
  - [ ] 25.1 Implement comprehensive error handling
    - Add data loading error handling with fallback
    - Implement physics simulation error recovery
    - Add presence tracking error handling with polling fallback
    - Implement rendering error recovery
    - Add user-facing error notifications
    - _Requirements: All requirements_
  
  - [ ]* 25.2 Write error handling tests
    - Test Supabase connection failures
    - Test invalid node data recovery
    - Test presence subscription failures
    - Test rendering failures

- [ ] 26. Final checkpoint - End-to-end testing
  - Ensure all tests pass, ask the user if questions arise.


- [ ] 27. Mobile-specific optimizations and testing
  - [ ] 27.1 Implement mobile-specific features
    - Optimize touch event handling
    - Implement haptic feedback
    - Add thumb-reachable zone calculations
    - Optimize for various screen sizes (iPhone SE to iPad)
    - Test on iOS Safari and Android Chrome
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
  
  - [ ]* 27.2 Write mobile-specific tests
    - Test touch target sizes on various devices
    - Test haptic feedback timing
    - Test thumb-reachable positioning
    - Verify 60fps on mobile devices

- [ ] 28. Documentation and deployment preparation
  - [ ] 28.1 Create user documentation
    - Write user guide for unified network discovery
    - Document discovery behavior and triggers
    - Create troubleshooting guide
    - Add inline help tooltips
  
  - [ ] 28.2 Create developer documentation
    - Document UnifiedNetworkAPI
    - Create architecture diagrams
    - Write integration guide for future features
    - Document performance tuning options
  
  - [ ] 28.3 Prepare deployment
    - Create database migration scripts
    - Write deployment checklist
    - Set up monitoring and analytics
    - Create rollback plan

## Notes

- Tasks marked with `*` are optional property-based tests that can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at key milestones
- Property tests validate universal correctness properties from the design
- Unit tests validate specific examples, edge cases, and integration points
- The implementation builds incrementally: data structures → physics → state → rendering → interaction → integration
