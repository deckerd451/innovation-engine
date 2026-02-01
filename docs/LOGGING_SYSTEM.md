# Centralized Logging System

## Overview

The CharlestonHacks Innovation Engine now uses a centralized logging utility (`assets/js/logger.js`) to reduce console noise while maintaining strong debuggability and lifecycle visibility.

## Features

### 1. **Environment-Based Gating**

Debug logging is controlled by flags. Full debug logging is enabled when ANY of the following is true:

- `window.appFlags?.debugSignals === true`
- `localStorage.DEBUG === "1"`
- URL contains `?debug=1`

### 2. **Log Levels**

```javascript
log.debug(...)   // Verbose, data-heavy logs (only in debug mode)
log.info(...)    // Lifecycle milestones (always shown, use sparingly)
log.warn(...)    // Warnings (always shown)
log.error(...)   // Errors (always shown)
```

### 3. **Log-Once**

Prevents repeated identical messages:

```javascript
log.once('unique-key', 'This message prints only once per session');
```

### 4. **Throttled Logs**

Limits repeated logs to a maximum frequency:

```javascript
log.throttle('key', 5000, 'This prints max once per 5 seconds');
```

### 5. **Module Load Tracking**

Automatically detects and warns about duplicate module loads:

```javascript
log.moduleLoad('my-module.js');
// If loaded twice, shows: ⚠️ Module "my-module.js" loaded 2 times!
```

### 6. **Performance Timing**

```javascript
const start = performance.now();
// ... do work ...
const end = performance.now();
log.perf('Operation name', start, end);
// Output: ⚡ Operation name: 42.50ms
```

### 7. **Debug Groups**

Collapsible debug-only log groups:

```javascript
log.debugGroup('Detailed Analysis', () => {
  log.debug('Step 1:', data1);
  log.debug('Step 2:', data2);
  log.debug('Step 3:', data3);
});
```

## Usage

### In Module Scripts

```javascript
// At the top of your module
const log = window.log || console;

// Track module load
log.moduleLoad('my-module.js');

// Use throughout your code
log.debug('Detailed data:', complexObject);
log.info('✅ Module initialized');
log.warn('⚠️ Deprecated feature used');
log.error('❌ Operation failed:', error);
```

### Enabling Debug Mode

**From Console:**
```javascript
log.enableDebug();  // Enables debug mode
log.disableDebug(); // Disables debug mode
```

**From URL:**
```
https://yoursite.com/dashboard.html?debug=1
```

**From localStorage:**
```javascript
localStorage.setItem('DEBUG', '1');
```

## Migration Guide

### Before (Old Pattern)

```javascript
console.log('Loading data...');
console.log('Data:', data);
console.log('✅ Data loaded');
console.error('Error:', error);
```

### After (New Pattern)

```javascript
const log = window.log || console;

log.debug('Loading data...');
log.debug('Data:', data);
log.info('✅ Data loaded');
log.error('Error:', error);
```

## Best Practices

### 1. **Use Appropriate Log Levels**

- **debug**: Verbose data dumps, loop iterations, detailed state
- **info**: Major milestones only (app start, auth ready, module initialized)
- **warn**: Recoverable issues, deprecation notices
- **error**: Actual errors that need attention

### 2. **Reduce Info Logs**

Only use `log.info()` for truly important lifecycle events:

✅ **Good:**
```javascript
log.info('✅ Dashboard loaded successfully');
log.info('🚀 CharlestonHacks Innovation Engine starting...');
```

❌ **Bad:**
```javascript
log.info('Loading stats...');
log.info('Stats loaded');
log.info('Loading connections...');
log.info('Connections loaded');
```

Use `log.debug()` for these instead.

### 3. **Use Log-Once for Repeated Messages**

✅ **Good:**
```javascript
log.once('dashboard-listeners', '✅ Dashboard event listeners registered');
```

❌ **Bad:**
```javascript
// This might log multiple times if function is called repeatedly
log.info('✅ Dashboard event listeners registered');
```

### 4. **Use Throttle for Polling/Retry Loops**

✅ **Good:**
```javascript
function checkSynapseReady() {
  if (!window.isSynapseReady()) {
    log.throttle('synapse-wait', 5000, '⏳ Waiting for Synapse...');
    setTimeout(checkSynapseReady, 100);
  }
}
```

❌ **Bad:**
```javascript
function checkSynapseReady() {
  if (!window.isSynapseReady()) {
    log.debug('⏳ Waiting for Synapse...'); // Logs 10x per second!
    setTimeout(checkSynapseReady, 100);
  }
}
```

### 5. **Track Module Loads**

At the top of each module:

```javascript
const log = window.log || console;
log.moduleLoad('my-module.js');
```

This helps detect duplicate script tags.

## Production vs Debug Mode

### Production Mode (Default)

- `debug` logs are suppressed
- `info` logs show major milestones only
- `warn` and `error` always show
- Clean, minimal console output

### Debug Mode

- All log levels shown
- Detailed data dumps visible
- Full object inspection
- Useful for troubleshooting

## Refactored Modules

The following modules have been updated to use the centralized logger:

- ✅ `assets/js/logger.js` (new)
- ✅ `main.js`
- ✅ `auth.js`
- ✅ `dashboard.js`

### Remaining Modules to Refactor

The following modules still need to be updated:

- `assets/js/synapse/core.js`
- `assets/js/synapse-init-helper.js`
- `assets/js/node-panel.js`
- `assets/js/admin-analytics.js`
- `assets/js/notification-system.js`
- `assets/js/searchEngine.js`
- `assets/js/database-integration.js`
- `assets/js/suggestions/index.js`
- Other modules in `assets/js/`

## Testing

### Test Debug Mode

1. Open console
2. Run: `log.enableDebug()`
3. Verify debug logs appear
4. Run: `log.disableDebug()`
5. Verify debug logs disappear

### Test Log-Once

```javascript
log.once('test', 'This should appear once');
log.once('test', 'This should NOT appear');
```

### Test Throttle

```javascript
for (let i = 0; i < 100; i++) {
  log.throttle('test', 1000, 'Throttled message', i);
}
// Should only log once per second
```

## Troubleshooting

### Debug logs not showing

1. Check if debug mode is enabled: `log.isDebugMode()`
2. Enable it: `log.enableDebug()`
3. Or add `?debug=1` to URL

### Too much console noise

1. Ensure modules use `log.debug()` instead of `log.info()`
2. Use `log.once()` for repeated messages
3. Use `log.throttle()` for polling loops

### Module loaded multiple times warning

This indicates duplicate `<script>` tags in HTML. Check your HTML file for duplicate imports.

## Future Enhancements

Potential improvements for the logging system:

1. **Remote logging**: Send errors to a logging service
2. **Log filtering**: Filter by module or category
3. **Log export**: Download logs as JSON
4. **Performance monitoring**: Automatic timing for all operations
5. **Log levels from URL**: `?logLevel=debug`
