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
    // Silently prevent duplicates - only log in verbose mode
    if (window.CH_VERBOSE_EVENTS) {
      console.warn(`⚠️ Duplicate event listener prevented: ${type} on ${this.constructor.name || 'element'}`);
    }
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


// Profile-loaded event deduplication
let profileLoadedFired = false;
let profileLoadedData = null;

const originalDispatchEvent = EventTarget.prototype.dispatchEvent;
EventTarget.prototype.dispatchEvent = function(event) {
  // Deduplicate profile-loaded events
  if (event.type === 'profile-loaded') {
    if (profileLoadedFired) {
      if (window.CH_VERBOSE_EVENTS) {
        console.warn("⚠️ Duplicate profile-loaded event prevented");
      }
      return true;
    }
    profileLoadedFired = true;
    profileLoadedData = event.detail;
    console.log("✅ Profile-loaded event fired (first time)");
  }
  
  return originalDispatchEvent.call(this, event);
};


// Cleanup function for page unload
window.addEventListener('beforeunload', () => {
  window.__CH_EVENT_REGISTRY__.clear();
  profileLoadedFired = false;
  profileLoadedData = null;
  initializationCounts = {};
});

console.log("✅ Event deduplication system ready");