// Force cache refresh for messaging system
// Add this to your HTML or run in browser console

console.log('🔄 Forcing cache refresh for messaging system...');

// Clear localStorage cache
localStorage.removeItem('messaging-cache');
localStorage.removeItem('conversations-cache');

// Force reload with cache bypass
if (window.location.search.includes('nocache')) {
  console.log('✅ Cache refresh already applied');
} else {
  const separator = window.location.search ? '&' : '?';
  const newUrl = window.location.href + separator + 'nocache=' + Date.now();
  console.log('🔄 Reloading with cache bypass...');
  window.location.href = newUrl;
}