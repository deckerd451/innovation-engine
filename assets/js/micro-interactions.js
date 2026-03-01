// Micro-interactions
// Small animations and feedback

function initMicroInteractions() {
  addButtonRipples();
  addSuccessAnimations();
  addCardHoverEffects();
}

function addButtonRipples() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button, .action-btn, .btn-primary, .btn-secondary');
    if (!btn) return;
    
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    
    btn.style.position = 'relative';
    btn.style.overflow = 'hidden';
    btn.appendChild(ripple);
    
    setTimeout(() => ripple.remove(), 600);
  });
}

function addSuccessAnimations() {
  window.addEventListener('connection-accepted', showSuccessConfetti);
  window.addEventListener('profile-updated', showSuccessCheckmark);
}

function showSuccessConfetti() {
  const colors = ['#00e0ff', '#ffcf33', '#4caf50', '#ff6b6b'];
  const confettiCount = 50;
  
  for (let i = 0; i < confettiCount; i++) {
    const confetti = document.createElement('div');
    confetti.className = 'confetti';
    confetti.style.left = `${Math.random() * 100}%`;
    confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
    confetti.style.animationDelay = `${Math.random() * 0.5}s`;
    confetti.style.animationDuration = `${2 + Math.random()}s`;
    
    document.body.appendChild(confetti);
    setTimeout(() => confetti.remove(), 3000);
  }
}

function showSuccessCheckmark(e) {
  const target = e.detail?.target || document.body;
  const checkmark = document.createElement('div');
  checkmark.className = 'success-checkmark';
  checkmark.innerHTML = '<i class="fas fa-check-circle"></i>';
  
  if (target === document.body) {
    checkmark.style.position = 'fixed';
    checkmark.style.top = '50%';
    checkmark.style.left = '50%';
    checkmark.style.transform = 'translate(-50%, -50%)';
  } else {
    const rect = target.getBoundingClientRect();
    checkmark.style.position = 'fixed';
    checkmark.style.top = `${rect.top + rect.height / 2}px`;
    checkmark.style.left = `${rect.left + rect.width / 2}px`;
    checkmark.style.transform = 'translate(-50%, -50%)';
  }
  
  document.body.appendChild(checkmark);
  setTimeout(() => checkmark.remove(), 1000);
}

function addCardHoverEffects() {
  const observer = new MutationObserver(() => {
    document.querySelectorAll('.connection-card, .project-card, .theme-card').forEach(card => {
      if (card.dataset.hoverEnabled) return;
      card.dataset.hoverEnabled = 'true';
      
      card.addEventListener('mouseenter', function() {
        this.style.transform = 'translateY(-4px)';
      });
      
      card.addEventListener('mouseleave', function() {
        this.style.transform = 'translateY(0)';
      });
    });
  });
  
  observer.observe(document.body, { childList: true, subtree: true });
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', initMicroInteractions);
}
