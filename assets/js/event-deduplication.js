// ================================================================
// EVENT DEDUPLICATION SYSTEM
// ================================================================
// Prevents duplicate event listeners and multiple initializations
// that cause performance overhead and repeated console messages

console.log("%c🔧 Event Deduplication Loading...", "color:#0ff; font-weight: bold; font-size: 16px");

// Global registry to track bound event listeners
window.__CH_EVENT_REGISTRY__ = window.__CH_EVENT_REGISTRY__ || new Map();

// Enhanced addEventListener that prevents duplicates
const originalAddEventListener = EventTarget.prototype.addEventListener;

EventTarget.prototype.addEventListener = function(type, listener, options) {
  // Generate a unique key for this event binding
  const key = `${this.constructor.name || 'Unknown'}-${type}-${listener.toString().slice(0, 100)}`;
  
  // Check if this exact listener is already bound
  if (window.__CH_EVENT_REGISTRY__.has(key)) {
    console.warn(`⚠️ Duplicate event listener prevented: ${type} on ${this.constructor.name || 'element'}`);
    return;
  }
  
  // Register this listener
  window.__CH_EVENT_REGISTRY__.set(key, {
    target: this,
    type: type,
    listener: listener,
    options: options,
    timestamp: Date.now()
  });
  
  // Call original addEventListener
  return originalAddEventListener.call(this, type, listener, options);
};

// Function to clear duplicate listeners (useful for debugging)
window.clearDuplicateListeners = function() {
  const registry = window.__CH_EVENT_REGISTRY__;
  const cleared = registry.size;
  registry.clear();
  console.log(`🧹 Cleared ${cleared} registered event listeners`);
};

// Function to show current listener stats
window.showListenerStats = function() {
  const registry = window.__CH_EVENT_REGISTRY__;
  const stats = {};
  
  for (const [key, info] of registry.entries()) {
    const eventType = info.type;
    stats[eventType] = (stats[eventType] || 0) + 1;
  }
  
  console.log("📊 Current Event Listener Stats:", stats);
  console.log(`📊 Total registered listeners: ${registry.size}`);
  return stats;
};

// Initialization guard system for modules
window.initGuard = function(moduleName, initFunction) {
  const guardKey = `__${moduleName.toUpperCase()}_INITIALIZED__`;
  
  if (window[guardKey]) {
    console.log(`⚠️ ${moduleName} already initialized, skipping`);
    return false;
  }
  
  window[guardKey] = true;
  
  try {
    const result = initFunction();
    console.log(`✅ ${moduleName} initialized successfully`);
    return result;
  } catch (error) {
    console.error(`❌ ${moduleName} initialization failed:`, error);
    window[guardKey] = false; // Reset so it can be retried
    throw error;
  }
};

// Profile-loaded event deduplication
let profileLoadedFired = false;
let profileLoadedData = null;

const originalDispatchEvent = EventTarget.prototype.dispatchEvent;
EventTarget.prototype.dispatchEvent = function(event) {
  // Deduplicate profile-loaded events
  if (event.type === 'profile-loaded') {
    if (profileLoadedFired) {
      console.warn("⚠️ Duplicate profile-loaded event prevented");
      return true;
    }
    profileLoadedFired = true;
    profileLoadedData = event.detail;
    console.log("✅ Profile-loaded event fired (first time)");
  }
  
  return originalDispatchEvent.call(this, event);
};

// Function to manually trigger profile-loaded for late listeners
window.triggerProfileLoadedForLateListeners = function() {
  if (profileLoadedFired && profileLoadedData) {
    console.log("🔄 Triggering profile-loaded for late listeners");
    const event = new CustomEvent('profile-loaded', { detail: profileLoadedData });
    window.dispatchEvent(event);
  }
};

// Monitor for excessive duplicate initializations
let initializationCounts = {};

window.trackInitialization = function(moduleName) {
  initializationCounts[moduleName] = (initializationCounts[moduleName] || 0) + 1;
  
  if (initializationCounts[moduleName] > 3) {
    console.warn(`⚠️ ${moduleName} has been initialized ${initializationCounts[moduleName]} times - possible duplicate initialization issue`);
  }
  
  return initializationCounts[moduleName];
};

// Cleanup function for page unload
window.addEventListener('beforeunload', () => {
  window.__CH_EVENT_REGISTRY__.clear();
  profileLoadedFired = false;
  profileLoadedData = null;
  initializationCounts = {};
});

console.log("✅ Event deduplication system ready");