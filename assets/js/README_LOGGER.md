# Centralized Logger Module

## Quick Start

```javascript
// At the top of your module
const log = window.log || console;
log.moduleLoad('my-module.js');

// Use throughout your code
log.debug('Verbose data:', data);
log.info('✅ Module initialized');
log.warn('⚠️ Warning message');
log.error('❌ Error occurred:', error);
```

## API Reference

### Log Levels

#### `log.debug(...args)`
Verbose, data-heavy logs. Only shown when debug mode is enabled.

```javascript
log.debug('Loading data from API...');
log.debug('Response:', response);
log.debug('Parsed data:', parsedData);
```

#### `log.info(...args)`
Lifecycle milestones. Always shown, but use sparingly for major events only.

```javascript
log.info('✅ Application started');
log.info('✅ User authenticated');
log.info('✅ Dashboard loaded');
```

#### `log.warn(...args)`
Warnings. Always shown.

```javascript
log.warn('⚠️ Deprecated API used');
log.warn('⚠️ Rate limit approaching');
```

#### `log.error(...args)`
Errors. Always shown.

```javascript
log.error('❌ Failed to load data:', error);
log.error('❌ Network request failed');
```

### Special Functions

#### `log.once(key, ...args)`
Log once per session. Prevents repeated identical messages.

```javascript
log.once('init-complete', '✅ Initialization complete');
// If called again, won't log
```

#### `log.throttle(key, intervalMs, ...args)`
Throttled logging. Limits repeated logs to maximum frequency.

```javascript
// In a polling loop
function checkStatus() {
  if (!ready) {
    log.throttle('status-check', 5000, '⏳ Waiting for service...');
    setTimeout(checkStatus, 100);
  }
}
// Logs max once per 5 seconds
```

#### `log.moduleLoad(moduleName)`
Track module loading and warn on duplicates.

```javascript
log.moduleLoad('my-module.js');
// If loaded twice: ⚠️ Module "my-module.js" loaded 2 times!
```

#### `log.perf(label, startTime, endTime)`
Performance timing helper.

```javascript
const start = performance.now();
// ... do work ...
log.perf('Operation', start, performance.now());
// Output: ⚡ Operation: 42.50ms
```

#### `log.debugGroup(groupLabel, fn)`
Grouped debug logs (only shown in debug mode).

```javascript
log.debugGroup('Data Analysis', () => {
  log.debug('Total items:', items.length);
  log.debug('Filtered items:', filtered.length);
  log.debug('Average value:', average);
});
```

### Utility Methods

#### `log.isDebugMode()`
Check if debug mode is currently enabled.

```javascript
if (log.isDebugMode()) {
  // Do expensive debug operations
}
```

#### `log.enableDebug()`
Enable debug mode programmatically.

```javascript
log.enableDebug();
// Sets localStorage.DEBUG = "1"
```

#### `log.disableDebug()`
Disable debug mode programmatically.

```javascript
log.disableDebug();
// Removes localStorage.DEBUG
```

## Debug Mode Activation

Debug mode is enabled when **ANY** of these conditions are true:

1. **URL Parameter:** `?debug=1`
   ```
   https://yoursite.com/dashboard.html?debug=1
   ```

2. **localStorage Flag:** `DEBUG === "1"`
   ```javascript
   localStorage.setItem('DEBUG', '1');
   ```

3. **Window Flag:** `window.appFlags?.debugSignals === true`
   ```javascript
   window.appFlags = { debugSignals: true };
   ```

## Usage Patterns

### Pattern 1: Module Initialization

```javascript
const log = window.log || console;
log.moduleLoad('my-module.js');

function initModule() {
  if (initialized) {
    log.once('already-init', '⚠️ Module already initialized');
    return;
  }
  
  log.debug('Initializing module...');
  // ... initialization code ...
  log.info('✅ Module initialized');
  
  initialized = true;
}
```

### Pattern 2: Data Loading

```javascript
async function loadData() {
  log.debug('Loading data from API...');
  
  try {
    const response = await fetch('/api/data');
    const data = await response.json();
    
    log.debug('Received data:', data);
    log.info('✅ Data loaded successfully');
    
    return data;
  } catch (error) {
    log.error('❌ Failed to load data:', error);
    throw error;
  }
}
```

### Pattern 3: Polling Loop

```javascript
function pollForReady() {
  if (!isReady()) {
    log.throttle('poll-ready', 5000, '⏳ Waiting for system...');
    setTimeout(pollForReady, 100);
    return;
  }
  
  log.info('✅ System ready');
  onReady();
}
```

