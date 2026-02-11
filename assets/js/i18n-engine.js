// ================================================================
// INTERNATIONALIZATION ENGINE
// ================================================================
// Multi-language support system for CharlestonHacks Innovation Engine

console.log("%c🌍 Internationalization Engine Loading...", "color:#00e0ff; font-weight: bold; font-size: 16px");

let currentLanguage = 'en';
let translations = {};
let fallbackTranslations = {};
let isInitialized = false;

// Supported languages
const SUPPORTED_LANGUAGES = {
  'en': { name: 'English', nativeName: 'English', flag: '🇺🇸' },
  'es': { name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
  'fr': { name: 'French', nativeName: 'Français', flag: '🇫🇷' },
  'de': { name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
  'pt': { name: 'Portuguese', nativeName: 'Português', flag: '🇵🇹' },
  'zh-CN': { name: 'Chinese Simplified', nativeName: '简体中文', flag: '🇨🇳' },
  'ja': { name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
  'ko': { name: 'Korean', nativeName: '한국어', flag: '🇰🇷' }
};

// Initialize internationalization system
export function initI18nEngine() {
  // Get saved language preference or detect browser language
  const savedLanguage = localStorage.getItem('preferred_language');
  const browserLanguage = detectBrowserLanguage();
  
  currentLanguage = savedLanguage || browserLanguage || 'en';
  
  // Expose functions globally
  window.t = translate;
  window.setLanguage = setLanguage;
  window.getCurrentLanguage = getCurrentLanguage;
  window.getSupportedLanguages = getSupportedLanguages;
  window.formatDate = formatDate;
  window.formatNumber = formatNumber;
  window.updateUILanguage = updateUILanguage;

  // Load translations
  loadTranslations(currentLanguage);

  console.log('✅ Internationalization engine initialized with language:', currentLanguage);
}

// Detect browser language
function detectBrowserLanguage() {
  const browserLang = navigator.language || navigator.userLanguage;
  
  // Check for exact match
  if (SUPPORTED_LANGUAGES[browserLang]) {
    return browserLang;
  }
  
  // Check for language code match (e.g., 'en-US' -> 'en')
  const langCode = browserLang.split('-')[0];
  if (SUPPORTED_LANGUAGES[langCode]) {
    return langCode;
  }
  
  // Check for Chinese variants
  if (browserLang.startsWith('zh')) {
    return 'zh-CN';
  }
  
  return 'en'; // Default fallback
}

// Load translation files
async function loadTranslations(language) {
  try {
    // Load fallback translations (English) first
    if (language !== 'en' && Object.keys(fallbackTranslations).length === 0) {
      const fallbackResponse = await fetch('assets/locales/en.json');
      if (fallbackResponse.ok) {
        fallbackTranslations = await fallbackResponse.json();
      }
    }

    // Load target language translations
    const response = await fetch(`assets/locales/${language}.json`);
    if (response.ok) {
      translations = await response.json();
      isInitialized = true;
      
      // Update UI after translations are loaded
      updateUILanguage();
      
      console.log(`✅ Translations loaded for: ${language}`);
    } else {
      console.warn(`⚠️ Translation file not found for: ${language}, using fallback`);
      translations = fallbackTranslations;
      isInitialized = true;
      updateUILanguage();
    }
  } catch (error) {
    console.error('❌ Error loading translations:', error);
    translations = fallbackTranslations;
    isInitialized = true;
    updateUILanguage();
  }
}

// Translate function
window.t = function(key, params = {}) {
  if (!isInitialized) {
    return key; // Return key if not initialized yet
  }

  // Get translation from current language or fallback
  let translation = getNestedValue(translations, key) || getNestedValue(fallbackTranslations, key) || key;
  
  // Replace parameters in translation
  Object.keys(params).forEach(param => {
    const placeholder = `{{${param}}}`;
    translation = translation.replace(new RegExp(placeholder, 'g'), params[param]);
  });

  return translation;
};

// Get nested value from object using dot notation
function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => current && current[key], obj);
}

// Set language
window.setLanguage = async function(language) {
  if (!SUPPORTED_LANGUAGES[language]) {
    console.warn(`⚠️ Unsupported language: ${language}`);
    return;
  }

  if (language === currentLanguage) {
    return; // Already using this language
  }

  console.log(`🌍 Switching language to: ${language}`);
  
  currentLanguage = language;
  localStorage.setItem('preferred_language', language);
  
  // Load new translations
  await loadTranslations(language);
  
  // Track language change
  if (window.trackEvent) {
    window.trackEvent('language_changed', {
      from_language: currentLanguage,
      to_language: language,
      timestamp: new Date().toISOString()
    });
  }

  // Show notification
  if (window.showSynapseNotification) {
    window.showSynapseNotification(
      t('notifications.language_changed', { language: SUPPORTED_LANGUAGES[language].nativeName }),
      'success'
    );
  }
};

// Get current language
window.getCurrentLanguage = function() {
  return currentLanguage;
};

// Get supported languages
window.getSupportedLanguages = function() {
  return SUPPORTED_LANGUAGES;
};

// Update UI language
window.updateUILanguage = function() {
  if (!isInitialized) return;

  console.log('🔄 Updating UI language...');

  // Update elements with data-i18n attribute
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    const translation = t(key);
    
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      if (element.type === 'submit' || element.type === 'button') {
        element.value = translation;
      } else {
        element.placeholder = translation;
      }
    } else {
      element.textContent = translation;
    }
  });

  // Update elements with data-i18n-html attribute (for HTML content)
  document.querySelectorAll('[data-i18n-html]').forEach(element => {
    const key = element.getAttribute('data-i18n-html');
    element.innerHTML = t(key);
  });

  // Update title attributes
  document.querySelectorAll('[data-i18n-title]').forEach(element => {
    const key = element.getAttribute('data-i18n-title');
    element.title = t(key);
  });

  // Update aria-label attributes
  document.querySelectorAll('[data-i18n-aria]').forEach(element => {
    const key = element.getAttribute('data-i18n-aria');
    element.setAttribute('aria-label', t(key));
  });

  // Update document title if specified
  const titleElement = document.querySelector('[data-i18n-page-title]');
  if (titleElement) {
    const key = titleElement.getAttribute('data-i18n-page-title');
    document.title = t(key);
  }

  // Update language selector if present
  updateLanguageSelector();

  console.log('✅ UI language updated');
};

