// ================================================================
// EVENT DEDUPLICATION SYSTEM
// ================================================================
// Prevents duplicate event listeners and multiple initializations
// that cause performance overhead and repeated console messages

console.log("%c🔧 Event Deduplication Loading...", "color:#0ff; font-weight: bold; font-size: 16px");

// Global registry to track bound event listeners (WeakMap to allow garbage collection)
window.__CH_EVENT_REGISTRY__ = window.__CH_EVENT_REGISTRY__ || new WeakMap();
window.__CH_EVENT_COUNTER__ = window.__CH_EVENT_COUNTER__ || 0;

// Enhanced addEventListener that prevents duplicates
const originalAddEventListener = EventTarget.prototype.addEventListener;

EventTarget.prototype.addEventListener = function(type, listener, options) {
  // Get or create a unique ID for this element
  if (!this.__ch_element_id__) {
    this.__ch_element_id__ = ++window.__CH_EVENT_COUNTER__;
  }

  // Get or create the event map for this element
  if (!window.__CH_EVENT_REGISTRY__.has(this)) {
    window.__CH_EVENT_REGISTRY__.set(this, new Map());
  }

  const elementRegistry = window.__CH_EVENT_REGISTRY__.get(this);

  // Generate a unique key for this event binding on THIS specific element
  const listenerKey = listener.toString().slice(0, 100);
  const key = `${type}-${listenerKey}`;

  // Check if this exact listener is already bound to THIS element
  if (elementRegistry.has(key)) {
    console.warn(`⚠️ Duplicate event listener prevented: ${type} on ${this.constructor.name || 'element'}#${this.__ch_element_id__}`);
    return;
  }

  // Register this listener for this element
  elementRegistry.set(key, {
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
  // WeakMap doesn't support iteration or size, so we reset it
  window.__CH_EVENT_REGISTRY__ = new WeakMap();
  console.log(`🧹 Event listener registry cleared`);
};

// Function to show current listener stats (limited with WeakMap)
window.showListenerStats = function() {
  console.log("📊 Event Listener Stats:");
  console.log("Note: Using WeakMap for memory efficiency - detailed stats not available");
  console.log(`📊 Total elements tracked: ${window.__CH_EVENT_COUNTER__ || 0}`);
  return { elementsTracked: window.__CH_EVENT_COUNTER__ || 0 };
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
  window.__CH_EVENT_REGISTRY__ = new WeakMap();
  window.__CH_EVENT_COUNTER__ = 0;
  profileLoadedFired = false;
  profileLoadedData = null;
  initializationCounts = {};
});

console.log("✅ Event deduplication system ready");