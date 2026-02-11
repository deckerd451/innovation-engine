// ================================================================
// LANGUAGE MANAGER
// ================================================================
// Language selector and management UI components

console.log("%c🌐 Language Manager Loading...", "color:#00e0ff; font-weight: bold; font-size: 16px");

// Initialize language manager
export function initLanguageManager() {
  // Add language selector to header
  addLanguageSelectorToHeader();
  
  // Setup language change handlers
  setupLanguageChangeHandlers();

  console.log('✅ Language manager initialized');
}

// Add language selector to header
function addLanguageSelectorToHeader() {
  const header = document.querySelector('.header-actions');
  if (!header) return;

  // Check if selector already exists
  if (document.getElementById('language-selector')) return;

  const currentLang = window.getSupportedLanguages()[window.getCurrentLanguage()];
  
  const languageSelector = document.createElement('div');
  languageSelector.id = 'language-selector';
  languageSelector.style.cssText = `
    position: relative;
    margin-right: 0.75rem;
  `;

  languageSelector.innerHTML = `
    <button class="language-selector-btn" style="
      background: rgba(0, 224, 255, 0.1);
      border: 1px solid rgba(0, 224, 255, 0.3);
      border-radius: 8px;
      color: #00e0ff;
      padding: 0.5rem 1rem;
      cursor: pointer;
      font-weight: 600;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      font-size: 0.9rem;
    " onmouseover="this.style.background='rgba(0, 224, 255, 0.2)'; this.style.borderColor='rgba(0, 224, 255, 0.5)'"
       onmouseout="this.style.background='rgba(0, 224, 255, 0.1)'; this.style.borderColor='rgba(0, 224, 255, 0.3)'">
      <span style="margin-right: 0.5rem;">${currentLang.flag}</span>
      <span>${currentLang.nativeName}</span>
      <i class="fas fa-chevron-down" style="margin-left: 0.5rem; font-size: 0.8rem;"></i>
    </button>

    <div class="language-dropdown" style="
      position: absolute;
      top: 100%;
      right: 0;
      background: linear-gradient(135deg, rgba(10, 14, 39, 0.98), rgba(26, 26, 46, 0.98));
      border: 2px solid rgba(0, 224, 255, 0.3);
      border-radius: 12px;
      backdrop-filter: blur(10px);
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
      min-width: 200px;
      z-index: 10000;
      display: none;
      margin-top: 0.5rem;
      overflow: hidden;
    ">
      <div style="
        padding: 1rem 0;
      ">
        ${Object.entries(window.getSupportedLanguages()).map(([code, lang]) => `
          <button onclick="selectLanguage('${code}')" style="
            width: 100%;
            background: none;
            border: none;
            color: ${code === window.getCurrentLanguage() ? '#00e0ff' : 'rgba(255, 255, 255, 0.8)'};
            padding: 0.75rem 1.5rem;
            text-align: left;
            cursor: pointer;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            gap: 0.75rem;
            font-size: 0.9rem;
            ${code === window.getCurrentLanguage() ? 'background: rgba(0, 224, 255, 0.1);' : ''}
          " onmouseover="this.style.background='rgba(0, 224, 255, 0.1)'; this.style.color='#00e0ff'"
             onmouseout="this.style.background='${code === window.getCurrentLanguage() ? 'rgba(0, 224, 255, 0.1)' : 'none'}'; this.style.color='${code === window.getCurrentLanguage() ? '#00e0ff' : 'rgba(255, 255, 255, 0.8)'}'">
            <span style="font-size: 1.2rem;">${lang.flag}</span>
            <div>
              <div style="font-weight: 600;">${lang.nativeName}</div>
              <div style="font-size: 0.8rem; opacity: 0.7;">${lang.name}</div>
            </div>
            ${code === window.getCurrentLanguage() ? '<i class="fas fa-check" style="margin-left: auto; color: #00e0ff;"></i>' : ''}
          </button>
        `).join('')}
      </div>
    </div>
  `;

  // Insert before the user menu
  const userMenu = header.querySelector('.user-menu');
  if (userMenu) {
    header.insertBefore(languageSelector, userMenu);
  } else {
    header.appendChild(languageSelector);
  }

  // Setup dropdown toggle
  const button = languageSelector.querySelector('.language-selector-btn');
  const dropdown = languageSelector.querySelector('.language-dropdown');

  button.addEventListener('click', (e) => {
    e.stopPropagation();
    const isVisible = dropdown.style.display !== 'none';
    
    // Close all other dropdowns
    document.querySelectorAll('.language-dropdown').forEach(d => {
      if (d !== dropdown) d.style.display = 'none';
    });
    
    dropdown.style.display = isVisible ? 'none' : 'block';
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', () => {
    dropdown.style.display = 'none';
  });

  // Prevent dropdown from closing when clicking inside
  dropdown.addEventListener('click', (e) => {
    e.stopPropagation();
  });
}

// Select language function
window.selectLanguage = async function(languageCode) {
  console.log('🌍 Language selected:', languageCode);
  
  // Close dropdown
  const dropdown = document.querySelector('.language-dropdown');
  if (dropdown) {
    dropdown.style.display = 'none';
  }

  // Set language
  if (window.setLanguage) {
    await window.setLanguage(languageCode);
  }

  // Update dropdown to reflect new selection
  updateLanguageDropdown();
};

