// ================================================================
// ONBOARDING SYSTEM
// ================================================================
// Provides first-run walkthrough for new users

console.log("%c🎓 Onboarding Loading...", "color:#0ff; font-weight: bold; font-size: 16px");

const ONBOARDING_KEY = 'innovation_engine_onboarding_completed';
const ONBOARDING_STEPS = [
  {
    title: "Welcome to Innovation Engine",
    description: "Discover people, skills, and collaborations in your innovation ecosystem. Let's take a quick tour!",
    target: null,
    position: "center",
    icon: "🌐"
  },
  {
    title: "The Network Graph",
    description: "Each node represents a person or project. Node size shows connection count, colors indicate skills and collaboration status.",
    target: "#synapse-svg",
    position: "center",
    icon: "🔮"
  },
  {
    title: "Click to Explore",
    description: "Click any node to view detailed profiles, mutual connections, and take actions like messaging, connecting, or inviting to projects.",
    target: "#synapse-svg",
    position: "center",
    icon: "👆"
  },
  {
    title: "Search & Filter",
    description: "Use the search bar to find people by name, skills, or projects. Filter the network to focus on specific expertise or collaboration opportunities.",
    target: "#global-search",
    position: "bottom",
    icon: "🔍"
  },
  {
    title: "Your Stats",
    description: "Monitor your messages, active projects, endorsements, and network growth from the bottom bar.",
    target: ".bottom-stats-bar",
    position: "top",
    icon: "📊"
  },
  {
    title: "Take Action",
    description: "Click these buttons to message connections, explore projects, edit your profile, or connect with new people.",
    target: ".bottom-stats-bar",
    position: "top",
    icon: "⚡"
  },
  {
    title: "You're Ready!",
    description: "Start exploring the network, connect with people who share your interests, and build something amazing together.",
    target: null,
    position: "center",
    icon: "🚀"
  }
];

let currentStep = 0;
let onboardingOverlay = null;

// Check if onboarding should run
export function shouldShowOnboarding() {
  const completed = localStorage.getItem(ONBOARDING_KEY);
  return !completed;
}

// Start onboarding
export function startOnboarding() {
  if (!shouldShowOnboarding()) return;

  console.log('🎓 Starting onboarding walkthrough');

  createOnboardingOverlay();
  showStep(0);
}

