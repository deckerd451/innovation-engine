// assets/js/unified-network/action-resolver.js
// Action Resolution System for Unified Network Discovery
// Version: 1.0.0

/**
 * Action Resolver
 * Handles action execution and graph updates after user interactions
 * 
 * Responsibilities:
 * - Execute connection actions (update connections table)
 * - Execute project join actions (update project_participants)
 * - Execute theme exploration actions (update theme interactions)
 * - Coordinate graph updates after actions
 * - Trigger position recalculation after state changes
 */
export class ActionResolver {
  constructor() {
    this._supabase = null;
    this._graphDataStore = null;
    this._stateManager = null;
    this._relevanceEngine = null;
    this._eventHandlers = new Map();
  }

  /**
   * Initialize action resolver
   * @param {Object} supabase - Supabase client
   * @param {GraphDataStore} graphDataStore - Graph data store instance
   * @param {StateManager} stateManager - State manager instance
   * @param {RelevanceEngine} relevanceEngine - Relevance engine instance
   */
  initialize(supabase, graphDataStore, stateManager, relevanceEngine) {
    this._supabase = supabase;
    this._graphDataStore = graphDataStore;
    this._stateManager = stateManager;
    this._relevanceEngine = relevanceEngine;

    console.log('✅ ActionResolver initialized');
  }

