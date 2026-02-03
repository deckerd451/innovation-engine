// ================================================================
// Theme Testing Console Helper
// ================================================================
// Run this in the browser console to debug theme/synapse issues
// Usage: Copy and paste this entire script into the browser console

console.log('🔧 Theme Testing Helper Loading...');

// Helper functions for debugging
window.debugThemes = {
  
  // Check if theme tables exist and have data
  async checkThemeTables() {
    if (!window.supabase) {
      console.error('❌ Supabase not available');
      return;
    }

    try {
      console.log('🔍 Checking theme_circles table...');
      const { data: themes, error: themesError } = await window.supabase
        .from('theme_circles')
        .select('*')
        .limit(5);

      if (themesError) {
        console.error('❌ Theme circles error:', themesError);
        console.log('💡 Run THEME_CIRCLES_QUICKFIX.sql to create tables');
        return false;
      }

      console.log('✅ Theme circles table exists');
      console.log(`📊 Found ${themes?.length || 0} themes:`, themes);

      console.log('🔍 Checking theme_participants table...');
      const { data: participants, error: participantsError } = await window.supabase
        .from('theme_participants')
        .select('*')
        .limit(5);

      if (participantsError) {
        console.error('❌ Theme participants error:', participantsError);
        return false;
      }

      console.log('✅ Theme participants table exists');
      console.log(`📊 Found ${participants?.length || 0} participants:`, participants);

      return true;
    } catch (error) {
      console.error('❌ Database check failed:', error);
      return false;
    }
  },

  // Create test themes if none exist
  async createTestThemes() {
    if (!window.supabase) {
      console.error('❌ Supabase not available');
      return;
    }

    try {
      const { data: existing } = await window.supabase
        .from('theme_circles')
        .select('id')
        .limit(1);

      if (existing && existing.length > 0) {
        console.log('ℹ️ Themes already exist, skipping creation');
        return;
      }

      console.log('🎨 Creating test themes...');
      const testThemes = [
        {
          title: 'AI & Machine Learning',
          description: 'Exploring artificial intelligence applications',
          tags: ['ai', 'ml', 'data-science'],
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          origin_type: 'admin',
          activity_score: 5,
          status: 'active'
        },
        {
          title: 'Web Development',
          description: 'Building modern web applications',
          tags: ['web', 'javascript', 'react'],
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          origin_type: 'admin',
          activity_score: 8,
          status: 'active'
        },
        {
          title: 'Startup Ideas',
          description: 'Brainstorming new business concepts',
          tags: ['startup', 'entrepreneurship'],
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          origin_type: 'admin',
          activity_score: 3,
          status: 'active'
        }
      ];

      const { data, error } = await window.supabase
        .from('theme_circles')
        .insert(testThemes)
        .select();

      if (error) {
        console.error('❌ Failed to create themes:', error);
        return;
      }

      console.log('✅ Created test themes:', data);
    } catch (error) {
      console.error('❌ Theme creation failed:', error);
    }
  },

  // Force refresh the synapse
  async refreshSynapse() {
    console.log('🔄 Refreshing synapse...');
    
    if (typeof window.refreshSynapseConnections === 'function') {
      await window.refreshSynapseConnections();
      console.log('✅ Synapse refreshed via refreshSynapseConnections');
    } else if (typeof window.refreshThemeCircles === 'function') {
      await window.refreshThemeCircles();
      console.log('✅ Synapse refreshed via refreshThemeCircles');
    } else {
      console.log('⚠️ No refresh function available, trying page reload...');
      window.location.reload();
    }
  },

  // Check current synapse state
  checkSynapseState() {
    console.log('🧠 Checking synapse state...');
    
    const svg = document.getElementById('synapse-svg');
    if (!svg) {
      console.error('❌ Synapse SVG not found');
      return;
    }

    const nodes = svg.querySelectorAll('.synapse-node');
    const links = svg.querySelectorAll('.synapse-link');
    const themes = svg.querySelectorAll('.theme-circles-group');

    console.log(`📊 Synapse elements:`);
    console.log(`  - Nodes: ${nodes.length}`);
    console.log(`  - Links: ${links.length}`);
    console.log(`  - Theme groups: ${themes.length}`);

    if (window.__synapseStats) {
      console.log('📈 Synapse stats:', window.__synapseStats);
    }

    return {
      nodeCount: nodes.length,
      linkCount: links.length,
      themeCount: themes.length
    };
  },

  // Full diagnostic
  async runFullDiagnostic() {
    console.log('🔬 Running full theme diagnostic...');
    
    const tablesOk = await this.checkThemeTables();
    if (!tablesOk) {
      console.log('💡 Fix: Run the THEME_CIRCLES_QUICKFIX.sql script');
      return;
    }

    await this.createTestThemes();
    
    const synapseState = this.checkSynapseState();
    
    if (synapseState.nodeCount === 0) {
      console.log('⚠️ No nodes found, refreshing synapse...');
      await this.refreshSynapse();
    }

    console.log('✅ Diagnostic complete');
  }
};

// Auto-run diagnostic
console.log('🚀 Running automatic diagnostic...');
window.debugThemes.runFullDiagnostic();

console.log('✅ Theme Testing Helper Ready!');
console.log('📋 Available commands:');
console.log('  - debugThemes.checkThemeTables()');
console.log('  - debugThemes.createTestThemes()');
console.log('  - debugThemes.refreshSynapse()');
console.log('  - debugThemes.checkSynapseState()');
console.log('  - debugThemes.runFullDiagnostic()');