// Update language dropdown
function updateLanguageDropdown() {
  const dropdown = document.querySelector('.language-dropdown');
  if (!dropdown) return;

  const currentLang = window.getCurrentLanguage();
  
  // Update button states
  dropdown.querySelectorAll('button').forEach(button => {
    const langCode = button.getAttribute('onclick').match(/'([^']+)'/)[1];
    const isSelected = langCode === currentLang;
    
    button.style.color = isSelected ? '#00e0ff' : 'rgba(255, 255, 255, 0.8)';
    button.style.background = isSelected ? 'rgba(0, 224, 255, 0.1)' : 'none';
    
    // Update check icon
    const checkIcon = button.querySelector('.fa-check');
    if (checkIcon) {
      checkIcon.remove();
    }
    
    if (isSelected) {
      button.innerHTML += '<i class="fas fa-check" style="margin-left: auto; color: #00e0ff;"></i>';
    }
  });
}

// Setup language change handlers
function setupLanguageChangeHandlers() {
  // Listen for language changes and update UI components
  document.addEventListener('languageChanged', () => {
    updateLanguageDropdown();
    updateLanguageDependentComponents();
  });
}

// Update components that depend on language
function updateLanguageDependentComponents() {
  // Update date displays
  updateDateDisplays();
  
  // Update number displays
  updateNumberDisplays();
  
  // Update analytics dashboard if open
  updateAnalyticsDashboard();
  
  // Update notification messages
  updateNotificationMessages();
}

// Update date displays
function updateDateDisplays() {
  document.querySelectorAll('[data-date]').forEach(element => {
    const dateValue = element.getAttribute('data-date');
    if (dateValue && window.formatDate) {
      element.textContent = window.formatDate(new Date(dateValue));
    }
  });
}

// Update number displays
function updateNumberDisplays() {
  document.querySelectorAll('[data-number]').forEach(element => {
    const numberValue = element.getAttribute('data-number');
    if (numberValue && window.formatNumber) {
      element.textContent = window.formatNumber(parseFloat(numberValue));
    }
  });
}

// Update analytics dashboard
function updateAnalyticsDashboard() {
  const analyticsDashboard = document.getElementById('analytics-dashboard');
  if (analyticsDashboard && analyticsDashboard.style.display !== 'none') {
    // Refresh analytics content with new language
    setTimeout(() => {
      if (window.showAnalyticsTab) {
        const activeTab = document.querySelector('.analytics-tab-btn.active');
        if (activeTab) {
          const tabName = activeTab.getAttribute('data-tab');
          window.showAnalyticsTab(tabName);
        }
      }
    }, 100);
  }
}

// Update notification messages
function updateNotificationMessages() {
  // Update any persistent notifications
  document.querySelectorAll('.notification-message').forEach(notification => {
    const messageKey = notification.getAttribute('data-message-key');
    if (messageKey && window.t) {
      notification.textContent = window.t(messageKey);
    }
  });
}

// Add language selector to START flow
function addLanguageToStartFlow() {
  const startModal = document.getElementById('start-modal');
  if (!startModal) return;

  // Check if already added
  if (startModal.querySelector('.start-language-selector')) return;

  // Find the quick actions section
  const quickActionsSection = startModal.querySelector('[style*="Quick Actions"]');
  if (!quickActionsSection) return;

  // Create language selector for START flow
  const languageBtn = document.createElement('button');
  languageBtn.className = 'start-action-btn start-language-selector';
  languageBtn.style.cssText = `
    background: rgba(0, 224, 255, 0.1);
    border: 1px solid rgba(0, 224, 255, 0.3);
    border-radius: 8px;
    padding: 1rem;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 0.75rem;
  `;

  const currentLang = window.getSupportedLanguages()[window.getCurrentLanguage()];
  
  languageBtn.innerHTML = `
    <div style="font-size: 1.5rem; color: #00e0ff;">
      ${currentLang.flag}
    </div>
    <div style="text-align: left;">
      <div style="color: #fff; font-size: 0.9rem; font-weight: 600;" data-i18n="start.language_selector">Language</div>
      <div style="color: rgba(255, 255, 255, 0.5); font-size: 0.75rem;">${currentLang.nativeName}</div>
    </div>
  `;

  languageBtn.onclick = () => {
    const dropdown = document.querySelector('.language-dropdown');
    if (dropdown) {
      dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    }
  };

  // Add to quick actions grid
  const actionsGrid = quickActionsSection.querySelector('[style*="grid"]');
  if (actionsGrid) {
    actionsGrid.appendChild(languageBtn);
  }
}

// Listen for START modal opens
document.addEventListener('click', (e) => {
  if (e.target.closest('#btn-start')) {
    setTimeout(() => {
      addLanguageToStartFlow();
    }, 100);
  }
});

// Mobile responsive adjustments
function adjustLanguageSelectorForMobile() {
  const isMobile = window.innerWidth <= 768;
  const selector = document.getElementById('language-selector');
  
  if (selector && isMobile) {
    const button = selector.querySelector('.language-selector-btn');
    if (button) {
      // Show only flag on mobile
      const flag = button.querySelector('span:first-child');
      const text = button.querySelector('span:nth-child(2)');
      
      if (flag && text) {
        text.style.display = 'none';
        button.style.padding = '0.5rem';
      }
    }
  }
}

// Listen for window resize
window.addEventListener('resize', adjustLanguageSelectorForMobile);

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  // Wait for i18n engine to be ready
  setTimeout(() => {
    initLanguageManager();
    adjustLanguageSelectorForMobile();
  }, 100);
});

console.log('✅ Language manager ready');