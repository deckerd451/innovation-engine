// ================================================================
// ADAPTIVE CONFIGURATION SYSTEM
// ================================================================
// Dynamic configuration based on device capabilities, user preferences, and community size

console.log("%c⚙️ Adaptive Configuration Loading...", "color:#0ff; font-weight: bold; font-size: 16px");

class AdaptiveConfiguration {
  constructor() {
    this.config = new Map();
    this.subscribers = new Set();
    this.deviceCapabilities = null;
    this.userPreferences = null;
    this.communityMetrics = null;
  }

  async initialize(supabase, userId) {
    console.log('⚙️ Initializing adaptive configuration...');
    
    // Detect device capabilities
    this.deviceCapabilities = this.detectDeviceCapabilities();
    
    // Load user preferences if available
    if (supabase && userId) {
      this.userPreferences = await this.loadUserPreferences(supabase, userId);
      this.communityMetrics = await this.loadCommunityMetrics(supabase);
    }
    
    // Generate adaptive configuration
    this.config = this.generateConfiguration();
    
    console.log('✅ Adaptive configuration initialized:', Object.fromEntries(this.config));
    
    // Notify subscribers
    this.notifySubscribers();
    
    return this.config;
  }

  detectDeviceCapabilities() {
    const capabilities = {
      // Memory detection
      totalMemory: this.getTotalMemory(),
      availableMemory: this.getAvailableMemory(),
      
      // Performance detection
      devicePixelRatio: window.devicePixelRatio || 1,
      screenSize: {
        width: window.screen.width,
        height: window.screen.height,
        available: {
          width: window.screen.availWidth,
          height: window.screen.availHeight
        }
      },
      
      // Viewport detection
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      
      // Connection detection
      connection: this.getConnectionInfo(),
      
      // Hardware detection
      hardwareConcurrency: navigator.hardwareConcurrency || 4,
      
      // Touch capability
      touchSupport: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
      
      // Performance timing
      performanceSupport: 'performance' in window && 'memory' in performance
    };

    console.log('📱 Device capabilities detected:', capabilities);
    return capabilities;
  }

  getTotalMemory() {
    if (performance.memory) {
      return Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024); // MB
    }
    
