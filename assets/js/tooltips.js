// Tooltip System
// Contextual help for UI elements

const tooltips = {
  'btn-start-center': 'Begin your innovation journey',
  'btn-refresh-network': 'Update network visualization',
  'btn-profile': 'View and edit your profile',
  'btn-logout': 'Sign out of your account',
  'search-input': 'Search people, projects, and themes',
  'notification-bell': 'View notifications',
  'admin-crown': 'Admin dashboard'
};

function initTooltips() {
  Object.entries(tooltips).forEach(([id, text]) => {
    const el = document.getElementById(id);
    if (!el) return;
    
    el.setAttribute('data-tooltip', text);
    el.addEventListener('mouseenter', showTooltip);
    el.addEventListener('mouseleave', hideTooltip);
  });
}

function showTooltip(e) {
  const text = e.target.getAttribute('data-tooltip');
  if (!text) return;
  
  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip';
  tooltip.textContent = text;
  tooltip.id = 'active-tooltip';
  
  document.body.appendChild(tooltip);
  
  const rect = e.target.getBoundingClientRect();
  tooltip.style.left = `${rect.left + rect.width / 2}px`;
  tooltip.style.top = `${rect.top - 10}px`;
  tooltip.style.transform = 'translate(-50%, -100%)';
}

function hideTooltip() {
  const tooltip = document.getElementById('active-tooltip');
  if (tooltip) tooltip.remove();
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', initTooltips);
}
