/**
 * Accessibility Module
 * 
 * Provides accessibility features for the Unified Network Discovery system:
 * - Screen reader announcements for focus changes
 * - Keyboard navigation support
 * - Color contrast verification
 * - Reduced motion preference support
 * - ARIA attributes for interactive elements
 * 
 * Requirements: 8.3
 */

import { logger } from '../logger.js';

export class AccessibilityManager {
  constructor() {
    this.announcer = null;
    this.reducedMotion = false;
    this.keyboardNavigationEnabled = false;
    this.focusedNodeId = null;
    
    logger.info('AccessibilityManager', 'Initialized');
  }
  
  /**
   * Initialize accessibility features
   */
  initialize(container) {
    this.container = container;
    
    // Create screen reader announcer
    this.createAnnouncer();
    
    // Check for reduced motion preference
    this.checkReducedMotion();
    
    // Setup keyboard navigation
    this.setupKeyboardNavigation();
    
    // Setup ARIA attributes
    this.setupARIA();
    
    // Listen for preference changes
    this.listenForPreferenceChanges();
    
    logger.info('AccessibilityManager', 'Accessibility features enabled');
  }
  
  /**
   * Create screen reader announcer element
   */
  createAnnouncer() {
    // Create live region for announcements
    this.announcer = document.createElement('div');
    this.announcer.id = 'unified-network-announcer';
    this.announcer.setAttribute('role', 'status');
    this.announcer.setAttribute('aria-live', 'polite');
    this.announcer.setAttribute('aria-atomic', 'true');
    this.announcer.style.position = 'absolute';
    this.announcer.style.left = '-10000px';
    this.announcer.style.width = '1px';
    this.announcer.style.height = '1px';
    this.announcer.style.overflow = 'hidden';
    
    document.body.appendChild(this.announcer);
    
    logger.debug('AccessibilityManager', 'Screen reader announcer created');
  }
  
  /**
   * Announce message to screen readers
   */
  announce(message, priority = 'polite') {
    if (!this.announcer) return;
    
    // Set priority
    this.announcer.setAttribute('aria-live', priority);
    
    // Clear and set new message
    this.announcer.textContent = '';
    setTimeout(() => {
      this.announcer.textContent = message;
      logger.debug('AccessibilityManager', 'Announced', { message, priority });
    }, 100);
  }
  
  /**
   * Announce node focus change
   */
  announceNodeFocus(node) {
    if (!node) return;
    
    const nodeType = node.type || 'node';
    const nodeName = node.name || node.id;
    const effectivePull = node.effectivePull ? node.effectivePull.toFixed(2) : 'unknown';
    
    let message = `Focused on ${nodeType}: ${nodeName}`;
    
    // Add context based on effectivePull
    if (node.effectivePull >= 0.9) {
      message += ', priority connection';
    } else if (node.effectivePull >= 0.6) {
      message += ', actionable proximity';
    } else if (node.effectivePull >= 0.3) {
      message += ', peripheral awareness';
    }
    
    // Add presence information
    if (node.presenceEnergy > 0.6) {
      message += ', currently active';
    } else if (node.presenceEnergy > 0.3) {
      message += ', recently active';
    }
    
    this.announce(message);
    this.focusedNodeId = node.id;
  }
  
  /**
   * Announce state transition
   */
  announceStateTransition(newState, reason) {
    let message = '';
    
    if (newState === 'discovery') {
      message = 'Discovery mode activated';
      if (reason && reason.length > 0) {
        message += `. Triggered by: ${reason.join(', ')}`;
      }
    } else if (newState === 'my-network') {
      message = 'Returned to My Network';
    }
    
    if (message) {
      this.announce(message, 'assertive');
    }
  }
  
  /**
   * Announce action completion
   */
  announceActionCompleted(nodeId, actionType) {
    const actions = {
      'connect': 'Connection established',
      'join-project': 'Joined project',
      'explore-theme': 'Exploring theme'
    };
    
    const message = actions[actionType] || 'Action completed';
    this.announce(message);
  }
  
