/**
 * Startup Metrics Logger (Dev Only)
 * 
 * Tracks and reports database calls, realtime channels, and query patterns
 * during the first 10 seconds after page load.
 * 
 * @module startupMetrics
 */

(() => {
  'use strict';

  // Only run in dev mode
  if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return;
  }

  const GUARD = '__CH_STARTUP_METRICS_LOADED__';
  if (window[GUARD]) {
    return;
  }
  window[GUARD] = true;

  // ============================================================================
  // STATE
  // ============================================================================

  const metrics = {
    dbCalls: [],
    realtimeChannels: [],
    communityEmailQueries: [],
    authGetUserCalls: 0,
    startTime: Date.now()
  };

  let isTracking = true;
  let reportTimer = null;

  // ============================================================================
  // TRACKING
  // ============================================================================

  /**
   * Track a database call
   */
  function trackDBCall(table, operation, details = {}) {
    if (!isTracking) return;

    metrics.dbCalls.push({
      table,
      operation,
      details,
      timestamp: Date.now() - metrics.startTime
    });

    // Check for forbidden patterns
    if (table === 'community' && details.column === 'email') {
      metrics.communityEmailQueries.push({
        timestamp: Date.now() - metrics.startTime,
        stack: new Error().stack
      });
      console.error('🚨 FORBIDDEN: community query by email detected!', details);
    }
  }

  /**
   * Track a realtime channel creation
   */
  function trackRealtimeChannel(channelName) {
    if (!isTracking) return;

    metrics.realtimeChannels.push({
      name: channelName,
      timestamp: Date.now() - metrics.startTime
    });
  }

  /**
   * Track auth.getUser() call
   */
  function trackAuthGetUser() {
    if (!isTracking) return;
    metrics.authGetUserCalls++;
  }

  // ============================================================================
  // REPORTING
  // ============================================================================

  /**
   * Generate and print metrics report
   */
  function generateReport() {
    isTracking = false;

    const elapsed = Date.now() - metrics.startTime;
    
    console.log('\n' + '='.repeat(80));
    console.log('📊 STARTUP METRICS REPORT (t=' + (elapsed / 1000).toFixed(1) + 's)');
    console.log('='.repeat(80));

    // Total DB calls
    console.log('\n📈 Database Calls: ' + metrics.dbCalls.length);
    
    // Group by table
    const byTable = {};
    metrics.dbCalls.forEach(call => {
      byTable[call.table] = (byTable[call.table] || 0) + 1;
    });
    
    console.log('\n📋 Calls by Table:');
    Object.entries(byTable)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([table, count]) => {
        console.log(`  ${table}: ${count}`);
      });

    // Top query keys
    const queryKeys = {};
    metrics.dbCalls.forEach(call => {
      const key = `${call.table}.${call.operation}`;
      queryKeys[key] = (queryKeys[key] || 0) + 1;
    });
    
    console.log('\n🔑 Top 5 Query Keys:');
    Object.entries(queryKeys)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([key, count]) => {
        console.log(`  ${key}: ${count}`);
      });

    // Realtime channels
    console.log('\n🔌 Realtime Channels: ' + metrics.realtimeChannels.length);
    if (metrics.realtimeChannels.length > 0) {
      console.log('  Channels:', metrics.realtimeChannels.map(c => c.name).join(', '));
    }

    // Auth calls
    console.log('\n🔐 auth.getUser() Calls: ' + metrics.authGetUserCalls);

    // Forbidden patterns
    console.log('\n🚨 Community Email Queries: ' + metrics.communityEmailQueries.length);
    if (metrics.communityEmailQueries.length > 0) {
      console.error('  ❌ FAIL: Found forbidden community-by-email queries!');
      metrics.communityEmailQueries.forEach((query, i) => {
        console.error(`  Query ${i + 1} at t=${(query.timestamp / 1000).toFixed(1)}s`);
      });
    } else {
      console.log('  ✅ PASS: No forbidden queries detected');
    }

    // Timeline
    console.log('\n⏱️  Timeline (first 5 seconds):');
    const timeline = metrics.dbCalls
      .filter(call => call.timestamp < 5000)
      .slice(0, 20);
    
    timeline.forEach(call => {
      const time = (call.timestamp / 1000).toFixed(2);
      console.log(`  ${time}s: ${call.table}.${call.operation}`);
    });

    // Summary
    console.log('\n📊 Summary:');
    console.log(`  Total DB calls: ${metrics.dbCalls.length}`);
    console.log(`  Realtime channels: ${metrics.realtimeChannels.length}`);
    console.log(`  auth.getUser() calls: ${metrics.authGetUserCalls}`);
    console.log(`  Forbidden queries: ${metrics.communityEmailQueries.length}`);
    
    // Pass/Fail
    const passed = metrics.communityEmailQueries.length === 0;
    console.log('\n' + (passed ? '✅ PASS' : '❌ FAIL'));
    
    console.log('='.repeat(80) + '\n');

    // Store for external access
    window.__startupMetrics = metrics;
  }

  /**
   * Schedule report generation
   */
  function scheduleReport() {
    // Generate report at t=10s
    reportTimer = setTimeout(() => {
      generateReport();
    }, 10000);

    console.log('📊 Startup metrics tracking enabled (report at t=10s)');
  }

  // ============================================================================
  // INTERCEPTION (Dev Only)
  // ============================================================================

  /**
   * Intercept Supabase calls to track metrics
   */
  function setupInterception() {
    // Intercept supabase.from()
    const originalFrom = window.supabase?.from;
    if (originalFrom) {
      window.supabase.from = function(table) {
        const query = originalFrom.call(this, table);
        
        // Intercept .select()
        const originalSelect = query.select;
        query.select = function(...args) {
          trackDBCall(table, 'select', { args });
          return originalSelect.call(this, ...args);
        };
        
        // Intercept .insert()
        const originalInsert = query.insert;
        query.insert = function(...args) {
          trackDBCall(table, 'insert', { args });
          return originalInsert.call(this, ...args);
        };
        
        // Intercept .update()
        const originalUpdate = query.update;
        query.update = function(...args) {
          trackDBCall(table, 'update', { args });
          return originalUpdate.call(this, ...args);
        };
        
        // Intercept .delete()
        const originalDelete = query.delete;
        query.delete = function(...args) {
          trackDBCall(table, 'delete', { args });
          return originalDelete.call(this, ...args);
        };
        
        // Intercept .eq() to catch email queries
        const originalEq = query.eq;
        query.eq = function(column, value) {
          if (column === 'email') {
            trackDBCall(table, 'eq', { column, value });
          }
          return originalEq.call(this, column, value);
        };
        
        return query;
      };
    }

    // Intercept auth.getUser()
    const originalGetUser = window.supabase?.auth?.getUser;
    if (originalGetUser) {
      window.supabase.auth.getUser = function(...args) {
        trackAuthGetUser();
        return originalGetUser.call(this, ...args);
      };
    }

    // Intercept channel creation
    const originalChannel = window.supabase?._internalChannel || window.supabase?.channel;
    if (originalChannel) {
      const interceptChannel = function(name) {
        trackRealtimeChannel(name);
        return originalChannel.call(this, name);
      };
      
      if (window.supabase._internalChannel) {
        window.supabase._internalChannel = interceptChannel;
      } else {
        window.supabase.channel = interceptChannel;
      }
    }

    console.log('🔍 Startup metrics interception enabled');
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  // Wait for supabase to be available
  const checkSupabase = setInterval(() => {
    if (window.supabase) {
      clearInterval(checkSupabase);
      setupInterception();
      scheduleReport();
    }
  }, 100);

  // Cleanup after 15 seconds
  setTimeout(() => {
    clearInterval(checkSupabase);
    if (reportTimer) {
      clearTimeout(reportTimer);
    }
  }, 15000);

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  window.startupMetrics = {
    generateReport,
    getMetrics: () => ({ ...metrics }),
    isTracking: () => isTracking
  };

  console.log('✅ Startup metrics module loaded (dev only)');

})();