// Create overlay elements
function createOnboardingOverlay() {
  // Create overlay container
  onboardingOverlay = document.createElement('div');
  onboardingOverlay.id = 'onboarding-overlay';
  onboardingOverlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(4px);
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.3s;
  `;

  document.body.appendChild(onboardingOverlay);

  // Fade in
  setTimeout(() => {
    onboardingOverlay.style.opacity = '1';
  }, 10);
}

// Show specific step
function showStep(stepIndex) {
  currentStep = stepIndex;
  const step = ONBOARDING_STEPS[stepIndex];

  // Clear previous content
  onboardingOverlay.innerHTML = '';

  // Create step card
  const card = document.createElement('div');
  card.className = 'onboarding-card';
  card.style.cssText = `
    background: linear-gradient(135deg, rgba(10, 14, 39, 0.98), rgba(26, 26, 46, 0.98));
    border: 2px solid rgba(0, 224, 255, 0.5);
    border-radius: 16px;
    padding: 2rem;
    max-width: 500px;
    width: 90%;
    box-shadow: 0 20px 60px rgba(0, 224, 255, 0.3);
    text-align: center;
    animation: slideUp 0.3s ease-out;
  `;

  // Icon
  const icon = document.createElement('div');
  icon.style.cssText = `
    font-size: 4rem;
    margin-bottom: 1rem;
  `;
  icon.textContent = step.icon;
  card.appendChild(icon);

  // Title
  const title = document.createElement('h2');
  title.style.cssText = `
    color: #00e0ff;
    font-size: 1.75rem;
    margin-bottom: 1rem;
    font-weight: bold;
  `;
  title.textContent = step.title;
  card.appendChild(title);

  // Description
  const description = document.createElement('p');
  description.style.cssText = `
    color: #ddd;
    font-size: 1.1rem;
    line-height: 1.6;
    margin-bottom: 2rem;
  `;
  description.textContent = step.description;
  card.appendChild(description);

  // Progress indicator
  const progress = document.createElement('div');
  progress.style.cssText = `
    display: flex;
    gap: 0.5rem;
    justify-content: center;
    margin-bottom: 1.5rem;
  `;

  ONBOARDING_STEPS.forEach((_, index) => {
    const dot = document.createElement('div');
    dot.style.cssText = `
      width: ${index === stepIndex ? '32px' : '8px'};
      height: 8px;
      border-radius: 4px;
      background: ${index === stepIndex ? '#00e0ff' : 'rgba(255, 255, 255, 0.3)'};
      transition: all 0.3s;
    `;
    progress.appendChild(dot);
  });
  card.appendChild(progress);

  // Buttons
  const buttons = document.createElement('div');
  buttons.style.cssText = `
    display: flex;
    gap: 1rem;
    justify-content: center;
  `;

  // Skip button (only show if not last step)
  if (stepIndex < ONBOARDING_STEPS.length - 1) {
    const skipBtn = document.createElement('button');
    skipBtn.textContent = 'Skip Tour';
    skipBtn.style.cssText = `
      padding: 0.75rem 1.5rem;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      color: white;
      cursor: pointer;
      font-weight: bold;
      font-size: 1rem;
      transition: all 0.2s;
    `;
    skipBtn.onmouseover = () => {
      skipBtn.style.background = 'rgba(255, 255, 255, 0.2)';
      skipBtn.style.transform = 'translateY(-2px)';
    };
    skipBtn.onmouseout = () => {
      skipBtn.style.background = 'rgba(255, 255, 255, 0.1)';
      skipBtn.style.transform = 'translateY(0)';
    };
    skipBtn.onclick = finishOnboarding;
    buttons.appendChild(skipBtn);
  }

  // Next/Finish button
  const nextBtn = document.createElement('button');
  nextBtn.textContent = stepIndex === ONBOARDING_STEPS.length - 1 ? 'Get Started!' : 'Next';
  nextBtn.style.cssText = `
    padding: 0.75rem 2rem;
    background: linear-gradient(135deg, #00e0ff, #0080ff);
    border: none;
    border-radius: 8px;
    color: white;
    cursor: pointer;
    font-weight: bold;
    font-size: 1rem;
    box-shadow: 0 4px 12px rgba(0, 224, 255, 0.4);
    transition: all 0.2s;
  `;
  nextBtn.onmouseover = () => {
    nextBtn.style.transform = 'translateY(-2px) scale(1.05)';
    nextBtn.style.boxShadow = '0 6px 20px rgba(0, 224, 255, 0.6)';
  };
  nextBtn.onmouseout = () => {
    nextBtn.style.transform = 'translateY(0) scale(1)';
    nextBtn.style.boxShadow = '0 4px 12px rgba(0, 224, 255, 0.4)';
  };
  nextBtn.onclick = () => {
    if (stepIndex === ONBOARDING_STEPS.length - 1) {
      finishOnboarding();
    } else {
      showStep(stepIndex + 1);
    }
  };
  buttons.appendChild(nextBtn);

  card.appendChild(buttons);

  // Highlight target element if specified
  if (step.target) {
    highlightElement(step.target);
  }

  onboardingOverlay.appendChild(card);
}

// Highlight target element
function highlightElement(selector) {
  const element = document.querySelector(selector);
  if (!element) return;

  const rect = element.getBoundingClientRect();

  // Create highlight overlay
  const highlight = document.createElement('div');
  highlight.className = 'onboarding-highlight';
  highlight.style.cssText = `
    position: fixed;
    top: ${rect.top - 10}px;
    left: ${rect.left - 10}px;
    width: ${rect.width + 20}px;
    height: ${rect.height + 20}px;
    border: 3px solid #00e0ff;
    border-radius: 12px;
    pointer-events: none;
    z-index: 9999;
    box-shadow: 0 0 20px rgba(0, 224, 255, 0.6);
    animation: pulse 2s infinite;
  `;

  document.body.appendChild(highlight);

  // Remove highlight when step changes
  setTimeout(() => {
    highlight.remove();
  }, 5000);
}

// Finish onboarding
function finishOnboarding() {
  console.log('✅ Onboarding completed');

  // Mark as completed
  localStorage.setItem(ONBOARDING_KEY, 'true');

  // Fade out and remove
  if (onboardingOverlay) {
    onboardingOverlay.style.opacity = '0';
    setTimeout(() => {
      onboardingOverlay.remove();
      onboardingOverlay = null;
    }, 300);
  }

  // Show success toast
  showToast('Welcome to Innovation Engine! Start exploring the network.', 'success');
}

// Show toast notification
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    bottom: 2rem;
    right: 2rem;
    background: ${type === 'success' ? 'linear-gradient(135deg, #00ff88, #00cc66)' : 'linear-gradient(135deg, #00e0ff, #0080ff)'};
    color: white;
    padding: 1rem 1.5rem;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 10001;
    font-weight: bold;
    animation: slideIn 0.3s ease-out;
  `;
  toast.textContent = message;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease-in';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Add animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(30px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.7;
      transform: scale(1.05);
    }
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateX(100px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  @keyframes slideOut {
    from {
      opacity: 1;
      transform: translateX(0);
    }
    to {
      opacity: 0;
      transform: translateX(100px);
    }
  }
`;
document.head.appendChild(style);

// Reset onboarding (for testing)
export function resetOnboarding() {
  localStorage.removeItem(ONBOARDING_KEY);
  console.log('🔄 Onboarding reset');
}

// Auto-start on profile load
window.addEventListener('profile-loaded', () => {
  // Wait a moment for UI to settle
  setTimeout(() => {
    if (shouldShowOnboarding()) {
      startOnboarding();
    }
  }, 1000);
});

console.log('✅ Onboarding system ready');
