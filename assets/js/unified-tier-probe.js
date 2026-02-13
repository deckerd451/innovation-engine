/**
 * UNIFIED TIER PROBE — Mobile Tier Debug Instrumentation
 *
 * Purpose: Diagnose why mobile tier transitions are not happening
 *
 * 4-Step Verification:
 * 1) Is the mobile tier controller loading?
 * 2) Is it receiving zoom/scale updates?
 * 3) Is it deciding a tier?
 * 4) Is it applying that tier to the renderer?
 *
 * Usage:
 *   window.__UnifiedTierProbe.dump()      // Show current state
 *   window.__UnifiedTierProbe.forceTier("T2")  // Force a tier manually
 */

export class UnifiedTierProbe {
  constructor() {
    this.installed = false;
    this.installTime = null;

    // Component detection
    this.found = {
      network: false,
      renderer: false,
      camera: false,
      events: false,
      tierController: false,
      scaleController: false,
      physics: false,
      svg: false,
      simulation: false,
      stateManager: false
    };

    // Component references (captured)
    this.refs = {
      api: null,
      renderer: null,
      svg: null,
      simulation: null,
      stateManager: null,
      nodeRenderer: null
    };

    // Metrics
    this.metrics = {
      zoomEvents: 0,
      scaleEvents: 0,
      tierDecisions: 0,
      tierApplies: 0,
      lastScale: null,
      lastScaleTime: null,
      lastTier: null,
      lastTierTime: null,
      lastTierApplyTarget: null,
      lastTierApplyTime: null,
      errors: []
    };

    // Polling state
    this.pollInterval = null;
    this.pollRate = 500;

    // Original method references (for wrapping)
    this.originals = {};
  }

  /**
   * Install probe on unified network API
   */
  install(unifiedNetworkApi) {
    if (this.installed) {
      console.log('📱 UnifiedTierProbe: Already installed, returning existing probe');
      return this;
    }

    console.log('📱 UnifiedTierProbe: Installing...');
    this.installTime = Date.now();
    this.installed = true;

    // Capture API reference
    this.refs.api = unifiedNetworkApi;

    // Step 1: Detect components
    this._detectComponents(unifiedNetworkApi);

    // Step 2: Hook into zoom/scale events
    this._hookZoomEvents(unifiedNetworkApi);

    // Step 3: Start polling fallback (if no events detected)
    this._startPolling();

    // Log findings
    this._logFindings();

    console.log('📱 UnifiedTierProbe: Installed successfully');
    return this;
  }

  /**
   * Detect available components
   */
  _detectComponents(api) {
    console.log('📱 UnifiedTierProbe: Detecting components...');

    // Check API internals
    if (api) {
      this.found.network = true;

      if (api._nodeRenderer) {
        this.found.renderer = true;
        this.refs.nodeRenderer = api._nodeRenderer;
        this.refs.renderer = api._nodeRenderer;
      }

      if (api._svg) {
        this.found.svg = true;
        this.refs.svg = api._svg;
      }

      if (api._simulation) {
        this.found.simulation = true;
        this.refs.simulation = api._simulation;
      }

      if (api._stateManager) {
        this.found.stateManager = true;
        this.refs.stateManager = api._stateManager;
      }

      if (api._physicsLoop) {
        this.found.physics = true;
      }

      // Check for event system
      if (api.on || api.emit || api._eventHandlers) {
        this.found.events = true;
      }
    }

    // Check window globals
    if (window.d3) {
      console.log('📱 UnifiedTierProbe: D3 found on window');
    }

    // Check for tier/scale controllers (unlikely in unified network)
    if (window.scaleTierController) {
      this.found.scaleController = true;
    }

    if (window.tierController) {
      this.found.tierController = true;
    }
  }

