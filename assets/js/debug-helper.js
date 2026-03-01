// Debug Helper
// Minimal logging, only when explicitly enabled

const DEBUG = localStorage.getItem('debug') === 'true';

window.enableDebug = () => {
  localStorage.setItem('debug', 'true');
  location.reload();
};

window.disableDebug = () => {
  localStorage.removeItem('debug');
  location.reload();
};

if (DEBUG) {
  window.debugInfo = () => {
    return {
      user: window.currentUser,
      profile: window.currentUserProfile,
      connections: window.allConnections?.length || 0,
      supabase: !!window.supabase,
      modules: {
        onboarding: typeof window.showOnboarding === 'function',
        search: typeof window.selectPerson === 'function',
        tooltips: document.querySelectorAll('[data-tooltip]').length,
        shortcuts: typeof window.enableDebug === 'function'
      }
    };
  };
  
  console.log('%c🔧 Debug Mode Enabled', 'color: #00e0ff; font-size: 14px; font-weight: bold;');
  console.log('%cType debugInfo() to see system status', 'color: #888;');
  console.log('%cType disableDebug() to turn off debug mode', 'color: #888;');
}