// Update language selector
function updateLanguageSelector() {
  const languageSelector = document.getElementById('language-selector');
  if (languageSelector) {
    const currentLang = SUPPORTED_LANGUAGES[currentLanguage];
    const button = languageSelector.querySelector('.language-selector-btn');
    if (button) {
      button.innerHTML = `
        <span style="margin-right: 0.5rem;">${currentLang.flag}</span>
        <span>${currentLang.nativeName}</span>
        <i class="fas fa-chevron-down" style="margin-left: 0.5rem; font-size: 0.8rem;"></i>
      `;
    }
  }
}

// Format date according to locale
window.formatDate = function(date, options = {}) {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  const defaultOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    ...options
  };

  try {
    return new Intl.DateTimeFormat(getLocaleCode(currentLanguage), defaultOptions).format(dateObj);
  } catch (error) {
    console.warn('Date formatting error:', error);
    return dateObj.toLocaleDateString();
  }
};

// Format number according to locale
window.formatNumber = function(number, options = {}) {
  try {
    return new Intl.NumberFormat(getLocaleCode(currentLanguage), options).format(number);
  } catch (error) {
    console.warn('Number formatting error:', error);
    return number.toString();
  }
};

// Get locale code for Intl API
function getLocaleCode(language) {
  const localeMap = {
    'en': 'en-US',
    'es': 'es-ES',
    'fr': 'fr-FR',
    'de': 'de-DE',
    'pt': 'pt-PT',
    'zh-CN': 'zh-CN',
    'ja': 'ja-JP',
    'ko': 'ko-KR'
  };
  
  return localeMap[language] || 'en-US';
}

// Pluralization helper
window.plural = function(key, count, params = {}) {
  const pluralKey = count === 1 ? `${key}.singular` : `${key}.plural`;
  return t(pluralKey, { count, ...params });
};

// RTL language detection
function isRTLLanguage(language) {
  const rtlLanguages = ['ar', 'he', 'fa', 'ur'];
  return rtlLanguages.includes(language);
}

// Apply RTL styles if needed
function applyRTLStyles() {
  if (isRTLLanguage(currentLanguage)) {
    document.documentElement.setAttribute('dir', 'rtl');
    document.body.classList.add('rtl');
  } else {
    document.documentElement.setAttribute('dir', 'ltr');
    document.body.classList.remove('rtl');
  }
}

// Listen for language change events
document.addEventListener('languageChanged', (e) => {
  const { language } = e.detail;
  setLanguage(language);
});

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initI18nEngine();
});

// Auto-update UI when new elements are added
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        // Update new elements with i18n attributes
        const i18nElements = node.querySelectorAll ? node.querySelectorAll('[data-i18n], [data-i18n-html], [data-i18n-title], [data-i18n-aria]') : [];
        if (i18nElements.length > 0 && isInitialized) {
          setTimeout(() => updateUILanguage(), 100);
        }
      }
    });
  });
});

// Start observing
observer.observe(document.body, {
  childList: true,
  subtree: true
});

console.log('✅ Internationalization engine ready');