    // Estimate based on device characteristics
    const screenPixels = window.screen.width * window.screen.height;
    if (screenPixels > 2000000) return 8192; // High-end device
    if (screenPixels > 1000000) return 4096; // Mid-range device
    return 2048; // Low-end device
  }

  getAvailableMemory() {
    if (performance.memory) {
      const used = performance.memory.usedJSHeapSize / 1024 / 1024;
      const total = performance.memory.totalJSHeapSize / 1024 / 1024;
      return Math.round(total - used);
    }
    return this.getTotalMemory() * 0.7; // Estimate 70% available
  }

  getConnectionInfo() {
    if ('connection' in navigator) {
      return {
        effectiveType: navigator.connection.effectiveType,
        downlink: navigator.connection.downlink,
        rtt: navigator.connection.rtt,
        saveData: navigator.connection.saveData
      };
    }
    return { effectiveType: '4g', downlink: 10, rtt: 100, saveData: false };
  }

  async loadUserPreferences(supabase, userId) {
    try {
      const { data, error } = await supabase
        .from('user_preferences')
        .select('ui_preferences, notification_settings')
        .eq('user_id', userId)
        .single();

      if (error || !data) {
        console.log('⚙️ No user preferences found, using defaults');
        return this.getDefaultUserPreferences();
      }

      return {
        ui: data.ui_preferences || {},
        notifications: data.notification_settings || {}
      };
    } catch (error) {
      console.warn('⚙️ Failed to load user preferences:', error);
      return this.getDefaultUserPreferences();
    }
  }

  async loadCommunityMetrics(supabase) {
    try {
      // Get community size metrics
      const { count: userCount } = await supabase
        .from('community')
        .select('*', { count: 'exact', head: true });

      const { count: projectCount } = await supabase
        .from('projects')
        .select('*', { count: 'exact', head: true });

      const { count: connectionCount } = await supabase
        .from('connections')
        .select('*', { count: 'exact', head: true });

      return {
        userCount: userCount || 0,
        projectCount: projectCount || 0,
        connectionCount: connectionCount || 0,
        density: connectionCount / Math.max(userCount, 1)
      };
    } catch (error) {
      console.warn('⚙️ Failed to load community metrics:', error);
      return { userCount: 100, projectCount: 20, connectionCount: 50, density: 0.5 };
    }
  }

  getDefaultUserPreferences() {
    return {
      ui: {
        animationLevel: 'normal', // 'minimal', 'normal', 'enhanced'
        themeStyle: 'auto', // 'compact', 'normal', 'spacious', 'auto'
        performanceMode: 'auto', // 'performance', 'balanced', 'quality', 'auto'
        reducedMotion: false
      },
      notifications: {
        realTime: true,
        email: true,
        push: false
      }
    };
  }

  generateConfiguration() {
    const config = new Map();
    
    // Performance thresholds based on device capabilities
    config.set('performance', this.calculatePerformanceConfig());
    
    // Synapse visualization configuration
    config.set('synapse', this.calculateSynapseConfig());
    
    // Animation configuration
    config.set('animations', this.calculateAnimationConfig());
    
    // Rendering configuration
    config.set('rendering', this.calculateRenderingConfig());
    
    // Network configuration
    config.set('network', this.calculateNetworkConfig());
    
    return config;
  }

  calculatePerformanceConfig() {
    const totalMemory = this.deviceCapabilities.totalMemory;
    const availableMemory = this.deviceCapabilities.availableMemory;
    
    return {
      memoryWarningThreshold: Math.max(totalMemory * 0.6, 100), // 60% of total or 100MB minimum
      memoryCriticalThreshold: Math.max(totalMemory * 0.8, 200), // 80% of total or 200MB minimum
      maxDOMElements: this.calculateMaxDOMElements(),
      renderingQuality: this.determineRenderingQuality(),
      enablePerformanceMonitoring: totalMemory > 1024 // Only on devices with >1GB
    };
  }

  calculateSynapseConfig() {
    const viewport = this.deviceCapabilities.viewport;
    const communitySize = this.communityMetrics?.userCount || 100;
    const isMobile = viewport.width < 768;
    
    // Base theme radius scales with screen size and community size
    const baseThemeRadius = Math.min(
      viewport.width * 0.15, // 15% of screen width
      Math.max(150, 200 + Math.log(communitySize) * 20) // Logarithmic scaling with community size
    );
    
    return {
      baseThemeRadius: Math.round(baseThemeRadius),
      themeRadiusIncrement: Math.round(baseThemeRadius * 0.6), // 60% of base radius
      maxVisibleNodes: this.calculateMaxVisibleNodes(),
      forceStrength: isMobile ? 0.3 : 0.5, // Weaker forces on mobile
      simulationAlpha: isMobile ? 0.1 : 0.3, // Lower alpha on mobile for battery
      collisionRadius: isMobile ? 20 : 25, // Smaller collision on mobile
      linkDistance: isMobile ? 60 : 80, // Shorter links on mobile
      centeringForce: 0.1,
      containmentStrength: 0.5
    };
  }

  calculateAnimationConfig() {
    const userPrefs = this.userPreferences?.ui || {};
    const connection = this.deviceCapabilities.connection;
    const isMobile = this.deviceCapabilities.viewport.width < 768;
    
    // Respect user's reduced motion preference
    if (userPrefs.reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return {
        enableAnimations: false,
        transitionDuration: 0,
        pathwayAnimations: false,
        particleEffects: false
      };
    }
    
    // Adapt to connection quality
    const isSlowConnection = connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g';
    
    let animationLevel = userPrefs.animationLevel || 'normal';
    if (animationLevel === 'auto') {
      if (isSlowConnection || isMobile) {
        animationLevel = 'minimal';
      } else if (this.deviceCapabilities.totalMemory > 4096) {
        animationLevel = 'enhanced';
      } else {
        animationLevel = 'normal';
      }
    }
    
    const configs = {
      minimal: {
        enableAnimations: true,
        transitionDuration: 150,
        pathwayAnimations: false,
        particleEffects: false,
        easing: 'ease-out'
      },
      normal: {
        enableAnimations: true,
        transitionDuration: 300,
        pathwayAnimations: true,
        particleEffects: false,
        easing: 'ease-in-out'
      },
      enhanced: {
        enableAnimations: true,
        transitionDuration: 500,
        pathwayAnimations: true,
        particleEffects: true,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
      }
    };
    
    return configs[animationLevel];
  }

  calculateRenderingConfig() {
    const totalMemory = this.deviceCapabilities.totalMemory;
    const pixelRatio = this.deviceCapabilities.devicePixelRatio;
    const viewport = this.deviceCapabilities.viewport;
    
    return {
      maxTextureSize: this.calculateMaxTextureSize(),
      enableShadows: totalMemory > 2048, // Only on devices with >2GB
      enableBlur: totalMemory > 1024, // Only on devices with >1GB
      renderScale: Math.min(pixelRatio, totalMemory > 4096 ? 2 : 1), // Limit high DPI on low memory
      enableAntialiasing: totalMemory > 1024,
      maxParticles: Math.min(100, totalMemory / 40), // 1 particle per 40MB
      levelOfDetail: this.calculateLevelOfDetail()
    };
  }

  calculateNetworkConfig() {
    const connection = this.deviceCapabilities.connection;
    
    return {
      enableRealTimeUpdates: connection.effectiveType !== 'slow-2g',
      updateInterval: this.calculateUpdateInterval(),
      batchSize: connection.downlink > 5 ? 50 : 20, // Larger batches on fast connections
      enableCompression: connection.saveData || connection.effectiveType === '2g',
      prefetchDistance: connection.downlink > 10 ? 3 : 1 // Prefetch more on fast connections
    };
  }

  calculateMaxDOMElements() {
    const totalMemory = this.deviceCapabilities.totalMemory;
    
    if (totalMemory > 8192) return 5000; // High-end devices
    if (totalMemory > 4096) return 3000; // Mid-high devices
    if (totalMemory > 2048) return 2000; // Mid-range devices
    if (totalMemory > 1024) return 1000; // Low-mid devices
    return 500; // Low-end devices
  }

  calculateMaxVisibleNodes() {
    const maxElements = this.calculateMaxDOMElements();
    const elementsPerNode = 3; // Average DOM elements per node
    return Math.floor(maxElements / elementsPerNode);
  }

  determineRenderingQuality() {
    const totalMemory = this.deviceCapabilities.totalMemory;
    const userPrefs = this.userPreferences?.ui?.performanceMode || 'auto';
    
    if (userPrefs !== 'auto') return userPrefs;
    
    if (totalMemory > 4096) return 'quality';
    if (totalMemory > 2048) return 'balanced';
    return 'performance';
  }

  calculateMaxTextureSize() {
    const totalMemory = this.deviceCapabilities.totalMemory;
    
    if (totalMemory > 4096) return 2048;
    if (totalMemory > 2048) return 1024;
    if (totalMemory > 1024) return 512;
    return 256;
  }

  calculateLevelOfDetail() {
    const viewport = this.deviceCapabilities.viewport;
    const totalMemory = this.deviceCapabilities.totalMemory;
    
    const screenArea = viewport.width * viewport.height;
    const memoryFactor = totalMemory / 2048; // Normalize to 2GB baseline
    
    if (screenArea > 2000000 && memoryFactor > 2) return 'high';
    if (screenArea > 1000000 && memoryFactor > 1) return 'medium';
    return 'low';
  }

  calculateUpdateInterval() {
    const connection = this.deviceCapabilities.connection;
    
    if (connection.effectiveType === 'slow-2g') return 5000; // 5 seconds
    if (connection.effectiveType === '2g') return 3000; // 3 seconds
    if (connection.effectiveType === '3g') return 1000; // 1 second
    return 500; // 500ms for 4g+
  }

  // Public API
  get(category, key) {
    const categoryConfig = this.config.get(category);
    return key ? categoryConfig?.[key] : categoryConfig;
  }

  set(category, key, value) {
    if (!this.config.has(category)) {
      this.config.set(category, {});
    }
    
    if (typeof key === 'object') {
      // Set entire category
      this.config.set(category, key);
    } else {
      // Set specific key
      const categoryConfig = this.config.get(category);
      categoryConfig[key] = value;
    }
    
    this.notifySubscribers();
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  notifySubscribers() {
    this.subscribers.forEach(callback => {
      try {
        callback(this.config);
      } catch (error) {
        console.error('⚙️ Configuration subscriber error:', error);
      }
    });
  }

  async saveUserPreferences(supabase, userId, preferences) {
    if (!supabase || !userId) return;
    
    try {
      const { error } = await supabase
        .from('user_preferences')
        .upsert({
          user_id: userId,
          ui_preferences: preferences.ui || {},
          notification_settings: preferences.notifications || {},
          updated_at: new Date().toISOString()
        });

      if (error) {
        console.error('⚙️ Failed to save user preferences:', error);
      } else {
        console.log('✅ User preferences saved');
        this.userPreferences = preferences;
        this.config = this.generateConfiguration();
        this.notifySubscribers();
      }
    } catch (error) {
      console.error('⚙️ Error saving user preferences:', error);
    }
  }

  // Performance monitoring
  startPerformanceMonitoring() {
    if (!this.get('performance', 'enablePerformanceMonitoring')) return;
    
    setInterval(() => {
      const metrics = this.getCurrentPerformanceMetrics();
      
      // Auto-adjust configuration based on performance
      if (metrics.memoryUsage > this.get('performance', 'memoryWarningThreshold')) {
        this.adjustForHighMemoryUsage();
      }
      
      if (metrics.frameRate < 30) {
        this.adjustForLowFrameRate();
      }
    }, 10000); // Check every 10 seconds
  }

  getCurrentPerformanceMetrics() {
    return {
      memoryUsage: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) : 0,
      frameRate: this.calculateFrameRate(),
      loadTime: performance.timing ? performance.timing.loadEventEnd - performance.timing.navigationStart : 0
    };
  }

  calculateFrameRate() {
    // Simple frame rate estimation
    if (!this.frameRateHistory) {
      this.frameRateHistory = [];
      this.lastFrameTime = performance.now();
    }
    
    const now = performance.now();
    const delta = now - this.lastFrameTime;
    this.lastFrameTime = now;
    
    if (delta > 0) {
      this.frameRateHistory.push(1000 / delta);
      if (this.frameRateHistory.length > 60) {
        this.frameRateHistory.shift();
      }
    }
    
    return this.frameRateHistory.length > 0 
      ? this.frameRateHistory.reduce((a, b) => a + b) / this.frameRateHistory.length 
      : 60;
  }

  adjustForHighMemoryUsage() {
    console.log('⚙️ High memory usage detected, adjusting configuration...');
    
    // Reduce rendering quality
    const rendering = this.get('rendering');
    this.set('rendering', {
      ...rendering,
      enableShadows: false,
      enableBlur: false,
      maxParticles: Math.floor(rendering.maxParticles * 0.5)
    });
    
    // Reduce animation complexity
    const animations = this.get('animations');
    this.set('animations', {
      ...animations,
      particleEffects: false,
      transitionDuration: Math.floor(animations.transitionDuration * 0.7)
    });
  }

  adjustForLowFrameRate() {
    console.log('⚙️ Low frame rate detected, adjusting configuration...');
    
    // Reduce synapse complexity
    const synapse = this.get('synapse');
    this.set('synapse', {
      ...synapse,
      maxVisibleNodes: Math.floor(synapse.maxVisibleNodes * 0.8),
      simulationAlpha: synapse.simulationAlpha * 0.8
    });
  }
}

// Global instance
let adaptiveConfig = null;

// Initialize adaptive configuration
export async function initAdaptiveConfiguration(supabase, userId) {
  if (!adaptiveConfig) {
    adaptiveConfig = new AdaptiveConfiguration();
  }
  
  await adaptiveConfig.initialize(supabase, userId);
  
  // Start performance monitoring
  adaptiveConfig.startPerformanceMonitoring();
  
  // Expose globally for debugging
  window.adaptiveConfig = adaptiveConfig;
  
  return adaptiveConfig;
}

// Get configuration instance
export function getAdaptiveConfig() {
  return adaptiveConfig;
}

// Convenience functions
export function getConfig(category, key) {
  return adaptiveConfig?.get(category, key);
}

export function setConfig(category, key, value) {
  return adaptiveConfig?.set(category, key, value);
}

export function subscribeToConfig(callback) {
  return adaptiveConfig?.subscribe(callback);
}

console.log('✅ Adaptive configuration system ready');