  /**
   * Resolve action for a node
   * @param {string} nodeId - Node ID
   * @param {string} actionType - Action type (connect, join-project, explore-theme, etc.)
   * @param {string} userId - Current user ID
   * @returns {Promise<Object>} Action result
   */
  async resolveAction(nodeId, actionType, userId) {
    console.log(`🎯 Resolving action: ${actionType} for node ${nodeId}`);

    try {
      let result;

      switch (actionType) {
        case 'connect':
          result = await this._executeConnect(nodeId, userId);
          break;
        case 'join-project':
          result = await this._executeJoinProject(nodeId, userId);
          break;
        case 'explore-theme':
          result = await this._executeExploreTheme(nodeId, userId);
          break;
        case 'view-profile':
          result = await this._executeViewProfile(nodeId, userId);
          break;
        case 'view-project':
          result = await this._executeViewProject(nodeId, userId);
          break;
        case 'view-organization':
          result = await this._executeViewOrganization(nodeId, userId);
          break;
        default:
          throw new Error(`Unknown action type: ${actionType}`);
      }

      // Record interaction
      await this._recordInteraction(userId, nodeId, actionType);

      // Update graph after action
      await this._updateGraphAfterAction(nodeId, actionType, result);

      // Emit action completed event
      this.emit('action-completed', {
        nodeId,
        actionType,
        result
      });

      return result;

    } catch (error) {
      console.error(`❌ Action resolution failed:`, error);
      
      this.emit('action-failed', {
        nodeId,
        actionType,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Execute connect action
   * @private
   */
  async _executeConnect(nodeId, userId) {
    console.log(`🤝 Connecting with user ${nodeId}`);

    // Insert connection into database
    const { data, error } = await this._supabase
      .from('connections')
      .insert({
        user_id: userId,
        connected_user_id: nodeId,
        status: 'pending',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    return {
      success: true,
      connectionId: data.id,
      status: 'pending',
      message: 'Connection request sent'
    };
  }

  /**
   * Execute join project action
   * @private
   */
  async _executeJoinProject(nodeId, userId) {
    console.log(`📁 Joining project ${nodeId}`);

    // Insert project participant
    const { data, error } = await this._supabase
      .from('project_participants')
      .insert({
        project_id: nodeId,
        user_id: userId,
        role: 'member',
        joined_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    return {
      success: true,
      participantId: data.id,
      role: 'member',
      message: 'Joined project successfully'
    };
  }

  /**
   * Execute explore theme action
   * @private
   */
  async _executeExploreTheme(nodeId, userId) {
    console.log(`🎨 Exploring theme ${nodeId}`);

    // Insert theme interaction
    const { data, error } = await this._supabase
      .from('theme_interactions')
      .insert({
        theme_id: nodeId,
        user_id: userId,
        interaction_type: 'explore',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    return {
      success: true,
      interactionId: data.id,
      message: 'Theme exploration recorded'
    };
  }

  /**
   * Execute view profile action
   * @private
   */
  async _executeViewProfile(nodeId, userId) {
    console.log(`👤 Viewing profile ${nodeId}`);

    // Just record the view, no database changes
    return {
      success: true,
      action: 'view-profile',
      nodeId,
      message: 'Profile viewed'
    };
  }

  /**
   * Execute view project action
   * @private
   */
  async _executeViewProject(nodeId, userId) {
    console.log(`📂 Viewing project ${nodeId}`);

    // Just record the view, no database changes
    return {
      success: true,
      action: 'view-project',
      nodeId,
      message: 'Project viewed'
    };
  }

  /**
   * Execute view organization action
   * @private
   */
  async _executeViewOrganization(nodeId, userId) {
    console.log(`🏢 Viewing organization ${nodeId}`);

    // Just record the view, no database changes
    return {
      success: true,
      action: 'view-organization',
      nodeId,
      message: 'Organization viewed'
    };
  }

  /**
   * Record interaction in database
   * @private
   */
  async _recordInteraction(userId, nodeId, interactionType) {
    try {
      const { error } = await this._supabase
        .from('node_interactions')
        .insert({
          user_id: userId,
          node_id: nodeId,
          interaction_type: interactionType,
          created_at: new Date().toISOString()
        });

      if (error) {
        console.warn('⚠️ Failed to record interaction:', error);
      }
    } catch (error) {
      console.warn('⚠️ Failed to record interaction:', error);
    }
  }

  /**
   * Update graph after action
   * @private
   */
  async _updateGraphAfterAction(nodeId, actionType, result) {
    console.log(`🔄 Updating graph after ${actionType}`);

    // Get the node
    const node = this._graphDataStore.getNode(nodeId);
    if (!node) return;

    // Update node state based on action
    switch (actionType) {
      case 'connect':
        await this._handleConnectUpdate(node, result);
        break;
      case 'join-project':
        await this._handleJoinProjectUpdate(node, result);
        break;
      case 'explore-theme':
        await this._handleExploreThemeUpdate(node, result);
        break;
    }

    // Refresh graph data
    await this._graphDataStore.refresh();

    // Recalculate relevance scores
    if (this._relevanceEngine) {
      await this._relevanceEngine.recalculateAll();
    }

    // Update state manager
    if (this._stateManager) {
      this._stateManager.onGraphUpdate();
    }
  }

  /**
   * Handle connect action graph update
   * @private
   */
  async _handleConnectUpdate(node, result) {
    // Move node from discovery to my network
    node.isDiscovery = false;
    node.isMyNetwork = true;

    // Increase relevance score
    node.relevanceScore = Math.min(1.0, node.relevanceScore + 0.3);

    // Recalculate effectivePull
    node.effectivePull = node.relevanceScore * (1 + node.presenceEnergy);

    // Emit graph change event
    this.emit('graph-updated', {
      nodeId: node.id,
      change: 'connection-added',
      newState: 'my-network'
    });

    console.log(`✅ Node ${node.id} moved to My Network`);
  }

  /**
   * Handle join project action graph update
   * @private
   */
  async _handleJoinProjectUpdate(node, result) {
    // Update node position to reflect new relationship
    // The physics system will handle the actual positioning

    // Increase relevance score
    node.relevanceScore = Math.min(1.0, node.relevanceScore + 0.4);

    // Recalculate effectivePull
    node.effectivePull = node.relevanceScore * (1 + node.presenceEnergy);

    // Mark as my network if it was discovery
    if (node.isDiscovery) {
      node.isDiscovery = false;
      node.isMyNetwork = true;
    }

    // Emit graph change event
    this.emit('graph-updated', {
      nodeId: node.id,
      change: 'project-joined',
      newRelevance: node.relevanceScore
    });

    console.log(`✅ Joined project ${node.id}, relevance increased`);
  }

  /**
   * Handle explore theme action graph update
   * @private
   */
  async _handleExploreThemeUpdate(node, result) {
    // Adjust glow and position based on new context
    
    // Increase relevance score slightly
    node.relevanceScore = Math.min(1.0, node.relevanceScore + 0.2);

    // Recalculate effectivePull
    node.effectivePull = node.relevanceScore * (1 + node.presenceEnergy);

    // Increase glow temporarily
    node.presenceEnergy = Math.min(1.0, node.presenceEnergy + 0.3);

    // Set TTL for temporary presence boost
    node.presenceTTL = new Date(Date.now() + 60000); // 1 minute

    // Emit graph change event
    this.emit('graph-updated', {
      nodeId: node.id,
      change: 'theme-explored',
      newRelevance: node.relevanceScore,
      newPresence: node.presenceEnergy
    });

    console.log(`✅ Explored theme ${node.id}, glow and relevance increased`);
  }

  /**
   * Trigger position recalculation
   * This is called after actions that change the graph structure
   */
  triggerPositionRecalculation() {
    console.log('📍 Triggering position recalculation');

    this.emit('recalculate-positions', {
      timestamp: Date.now()
    });
  }

  /**
   * Register event handler
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   */
  on(event, handler) {
    if (!this._eventHandlers.has(event)) {
      this._eventHandlers.set(event, []);
    }
    this._eventHandlers.get(event).push(handler);
  }

  /**
   * Unregister event handler
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   */
  off(event, handler) {
    if (!this._eventHandlers.has(event)) return;
    
    const handlers = this._eventHandlers.get(event);
    const index = handlers.indexOf(handler);
    if (index > -1) {
      handlers.splice(index, 1);
    }
  }

  /**
   * Emit event
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  emit(event, data) {
    if (!this._eventHandlers.has(event)) return;
    
    const handlers = this._eventHandlers.get(event);
    handlers.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        console.error(`Error in event handler for ${event}:`, error);
      }
    });
  }

  /**
   * Cleanup
   */
  cleanup() {
    this._eventHandlers.clear();
    console.log('🧹 ActionResolver cleaned up');
  }
}
