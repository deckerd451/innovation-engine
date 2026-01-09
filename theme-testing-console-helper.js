/**
 * Theme Circles - Browser Console Testing Helper
 *
 * Paste this into your browser console (F12) while on the dashboard
 * to run diagnostic checks and test theme functionality.
 *
 * Usage:
 *   1. Open dashboard.html in browser
 *   2. Press F12 to open DevTools
 *   3. Go to Console tab
 *   4. Copy and paste this entire file
 *   5. Run: ThemeTest.runAll()
 */

window.ThemeTest = {

  /**
   * Run all tests
   */
  async runAll() {
    console.log('%c🧪 Theme Circles Test Suite', 'font-size: 20px; font-weight: bold; color: #00e0ff');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    this.checkDependencies();
    console.log('');

    await this.checkDatabase();
    console.log('');

    this.checkSimulation();
    console.log('');

    this.checkVisuals();
    console.log('');

    this.checkInteractions();
    console.log('');

    console.log('%c✅ Test Suite Complete!', 'font-size: 16px; font-weight: bold; color: #00ff88');
    console.log('Use ThemeTest.help() for individual test commands\n');
  },

  /**
   * Check if required dependencies are loaded
   */
  checkDependencies() {
    console.log('%c1️⃣  Checking Dependencies...', 'font-weight: bold; color: #00e0ff');

    const checks = {
      'Supabase': !!window.supabase,
      'D3.js': typeof d3 !== 'undefined',
      'Synapse Simulation': !!window.synapseSimulation,
      'Theme Admin Modal': typeof window.openThemeAdminModal === 'function',
      'Theme Discovery Modal': typeof window.openThemeDiscoveryModal === 'function',
      'Theme Card Function': typeof window.openThemeCard === 'function'
    };

    let allPass = true;
    for (const [name, pass] of Object.entries(checks)) {
      const icon = pass ? '✅' : '❌';
      console.log(`   ${icon} ${name}`);
      if (!pass) allPass = false;
    }

    if (allPass) {
      console.log('   %c✓ All dependencies loaded', 'color: #00ff88');
    } else {
      console.warn('   ⚠️  Some dependencies missing - features may not work');
    }
  },

  /**
   * Check database connection and theme data
   */
  async checkDatabase() {
    console.log('%c2️⃣  Checking Database...', 'font-weight: bold; color: #00e0ff');

    if (!window.supabase) {
      console.error('   ❌ Supabase not available');
      return;
    }

    try {
      // Check theme_circles table
      const { data: themes, error } = await window.supabase
        .from('theme_circles')
        .select('id, title, status, expires_at, activity_score')
        .eq('status', 'active')
        .gt('expires_at', new Date().toISOString());

      if (error) {
        console.error('   ❌ Database error:', error.message);
        return;
      }

      console.log(`   ✅ Connected to Supabase`);
      console.log(`   📊 Active themes found: ${themes?.length || 0}`);

      if (themes && themes.length > 0) {
        console.table(themes.map(t => ({
          Title: t.title,
          'Activity Score': t.activity_score || 0,
          'Days Left': Math.floor((new Date(t.expires_at) - new Date()) / (1000 * 60 * 60 * 24))
        })));
      } else {
        console.warn('   ⚠️  No active themes found. Run DEMO_THEMES.sql to create test data.');
      }

      // Check participants
      const { data: participants } = await window.supabase
        .from('theme_participants')
        .select('theme_id, community_id, engagement_level');

      console.log(`   👥 Participants found: ${participants?.length || 0}`);

    } catch (err) {
      console.error('   ❌ Error:', err);
    }
  },

  /**
   * Check simulation nodes and theme nodes
   */
  checkSimulation() {
    console.log('%c3️⃣  Checking Simulation...', 'font-weight: bold; color: #00e0ff');

    if (!window.synapseSimulation) {
      console.error('   ❌ Synapse simulation not found');
      return;
    }

    const nodes = window.synapseSimulation.nodes ? window.synapseSimulation.nodes() : [];
    const themeNodes = nodes.filter(n => n.type === 'theme');
    const personNodes = nodes.filter(n => n.type === 'person');

    console.log(`   ✅ Simulation active`);
    console.log(`   📊 Total nodes: ${nodes.length}`);
    console.log(`   🎯 Theme nodes: ${themeNodes.length}`);
    console.log(`   👤 Person nodes: ${personNodes.length}`);

    if (themeNodes.length > 0) {
      console.log('\n   %cTheme Nodes:', 'font-weight: bold');
      console.table(themeNodes.map(t => ({
        Title: t.title || t.name,
        'Activity Score': t.activity_score || 0,
        'Position X': Math.round(t.x || 0),
        'Position Y': Math.round(t.y || 0),
        'Has Velocity': !!(t.vx || t.vy)
      })));
    } else {
      console.warn('   ⚠️  No theme nodes in simulation. Refresh the page or check data loading.');
    }

    // Check links to themes
    const links = window.synapseSimulation.force ? window.synapseSimulation.force('link')?.links() : [];
    const themeLinks = links?.filter(l =>
      l.status === 'theme-participant' ||
      (typeof l.target === 'object' && l.target?.type === 'theme') ||
      (typeof l.source === 'object' && l.source?.type === 'theme')
    );

    console.log(`   🔗 Theme-participant links: ${themeLinks?.length || 0}`);
  },

  /**
   * Check visual rendering
   */
  checkVisuals() {
    console.log('%c4️⃣  Checking Visuals...', 'font-weight: bold; color: #00e0ff');

    const themeCircles = document.querySelectorAll('.theme-circle');
    const themeCirclesGroup = document.querySelector('.theme-circles');

    console.log(`   📊 Theme circle elements: ${themeCircles.length}`);
    console.log(`   ✅ Theme circles group: ${themeCirclesGroup ? 'Found' : 'Not found'}`);

    if (themeCircles.length > 0) {
      console.log('   %c✓ Themes are rendered on canvas', 'color: #00ff88');

      // Check if they have proper attributes
      const firstTheme = themeCircles[0];
      const hasTransform = firstTheme.getAttribute('transform');
      console.log(`   📍 Positioned: ${hasTransform ? 'Yes' : 'No'}`);

    } else {
      console.warn('   ⚠️  No theme circle elements found in DOM');
      console.log('   💡 Check if themes are loaded in simulation (test #3)');
    }

    // Check SVG defs
    const glowFilter = document.querySelector('#glow');
    console.log(`   ✨ Glow filter defined: ${glowFilter ? 'Yes' : 'No'}`);
  },

  /**
   * Check interaction handlers
   */
  checkInteractions() {
    console.log('%c5️⃣  Checking Interactions...', 'font-weight: bold; color: #00e0ff');

    const funcs = {
      'openThemeCard': window.openThemeCard,
      'openThemeAdminModal': window.openThemeAdminModal,
      'openThemeDiscoveryModal': window.openThemeDiscoveryModal,
      'closeThemeAdminModal': window.closeThemeAdminModal,
      'closeThemeDiscoveryModal': window.closeThemeDiscoveryModal
    };

    for (const [name, func] of Object.entries(funcs)) {
      const exists = typeof func === 'function';
      const icon = exists ? '✅' : '❌';
      console.log(`   ${icon} ${name}()`);
    }

    // Check event listeners on theme circles
    const themeCircles = document.querySelectorAll('.theme-circle');
    if (themeCircles.length > 0) {
      console.log(`   🖱️  Event listeners attached to ${themeCircles.length} theme(s)`);
    }
  },

  /**
   * List all theme nodes with details
   */
  listThemes() {
    const nodes = window.synapseSimulation?.nodes ? window.synapseSimulation.nodes() : [];
    const themes = nodes.filter(n => n.type === 'theme');

    if (themes.length === 0) {
      console.warn('No theme nodes found in simulation');
      return [];
    }

    console.log(`%c🎯 ${themes.length} Theme Nodes`, 'font-size: 16px; font-weight: bold; color: #00e0ff');
    console.table(themes.map(t => ({
      ID: t.id,
      Title: t.title || t.name,
      Tags: (t.tags || []).join(', '),
      'Activity Score': t.activity_score || 0,
      Status: t.activity_score >= 5 ? 'Established ●' : 'Emerging ○',
      'Expires': t.expires_at ? new Date(t.expires_at).toLocaleDateString() : 'N/A',
      X: Math.round(t.x || 0),
      Y: Math.round(t.y || 0)
    })));

    return themes;
  },

  /**
   * Test opening a theme card
   */
  testOpenTheme(themeIndex = 0) {
    const themes = this.listThemes();
    if (themes.length === 0) {
      console.error('No themes available to test');
      return;
    }

    const theme = themes[themeIndex];
    console.log(`%cOpening theme: ${theme.title}`, 'color: #00e0ff; font-weight: bold');

    if (typeof window.openThemeCard === 'function') {
      window.openThemeCard(theme);
      console.log('✅ Theme card should be visible now');
    } else {
      console.error('❌ openThemeCard function not found');
    }
  },

  /**
   * Test admin modal
   */
  testAdminModal() {
    console.log('%cTesting Admin Modal...', 'color: #00e0ff; font-weight: bold');

    if (typeof window.openThemeAdminModal === 'function') {
      window.openThemeAdminModal();
      console.log('✅ Admin modal should be visible now');
      console.log('💡 Use window.closeThemeAdminModal() to close');
    } else {
      console.error('❌ openThemeAdminModal function not found');
      console.log('Make sure theme-admin.js is loaded');
    }
  },

  /**
   * Test discovery modal
   */
  testDiscoveryModal() {
    console.log('%cTesting Discovery Modal...', 'color: #00e0ff; font-weight: bold');

    if (typeof window.openThemeDiscoveryModal === 'function') {
      window.openThemeDiscoveryModal();
      console.log('✅ Discovery modal should be visible now');
      console.log('💡 Use window.closeThemeDiscoveryModal() to close');
    } else {
      console.error('❌ openThemeDiscoveryModal function not found');
      console.log('Make sure theme-discovery.js is loaded');
    }
  },

  /**
   * Force refresh themes from database
   */
  async refreshThemes() {
    console.log('%cRefreshing themes from database...', 'color: #00e0ff; font-weight: bold');

    if (typeof window.refreshSynapseConnections === 'function') {
      await window.refreshSynapseConnections();
      console.log('✅ Synapse refreshed');
    } else if (window.synapseSimulation?.restart) {
      window.synapseSimulation.restart();
      console.log('✅ Simulation restarted');
    } else {
      console.warn('⚠️  No refresh function found. Try reloading the page.');
    }
  },

  /**
   * Get theme by title
   */
  getTheme(titleSearch) {
    const nodes = window.synapseSimulation?.nodes ? window.synapseSimulation.nodes() : [];
    const theme = nodes.find(n =>
      n.type === 'theme' &&
      (n.title || n.name).toLowerCase().includes(titleSearch.toLowerCase())
    );

    if (theme) {
      console.log('%cFound theme:', 'font-weight: bold; color: #00ff88');
      console.log(theme);
      return theme;
    } else {
      console.warn(`No theme found matching: "${titleSearch}"`);
      return null;
    }
  },

  /**
   * Highlight a theme visually (for debugging)
   */
  highlightTheme(titleSearch) {
    const theme = this.getTheme(titleSearch);
    if (!theme) return;

    // Find the visual element
    const themeElements = document.querySelectorAll('.theme-circle');
    themeElements.forEach(el => {
      const textEl = el.querySelector('text');
      if (textEl && textEl.textContent.includes(theme.title || theme.name)) {
        el.style.filter = 'drop-shadow(0 0 20px #ff00ff)';
        console.log(`✅ Highlighted: ${theme.title}`);

        setTimeout(() => {
          el.style.filter = '';
        }, 3000);
      }
    });
  },

  /**
   * Show help
   */
  help() {
    console.log('%c🧪 Theme Testing Commands', 'font-size: 18px; font-weight: bold; color: #00e0ff');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('%cGeneral Tests:', 'font-weight: bold; color: #00e0ff');
    console.log('  ThemeTest.runAll()                - Run complete test suite');
    console.log('  ThemeTest.checkDependencies()     - Check if modules are loaded');
    console.log('  ThemeTest.checkDatabase()         - Check database connection');
    console.log('  ThemeTest.checkSimulation()       - Check simulation nodes');
    console.log('  ThemeTest.checkVisuals()          - Check rendered elements');
    console.log('  ThemeTest.checkInteractions()     - Check event handlers\n');

    console.log('%cTheme Exploration:', 'font-weight: bold; color: #00e0ff');
    console.log('  ThemeTest.listThemes()            - List all theme nodes');
    console.log('  ThemeTest.getTheme("AI")          - Find theme by title');
    console.log('  ThemeTest.highlightTheme("AI")    - Visually highlight a theme\n');

    console.log('%cInteraction Tests:', 'font-weight: bold; color: #00e0ff');
    console.log('  ThemeTest.testOpenTheme(0)        - Open first theme card');
    console.log('  ThemeTest.testAdminModal()        - Open admin panel');
    console.log('  ThemeTest.testDiscoveryModal()    - Open discovery modal\n');

    console.log('%cUtility:', 'font-weight: bold; color: #00e0ff');
    console.log('  ThemeTest.refreshThemes()         - Reload themes from DB');
    console.log('  ThemeTest.help()                  - Show this help\n');

    console.log('%cDirect Access:', 'font-weight: bold; color: #ffaa00');
    console.log('  window.supabase                   - Database client');
    console.log('  window.synapseSimulation          - D3 force simulation');
    console.log('  window.openThemeCard(theme)       - Open theme details');
    console.log('  window.openThemeAdminModal()      - Open admin interface\n');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }
};

// Auto-run help on load
console.log('\n');
console.log('%c🎯 Theme Testing Helper Loaded!', 'font-size: 16px; font-weight: bold; color: #00ff88');
console.log('%cType: ThemeTest.help() for commands', 'color: #00e0ff');
console.log('%cOr:   ThemeTest.runAll() to run all tests\n', 'color: #00e0ff');