  /**
   * Hook into zoom/scale events
   */
  _hookZoomEvents(api) {
    console.log('📱 UnifiedTierProbe: Hooking zoom/scale events...');

    // Strategy 1: Subscribe to events (if event bus exists)
    if (api.on) {
      const eventNames = [
        'zoom', 'scale',
        'camera:zoom', 'camera:scale',
        'viewport:scale', 'viewport:zoom',
        'transform', 'zoom:change'
      ];

      eventNames.forEach(eventName => {
        try {
          api.on(eventName, (data) => {
            this._onScaleUpdate(data?.scale || data?.zoom || data?.k || 1.0, 'event:' + eventName);
          });
          console.log(`📱 UnifiedTierProbe: Subscribed to event "${eventName}"`);
        } catch (err) {
          // Event might not exist, that's ok
        }
      });
    }

    // Strategy 2: Wrap D3 zoom behavior (if accessible)
    if (this.refs.svg && window.d3) {
      try {
        const svg = window.d3.select(this.refs.svg);
        const zoomBehavior = svg.on('zoom.probe');

        // Add our own zoom listener
        svg.on('zoom.probe', (event) => {
          if (event && event.transform) {
            this._onScaleUpdate(event.transform.k, 'd3:zoom');
          }
        });

        console.log('📱 UnifiedTierProbe: D3 zoom listener installed');
      } catch (err) {
        console.warn('📱 UnifiedTierProbe: Failed to hook D3 zoom:', err);
      }
    }

    // Strategy 3: Wrap common methods (if they exist)
    this._wrapMethods(api);
  }

  /**
   * Wrap common zoom/scale methods
   */
  _wrapMethods(api) {
    const methodsToWrap = [
      { obj: api, name: 'setZoom' },
      { obj: api, name: 'setScale' },
      { obj: api, name: 'zoomTo' },
      { obj: api, name: 'setTransform' },
      { obj: api._nodeRenderer, name: 'setZoom' },
      { obj: api._nodeRenderer, name: 'setScale' }
    ];

    methodsToWrap.forEach(({ obj, name }) => {
      if (!obj || typeof obj[name] !== 'function') return;

      const original = obj[name];
      this.originals[name] = original;

      obj[name] = (...args) => {
        // Extract scale from args (heuristic)
        const scale = args.find(arg => typeof arg === 'number') || 1.0;
        this._onScaleUpdate(scale, `method:${name}`);

        return original.apply(obj, args);
      };

      console.log(`📱 UnifiedTierProbe: Wrapped method "${name}"`);
    });
  }

  /**
   * Start polling fallback (debug only)
   */
  _startPolling() {
    if (this.pollInterval) return;

    console.log(`📱 UnifiedTierProbe: Starting polling fallback (${this.pollRate}ms)`);

    this.pollInterval = setInterval(() => {
      try {
        const scale = this._getCurrentScale();
        if (scale !== null && scale !== this.metrics.lastScale) {
          this._onScaleUpdate(scale, 'poll');
        }
      } catch (err) {
        // Silent fail
      }
    }, this.pollRate);
  }

  /**
   * Get current scale from various sources
   */
  _getCurrentScale() {
    // Try D3 zoom transform
    if (this.refs.svg && window.d3) {
      try {
        const transform = window.d3.zoomTransform(this.refs.svg);
        if (transform && typeof transform.k === 'number') {
          return transform.k;
        }
      } catch (err) {
        // Ignore
      }
    }

    // Try camera/renderer properties
    if (this.refs.renderer) {
      if (typeof this.refs.renderer.scale === 'number') {
        return this.refs.renderer.scale;
      }
      if (typeof this.refs.renderer.zoom === 'number') {
        return this.refs.renderer.zoom;
      }
    }

    // Try API properties
    if (this.refs.api) {
      if (typeof this.refs.api.scale === 'number') {
        return this.refs.api.scale;
      }
      if (typeof this.refs.api.zoom === 'number') {
        return this.refs.api.zoom;
      }
    }

    return null;
  }

  /**
   * Handle scale update
   */
  _onScaleUpdate(scale, source) {
    this.metrics.scaleEvents++;
    this.metrics.lastScale = scale;
    this.metrics.lastScaleTime = Date.now();

    console.log(`📱 UnifiedTierProbe: Scale update: ${scale.toFixed(3)} (source: ${source})`);

    // Attempt tier decision
    this._attemptTierDecision(scale);
  }