### Pattern 4: Performance Monitoring

```javascript
async function processData(data) {
  const start = performance.now();
  
  log.debug('Processing', data.length, 'items...');
  
  // ... processing ...
  
  log.perf('Data processing', start, performance.now());
  log.info('✅ Processing complete');
}
```

### Pattern 5: Detailed Analysis

```javascript
function analyzeResults(results) {
  log.debugGroup('Results Analysis', () => {
    log.debug('Total results:', results.length);
    log.debug('Successful:', results.filter(r => r.success).length);
    log.debug('Failed:', results.filter(r => !r.success).length);
    log.debug('Average time:', calculateAverage(results));
  });
}
```

## Best Practices

### DO ✅

1. **Use debug for verbose logs**
   ```javascript
   log.debug('Detailed state:', state);
   ```

2. **Use info for major milestones only**
   ```javascript
   log.info('✅ Application started');
   ```

3. **Use once for repeated messages**
   ```javascript
   log.once('key', 'Message');
   ```

4. **Use throttle for polling**
   ```javascript
   log.throttle('key', 5000, 'Waiting...');
   ```

5. **Track module loads**
   ```javascript
   log.moduleLoad('module.js');
   ```

### DON'T ❌

1. **Don't use info for verbose logs**
   ```javascript
   // ❌ Bad
   log.info('Loading item 1...');
   log.info('Loading item 2...');
   
   // ✅ Good
   log.debug('Loading item 1...');
   log.debug('Loading item 2...');
   ```

2. **Don't log in tight loops without throttling**
   ```javascript
   // ❌ Bad
   for (let i = 0; i < 1000; i++) {
     log.debug('Processing', i);
   }
   
   // ✅ Good
   log.debug('Processing', items.length, 'items...');
   for (let i = 0; i < 1000; i++) {
     // ... process ...
   }
   log.debug('Processing complete');
   ```

3. **Don't use styled console.log**
   ```javascript
   // ❌ Bad
   console.log("%c🎯 Module", "color:#0ff; font-weight: bold");
   
   // ✅ Good
   log.info('🎯 Module initialized');
   ```

## Migration from console.*

| Old | New |
|-----|-----|
| `console.log('data:', x)` | `log.debug('data:', x)` |
| `console.log('✅ Done')` | `log.info('✅ Done')` |
| `console.warn(...)` | `log.warn(...)` |
| `console.error(...)` | `log.error(...)` |
| `console.group(...)` | `log.debugGroup(...)` |

## Troubleshooting

### Debug logs not showing

**Problem:** Debug logs don't appear in console.

**Solution:**
```javascript
// Check debug mode status
log.isDebugMode(); // Should return true

// Enable debug mode
log.enableDebug();

// Or add to URL
?debug=1
```

### Too much console noise

**Problem:** Too many logs in production.

**Solution:**
1. Change verbose logs to `log.debug()`
2. Use `log.once()` for repeated messages
3. Use `log.throttle()` for polling loops
4. Use `log.info()` only for major milestones

### Module loaded multiple times

**Problem:** Warning about duplicate module loads.

**Solution:** Check HTML for duplicate `<script>` tags.

```html
<!-- ❌ Bad - duplicate -->
<script src="module.js"></script>
<script src="module.js"></script>

<!-- ✅ Good - single -->
<script src="module.js"></script>
```

## Implementation Details

### Load Order

The logger **must** load before any other scripts:

```html
<!-- ✅ Correct order -->
<script src="assets/js/logger.js"></script>
<script src="assets/js/other-module.js"></script>

<!-- ❌ Wrong order -->
<script src="assets/js/other-module.js"></script>
<script src="assets/js/logger.js"></script>
```

### Fallback

Always include fallback to console:

```javascript
const log = window.log || console;
```

This ensures code works even if logger fails to load.

### Browser Compatibility

- ✅ Chrome/Edge (Chromium)
- ✅ Firefox
- ✅ Safari
- ✅ All modern browsers

## Examples

See `LOGGING_EXAMPLES.md` for comprehensive before/after examples.

## Documentation

- **Full Documentation:** `docs/LOGGING_SYSTEM.md`
- **Quick Reference:** `LOGGING_QUICK_REFERENCE.md`
- **Examples:** `LOGGING_EXAMPLES.md`
- **Implementation Summary:** `LOGGING_IMPLEMENTATION_SUMMARY.md`

## Support

For questions or issues:
1. Check documentation files
2. Review examples
3. Test with debug mode enabled
4. Check browser console for errors
