/**
 * Mobile Safe Area Debug Helper
 * ==============================
 * Logs computed safe-area values, viewport dimensions, and HUD heights.
 * Only runs on mobile devices when unified network is enabled.
 */

(function() {
  'use strict';

  // Only run on mobile viewports
  const isMobile = window.innerWidth <= 768;
  if (!isMobile) {
    return;
  }

  // Only run when unified network is enabled.
  // Default ON: only disabled when explicitly set to 'false'.
  // Matches the canonical check in unified-network-integration.js.
  const isUnifiedEnabled = localStorage.getItem('enable-unified-network') !== 'false';
  if (!isUnifiedEnabled) {
    console.log('📱 Mobile Safe Area Debug: Unified Network not enabled, skipping debug');
    return;
  }

  /**
   * Get computed CSS variable value
   */
  function getCSSVar(name) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || '0px';
  }

  /**
   * Parse px value to number
   */
  function pxToNumber(value) {
    const match = value.match(/^([\d.]+)px$/);
    return match ? parseFloat(match[1]) : 0;
  }

  /**
   * Log safe area debug info
   */
  function logSafeAreaDebug() {
    const debugInfo = {
      timestamp: new Date().toISOString(),
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        outerWidth: window.outerWidth,
        outerHeight: window.outerHeight,
        screenWidth: window.screen.width,
        screenHeight: window.screen.height,
        devicePixelRatio: window.devicePixelRatio,
        orientation: window.screen.orientation?.type || 'unknown'
      },
      safeArea: {
        top: getCSSVar('--safe-top'),
        right: getCSSVar('--safe-right'),
        bottom: getCSSVar('--safe-bottom'),
        left: getCSSVar('--safe-left'),
        topPx: pxToNumber(getCSSVar('--safe-top')),
        bottomPx: pxToNumber(getCSSVar('--safe-bottom'))
      },
      hud: {
        top: getCSSVar('--hud-top'),
        bottom: getCSSVar('--hud-bottom'),
        topPx: pxToNumber(getCSSVar('--hud-top')),
        bottomPx: pxToNumber(getCSSVar('--hud-bottom'))
      },
      calculated: {
        availableHeight: 0,
        contentArea: {
          top: 0,
          bottom: 0,
          height: 0
        }
      },
      device: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        vendor: navigator.vendor,
        isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream,
        isAndroid: /Android/.test(navigator.userAgent),
        hasNotch: false
      }
    };

    // Calculate available height for content
    const totalTop = debugInfo.safeArea.topPx + debugInfo.hud.topPx;
    const totalBottom = debugInfo.safeArea.bottomPx + debugInfo.hud.bottomPx;
    debugInfo.calculated.availableHeight = window.innerHeight - totalTop - totalBottom;
    debugInfo.calculated.contentArea.top = totalTop;
    debugInfo.calculated.contentArea.bottom = totalBottom;
    debugInfo.calculated.contentArea.height = debugInfo.calculated.availableHeight;

    // Detect notch (safe-area-inset-top > 20px usually indicates notch)
    debugInfo.device.hasNotch = debugInfo.safeArea.topPx > 20;

    // Log to console
    console.group('📱 Mobile Safe Area Debug Info');
    console.log('%c🖥️ Viewport', 'color: #4488ff; font-weight: bold');
    console.table(debugInfo.viewport);
    console.log('%c📐 Safe Area Insets', 'color: #00e0ff; font-weight: bold');
    console.table(debugInfo.safeArea);
    console.log('%c🎯 HUD Heights', 'color: #00ff88; font-weight: bold');
    console.table(debugInfo.hud);
    console.log('%c📊 Calculated Content Area', 'color: #ffaa00; font-weight: bold');
    console.table(debugInfo.calculated);
    console.log('%c📱 Device Info', 'color: #a855f7; font-weight: bold');
    console.table(debugInfo.device);
    console.groupEnd();

    // Also log as a single object for easy copying
    console.log('%c📋 Full Debug Object (copy to share)', 'color: #ff6b6b; font-weight: bold');
    console.log(JSON.stringify(debugInfo, null, 2));

    // Visual overlay (optional - can be enabled by setting debug flag)
    if (localStorage.getItem('mobile-safe-area-visual-debug') === 'true') {
      showVisualDebugOverlay(debugInfo);
    }
  }

  /**
   * Show visual debug overlay on screen
   */
  function showVisualDebugOverlay(debugInfo) {
    // Remove existing overlay
    const existing = document.getElementById('mobile-safe-area-debug-overlay');
    if (existing) {
      existing.remove();
    }

    const overlay = document.createElement('div');
    overlay.id = 'mobile-safe-area-debug-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      pointer-events: none;
      z-index: 999999;
      font-family: ui-monospace, monospace;
      font-size: 10px;
    `;

    // Top safe area
    const topBar = document.createElement('div');
    topBar.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: ${debugInfo.safeArea.top};
      background: rgba(255, 0, 0, 0.3);
      border-bottom: 2px solid red;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
    `;
    topBar.textContent = `Safe Top: ${debugInfo.safeArea.top}`;
    overlay.appendChild(topBar);

    // Bottom safe area
    const bottomBar = document.createElement('div');
    bottomBar.style.cssText = `
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: ${debugInfo.safeArea.bottom};
      background: rgba(255, 0, 0, 0.3);
      border-top: 2px solid red;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
    `;
    bottomBar.textContent = `Safe Bottom: ${debugInfo.safeArea.bottom}`;
    overlay.appendChild(bottomBar);

    // HUD top
    const hudTop = document.createElement('div');
    hudTop.style.cssText = `
      position: absolute;
      top: ${debugInfo.safeArea.top};
      left: 0;
      right: 0;
      height: ${debugInfo.hud.top};
      background: rgba(0, 224, 255, 0.2);
      border-bottom: 2px dashed cyan;
      display: flex;
      align-items: center;
      justify-content: center;
      color: cyan;
      font-weight: bold;
    `;
    hudTop.textContent = `HUD Top: ${debugInfo.hud.top}`;
    overlay.appendChild(hudTop);

    // HUD bottom
    const hudBottom = document.createElement('div');
    hudBottom.style.cssText = `
      position: absolute;
      bottom: ${debugInfo.safeArea.bottom};
      left: 0;
      right: 0;
      height: ${debugInfo.hud.bottom};
      background: rgba(0, 224, 255, 0.2);
      border-top: 2px dashed cyan;
      display: flex;
      align-items: center;
      justify-content: center;
      color: cyan;
      font-weight: bold;
    `;
    hudBottom.textContent = `HUD Bottom: ${debugInfo.hud.bottom}`;
    overlay.appendChild(hudBottom);

    // Info label
    const infoLabel = document.createElement('div');
    infoLabel.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 12px;
      border-radius: 8px;
      border: 2px solid #00e0ff;
      text-align: center;
      max-width: 80%;
    `;
    infoLabel.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 8px;">Safe Area Debug</div>
      <div>Content Height: ${debugInfo.calculated.availableHeight}px</div>
      <div>Device: ${debugInfo.device.isIOS ? 'iOS' : debugInfo.device.isAndroid ? 'Android' : 'Other'}</div>
      <div>Notch: ${debugInfo.device.hasNotch ? 'Yes' : 'No'}</div>
      <div style="margin-top: 8px; font-size: 9px; opacity: 0.7;">
        Set localStorage['mobile-safe-area-visual-debug']='false' to hide
      </div>
    `;
    overlay.appendChild(infoLabel);

    document.body.appendChild(overlay);

    // Auto-remove after 10 seconds
    setTimeout(() => {
      overlay.remove();
    }, 10000);
  }

  /**
   * Initialize debug helper
   */
  function init() {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(logSafeAreaDebug, 1000);
      });
    } else {
      setTimeout(logSafeAreaDebug, 1000);
    }

    // Re-log on orientation change only when visual debug is active
    window.addEventListener('orientationchange', () => {
      if (localStorage.getItem('mobile-safe-area-visual-debug') === 'true') {
        setTimeout(logSafeAreaDebug, 500);
      }
    });

    // Re-log on resize only when visual debug is active (prevents console flood on DevTools resize)
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      if (localStorage.getItem('mobile-safe-area-visual-debug') === 'true') {
        resizeTimer = setTimeout(logSafeAreaDebug, 500);
      }
    });

    console.log('📱 Mobile Safe Area Debug Helper initialized');
    console.log('💡 Tip: Set localStorage["mobile-safe-area-visual-debug"]="true" to see visual overlay');
  }

  // Export to window for manual testing
  window.mobileSafeAreaDebug = {
    log: logSafeAreaDebug,
    showVisual: () => {
      localStorage.setItem('mobile-safe-area-visual-debug', 'true');
      logSafeAreaDebug();
    },
    hideVisual: () => {
      localStorage.removeItem('mobile-safe-area-visual-debug');
      const overlay = document.getElementById('mobile-safe-area-debug-overlay');
      if (overlay) overlay.remove();
    }
  };

  // Initialize
  init();

})();