  /**
   * Check for reduced motion preference
   */
  checkReducedMotion() {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.reducedMotion = mediaQuery.matches;
    
    if (this.reducedMotion) {
      logger.info('AccessibilityManager', 'Reduced motion preference detected');
      this.emit('reduced-motion-enabled');
    }
    
    return this.reducedMotion;
  }
  
  /**
   * Listen for preference changes
   */
  listenForPreferenceChanges() {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    
    mediaQuery.addEventListener('change', (e) => {
      this.reducedMotion = e.matches;
      
      if (this.reducedMotion) {
        logger.info('AccessibilityManager', 'Reduced motion enabled');
        this.emit('reduced-motion-enabled');
      } else {
        logger.info('AccessibilityManager', 'Reduced motion disabled');
        this.emit('reduced-motion-disabled');
      }
    });
  }
  
  /**
   * Setup keyboard navigation
   */
  setupKeyboardNavigation() {
    if (!this.container) return;
    
    // Make container focusable
    this.container.setAttribute('tabindex', '0');
    this.container.setAttribute('role', 'application');
    this.container.setAttribute('aria-label', 'Network discovery graph');
    
    // Add keyboard event listeners
    this.container.addEventListener('keydown', (e) => {
      this.handleKeyDown(e);
    });
    
    this.keyboardNavigationEnabled = true;
    logger.debug('AccessibilityManager', 'Keyboard navigation enabled');
  }
  