  /**
   * Attempt tier decision using common method names
   */
  _attemptTierDecision(scale) {
    const methodNames = [
      'decideTier',
      'getTierForScale',
      'computeTier',
      'calculateTier',
      'determineTier'
    ];

    let tier = null;
    let method = null;

    // Try API methods
    if (this.refs.api) {
      for (const name of methodNames) {
        if (typeof this.refs.api[name] === 'function') {
          try {
            tier = this.refs.api[name](scale);
            method = `api.${name}`;
            break;
          } catch (err) {
            this.metrics.errors.push({ method: name, error: err.message });
          }
        }
      }
    }

    // Try window globals
    if (!tier) {
      for (const name of methodNames) {
        if (typeof window[name] === 'function') {
          try {
            tier = window[name](scale);
            method = `window.${name}`;
            break;
          } catch (err) {
            // Ignore
          }
        }
      }
    }

    // Simple heuristic if no method found
    if (tier === null) {
      tier = this._heuristicTierDecision(scale);
      method = 'heuristic';
    }

    if (tier) {
      this.metrics.tierDecisions++;
      this.metrics.lastTier = tier;
      this.metrics.lastTierTime = Date.now();

      console.log(`📱 UnifiedTierProbe: Tier decision: ${tier} (method: ${method})`);

      // Attempt tier application
      this._attemptTierApplication(tier);
    }
  }

  /**
   * Heuristic tier decision (fallback)
   */
  _heuristicTierDecision(scale) {
    if (scale >= 2.4) return 'T0'; // Personal Hub
    if (scale >= 1.25) return 'T1'; // Relational
    return 'T2'; // Discovery
  }

  /**
   * Attempt tier application using common method names
   */
  _attemptTierApplication(tier) {
    const targets = [
      { obj: this.refs.api, prefix: 'api' },
      { obj: this.refs.renderer, prefix: 'renderer' },
      { obj: this.refs.api?._visibilityController, prefix: 'visibilityController' },
      { obj: window.tierController, prefix: 'window.tierController' }
    ];

    const methodNames = ['applyTier', 'setTier', 'activateTier'];

    for (const { obj, prefix } of targets) {
      if (!obj) continue;

      for (const name of methodNames) {
        if (typeof obj[name] === 'function') {
          try {
            obj[name](tier);

            this.metrics.tierApplies++;
            this.metrics.lastTierApplyTarget = `${prefix}.${name}`;
            this.metrics.lastTierApplyTime = Date.now();

            console.log(`📱 UnifiedTierProbe: Tier applied via ${prefix}.${name}(${tier})`);
            return true;
          } catch (err) {
            this.metrics.errors.push({
              method: `${prefix}.${name}`,
              error: err.message
            });
          }
        }
      }
    }

    console.warn(`📱 UnifiedTierProbe: No tier application method found`);
    return false;
  }

  /**
   * Log findings
   */
  _logFindings() {
    console.log('📱 UnifiedTierProbe: Component detection results:');
    console.table(this.found);
  }

  /**
   * Dump current state
   */
  dump() {
    const snapshot = {
      installed: this.installed,
      installTime: this.installTime ? new Date(this.installTime).toISOString() : null,
      uptime: this.installTime ? Date.now() - this.installTime : 0,
      found: { ...this.found },
      metrics: { ...this.metrics },
      currentScale: this._getCurrentScale(),
      refs: {
        api: !!this.refs.api,
        renderer: !!this.refs.renderer,
        svg: !!this.refs.svg,
        simulation: !!this.refs.simulation,
        stateManager: !!this.refs.stateManager
      }
    };

    console.log('📱 UnifiedTierProbe: Snapshot');
    console.table(snapshot.found);
    console.table(snapshot.metrics);
    console.log('Current scale:', snapshot.currentScale);
    console.log('Full snapshot:', snapshot);

    return snapshot;
  }

  /**
   * Force tier application manually
   */
  forceTier(tier) {
    console.log(`📱 UnifiedTierProbe: Forcing tier ${tier}...`);

    const success = this._attemptTierApplication(tier);

    if (success) {
      console.log(`✅ UnifiedTierProbe: Tier ${tier} forced successfully`);
    } else {
      console.error(`❌ UnifiedTierProbe: Failed to force tier ${tier}`);
    }

    return success;
  }

  /**
   * Stop polling
   */
  destroy() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    this.installed = false;
    console.log('📱 UnifiedTierProbe: Destroyed');
  }
}

// Singleton instance
let probeInstance = null;

/**
 * Install probe (idempotent)
 */
export function installUnifiedTierProbe(unifiedNetworkApi) {
  if (probeInstance) {
    console.log('📱 UnifiedTierProbe: Returning existing instance');
    return probeInstance;
  }

  probeInstance = new UnifiedTierProbe();
  probeInstance.install(unifiedNetworkApi);

  // Expose on window for console access
  if (typeof window !== 'undefined') {
    window.__UnifiedTierProbe = probeInstance;
  }

  return probeInstance;
}