  /**
   * Handle keyboard events
   */
  handleKeyDown(event) {
    const key = event.key;
    
    switch (key) {
      case 'Tab':
        // Let browser handle tab navigation
        break;
        
      case 'Enter':
      case ' ':
        // Activate focused node
        if (this.focusedNodeId) {
          event.preventDefault();
          this.emit('node-activated', { nodeId: this.focusedNodeId });
        }
        break;
        
      case 'Escape':
        // Return to My Network
        event.preventDefault();
        this.emit('reset-requested');
        break;
        
      case 'ArrowUp':
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowRight':
        // Navigate between nodes
        event.preventDefault();
        this.emit('navigate-nodes', { direction: key.replace('Arrow', '').toLowerCase() });
        break;
        
      case 'd':
        // Trigger discovery
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          this.emit('discovery-requested');
        }
        break;
    }
  }
  
  /**
   * Setup ARIA attributes
   */
  setupARIA() {
    if (!this.container) return;
    
    // Set container ARIA attributes
    this.container.setAttribute('aria-label', 'Network discovery graph');
    this.container.setAttribute('aria-describedby', 'unified-network-description');
    
    // Create description element
    const description = document.createElement('div');
    description.id = 'unified-network-description';
    description.style.display = 'none';
    description.textContent = 'Interactive network graph showing your connections and discovery opportunities. Use arrow keys to navigate, Enter to select, Escape to return to My Network.';
    
    this.container.parentElement?.appendChild(description);
    
    logger.debug('AccessibilityManager', 'ARIA attributes set');
  }
  
  /**
   * Update node ARIA attributes
   */
  updateNodeARIA(nodeElement, node) {
    if (!nodeElement || !node) return;
    
    // Set role
    nodeElement.setAttribute('role', 'button');
    nodeElement.setAttribute('tabindex', '0');
    
    // Set label
    const label = this.getNodeLabel(node);
    nodeElement.setAttribute('aria-label', label);
    
    // Set state
    if (node.id === this.focusedNodeId) {
      nodeElement.setAttribute('aria-current', 'true');
    } else {
      nodeElement.removeAttribute('aria-current');
    }
    
    // Set pressed state for selected nodes
    if (node.isSelected) {
      nodeElement.setAttribute('aria-pressed', 'true');
    } else {
      nodeElement.setAttribute('aria-pressed', 'false');
    }
  }
  
  /**
   * Get accessible label for node
   */
  getNodeLabel(node) {
    const nodeType = node.type || 'node';
    const nodeName = node.name || node.id;
    const effectivePull = node.effectivePull ? node.effectivePull.toFixed(2) : 'unknown';
    
    let label = `${nodeType}: ${nodeName}`;
    
    // Add state information
    if (node.effectivePull >= 0.9) {
      label += ', priority';
    } else if (node.effectivePull >= 0.6) {
      label += ', actionable';
    }
    
    if (node.presenceEnergy > 0.6) {
      label += ', active now';
    }
    
    return label;
  }
  
  /**
   * Verify color contrast for glow effects
   */
  verifyColorContrast() {
    // WCAG AA requires 4.5:1 contrast ratio for normal text
    // WCAG AAA requires 7:1 contrast ratio for normal text
    
    const glowColors = {
      ambient: '#6666ff',
      relevant: '#4488ff',
      actionable: '#00ffff'
    };
    
    const results = {};
    
    for (const [tier, color] of Object.entries(glowColors)) {
      const contrast = this.calculateContrast(color, '#000000');
      results[tier] = {
        color,
        contrast: contrast.toFixed(2),
        passesAA: contrast >= 4.5,
        passesAAA: contrast >= 7.0
      };
    }
    
    logger.info('AccessibilityManager', 'Color contrast verification', results);
    return results;
  }
  
  /**
   * Calculate contrast ratio between two colors
   */
  calculateContrast(color1, color2) {
    const l1 = this.getLuminance(color1);
    const l2 = this.getLuminance(color2);
    
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    
    return (lighter + 0.05) / (darker + 0.05);
  }
  
  /**
   * Get relative luminance of a color
   */
  getLuminance(hexColor) {
    // Convert hex to RGB
    const rgb = this.hexToRgb(hexColor);
    
    // Convert to sRGB
    const rsRGB = rgb.r / 255;
    const gsRGB = rgb.g / 255;
    const bsRGB = rgb.b / 255;
    
    // Apply gamma correction
    const r = rsRGB <= 0.03928 ? rsRGB / 12.92 : Math.pow((rsRGB + 0.055) / 1.055, 2.4);
    const g = gsRGB <= 0.03928 ? gsRGB / 12.92 : Math.pow((gsRGB + 0.055) / 1.055, 2.4);
    const b = bsRGB <= 0.03928 ? bsRGB / 12.92 : Math.pow((bsRGB + 0.055) / 1.055, 2.4);
    
    // Calculate luminance
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  
  /**
   * Convert hex color to RGB
   */
  hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
  }
  
  /**
   * Get reduced motion preference
   */
  isReducedMotion() {
    return this.reducedMotion;
  }
  
  /**
   * Get animation duration based on reduced motion preference
   */
  getAnimationDuration(normalDuration) {
    return this.reducedMotion ? 0 : normalDuration;
  }
  
  /**
   * Event system
   */
  on(event, handler) {
    if (!this.eventHandlers) this.eventHandlers = {};
    if (!this.eventHandlers[event]) this.eventHandlers[event] = [];
    this.eventHandlers[event].push(handler);
  }
  
  off(event, handler) {
    if (!this.eventHandlers || !this.eventHandlers[event]) return;
    this.eventHandlers[event] = this.eventHandlers[event].filter(h => h !== handler);
  }
  
  emit(event, data) {
    if (!this.eventHandlers || !this.eventHandlers[event]) return;
    this.eventHandlers[event].forEach(handler => handler(data));
  }
  
  /**
   * Cleanup
   */
  destroy() {
    // Remove announcer
    if (this.announcer && this.announcer.parentElement) {
      this.announcer.parentElement.removeChild(this.announcer);
    }
    
    // Remove event listeners
    if (this.container) {
      this.container.removeEventListener('keydown', this.handleKeyDown);
    }
    
    this.eventHandlers = {};
    
    logger.info('AccessibilityManager', 'Destroyed');
  }
}

// Create singleton instance
export const accessibilityManager = new AccessibilityManager();
